'use strict';

const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');
const { isDeepStrictEqual } = require('util');
const { mergeProcessCovs } = require('@bcoe/v8-coverage');
const { createCoverageMap } = require('istanbul-lib-coverage');
const v8ToIstanbul = require('v8-to-istanbul');

function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function pathIdentity(file) {
  const resolved = file.startsWith('file://') ? fileURLToPath(file) : file;
  return path.resolve(resolved).replace(/\\/g, '/').toLowerCase();
}

function collectRawProfiles(shardProfiles) {
  const processProfiles = [];
  const transforms = new Map();
  const sourcePaths = new Map();

  for (const shard of shardProfiles) {
    if (!shard || shard.schemaVersion !== 1 || !Array.isArray(shard.testProfiles)) {
      throw new Error('Arquivo de perfis V8 tem schema inválido.');
    }
    if (!shard.transforms || typeof shard.transforms !== 'object' || Array.isArray(shard.transforms)) {
      throw new Error('Tabela de transformações V8 ausente/inválida.');
    }
    for (const [url, transform] of Object.entries(shard.transforms)) {
      if (typeof transform.code !== 'string' || typeof transform.originalCode !== 'string' ||
          !Number.isFinite(transform.wrapperLength)) {
        throw new Error('Transformação V8 ausente/inválida para ' + url + '.');
      }
      const identity = pathIdentity(url);
      const priorPath = sourcePaths.get(identity);
      if (priorPath && priorPath !== url) {
        throw new Error('URLs de transformação diferem apenas por capitalização/caminho normalizado: ' + priorPath + ' <> ' + url);
      }
      sourcePaths.set(identity, url);
      const previous = transforms.get(url);
      if (previous && !isDeepStrictEqual(previous.transform, transform)) {
        throw new Error('Transformação divergente entre shards para ' + url + '.');
      }
      if (!previous) transforms.set(url, { transform });
    }
    for (const test of shard.testProfiles) {
      if (!Array.isArray(test.profiles)) throw new Error('Teste possui perfis V8 inválidos.');
      processProfiles.push({ result: test.profiles });
      for (const result of test.profiles) {
        if (!result || typeof result.url !== 'string' || !Array.isArray(result.functions)) {
          throw new Error('Script coverage V8 inválido.');
        }
        const identity = pathIdentity(result.url);
        const priorPath = sourcePaths.get(identity);
        if (priorPath && priorPath !== result.url) {
          throw new Error('URLs V8 diferem apenas por capitalização/caminho normalizado: ' + priorPath + ' <> ' + result.url);
        }
        sourcePaths.set(identity, result.url);
      }
    }
  }
  return { processProfiles, transforms, sourcePaths };
}

async function convertMergedV8Profiles(shardProfiles) {
  const { processProfiles, transforms } = collectRawProfiles(shardProfiles);
  const mergedProfiles = mergeProcessCovs(processProfiles);

  const coverageMap = createCoverageMap({});
  for (const profile of mergedProfiles.result) {
    const url = profile.url;
    const captured = transforms.get(url)?.transform;
    const sources = captured && captured.sourceMapContent
      ? {
          originalSource: captured.originalCode,
          source: captured.code,
          sourceMap: { sourcemap: { file: url, ...captured.sourceMapContent } },
        }
      : { source: fs.readFileSync(url.startsWith('file://') ? fileURLToPath(url) : url, 'utf8') };
    const converter = v8ToIstanbul(url, captured?.wrapperLength ?? 0, sources);
    await converter.load();
    converter.applyCoverage(profile.functions);
    coverageMap.merge(converter.toIstanbul());
  }
  return coverageMap;
}

async function mergeV8CoverageMaps(shardProfiles, coverageFiles, shardCoverageMaps) {
  if (!Array.isArray(shardCoverageMaps) || shardCoverageMaps.length !== shardProfiles.length) {
    throw new Error('É necessário um mapa Istanbul correspondente a cada shard V8.');
  }
  const { sourcePaths } = collectRawProfiles(shardProfiles);
  const coverageMap = await convertMergedV8Profiles(shardProfiles, []);
  const rawCoverageFiles = new Set(coverageMap.files().map(pathIdentity));
  const fallbackFiles = coverageFiles.filter((file) => !rawCoverageFiles.has(pathIdentity(file)));

  for (const file of fallbackFiles) {
    const candidates = shardCoverageMaps.map((map) => map[file]);
    if (candidates.some((entry) => !entry)) {
      throw new Error('Mapa de cobertura fallback ausente para arquivo nunca executado: ' + file);
    }
    const serialized = stableJson(candidates[0]);
    if (candidates.some((entry) => stableJson(entry) !== serialized)) {
      throw new Error('Cobertura vazia diverge entre shards para arquivo sem perfil V8: ' + file);
    }
    if (sourcePaths.has(pathIdentity(file))) {
      throw new Error('Arquivo foi classificado simultaneamente como perfil V8 e fallback: ' + file);
    }
    coverageMap.addFileCoverage(candidates[0]);
  }

  const expected = new Set(coverageFiles.map(pathIdentity));
  const actual = new Set(coverageMap.files().map(pathIdentity));
  if (expected.size !== actual.size || [...expected].some((file) => !actual.has(file))) {
    throw new Error('União entre perfis V8 e arquivos sem execução diverge do inventário instrumentado.');
  }
  return coverageMap;
}

module.exports = {
  collectRawProfiles,
  convertMergedV8Profiles,
  mergeV8CoverageMaps,
  stableJson,
};
