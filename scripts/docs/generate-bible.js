'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  OUTPUT_REL,
  isTestOrGate,
  language,
  escapeHtml,
  declaredSymbol,
  executable,
  loadFiles,
} = require('./bible/project-files');
const { explainLine } = require('./bible/explanations');
const { buildEvidence, statusForLine } = require('./bible/test-evidence');

const OUTPUT = path.join(ROOT, OUTPUT_REL);

function roleForFile(relative) {
  if (isTestOrGate(relative)) return 'teste/gate de validação';
  if (relative.startsWith('extension/')) return 'runtime da extensão';
  if (relative.startsWith('.github/workflows/')) return 'automação/CI';
  if (relative.startsWith('scripts/')) return 'tooling do repositório';
  return 'configuração canônica';
}

function buildBible(files) {
  const evidence = buildEvidence(files);
  const totalSourceLines = files.reduce((sum, file) => sum + file.lines.length, 0);
  const totalSourceBytes = files.reduce(
    (sum, file) => sum + Buffer.byteLength(file.content, 'utf8'),
    0
  );

  const out = [];
  let executableLines = 0;
  let directOrAssociatedEvidence = 0;
  let fileOnlyEvidence = 0;
  let missingProof = 0;

  out.push('# Bíblia da Extensão — Manga Translator');
  out.push('');
  out.push('> Documento canônico de engenharia gerado a partir do estado real do repositório.');
  out.push('> Esta Bíblia reproduz e comenta o corpus elegível linha por linha. Ela existe para manutenção, auditoria, onboarding e prevenção de regressões; o código-fonte continua sendo a fonte executável.');
  out.push('');
  out.push('## Como ler');
  out.push('');
  out.push('- Cada linha do projeto aparece literalmente, em ordem, seguida por um comentário sobre **o que faz**, **como faz**, **por que a forma atual é defensável** e **por que uma alternativa simplista tende a ser pior**.');
  out.push('- Cada linha executável/configuracional recebe um status de teste.');
  out.push('- Quando não existe prova rastreável específica, a própria linha recebe o aviso extra solicitado: **SEM TESTE PROBATÓRIO RASTREÁVEL** ou **arquivo alcançado por teste, mas sem prova específica desta linha**.');
  out.push('- O status é deliberadamente conservador: uma referência de símbolo ou arquivo em teste/gate é evidência associada, não substitui coverage de linha medido em runtime.');
  out.push('');
  out.push('## Escopo');
  out.push('');
  out.push('- Incluídos: `extension/`, `scripts/`, `tests/`, `.github/workflows/`, `package.json`, `jest.config.js`, `playwright.config.js` e `.gitignore`.');
  out.push('- Excluídos: artefatos gerados/binários, `node_modules`, resultados de testes, `package-lock.json`, documentação comum e esta própria Bíblia, evitando recursão e ruído gerado por máquina.');
  out.push('- O workflow temporário usado apenas para materializar esta Bíblia na branch também é excluído do corpus final.');
  out.push('');
  out.push('## Métricas do corpus');
  out.push('');
  out.push('- Arquivos documentados: **' + files.length + '**.');
  out.push('- Linhas de código/configuração/testes documentadas: **' + totalSourceLines + '**.');
  out.push('- Bytes UTF-8 do corpus documentado: **' + totalSourceBytes + '**.');
  out.push('');
  out.push('## Índice de arquivos');
  out.push('');
  for (const file of files) {
    out.push('- `' + file.rel + '` — ' + file.lines.length + ' linhas');
  }
  out.push('');
  out.push('---');
  out.push('');

  for (const file of files) {
    out.push('## Arquivo: `' + file.rel + '`');
    out.push('');
    out.push('**Linguagem/formato:** ' + language(file.rel) + '  ');
    out.push('**Linhas:** ' + file.lines.length + '  ');
    out.push('**Papel:** ' + roleForFile(file.rel) + '.');
    out.push('');

    let contextSymbol = null;

    for (let index = 0; index < file.lines.length; index++) {
      const rawLine = file.lines[index];
      const declared = declaredSymbol(rawLine);
      if (declared) contextSymbol = declared;

      const explanation = explainLine(rawLine, file.rel);
      const testStatus = statusForLine(file, rawLine, contextSymbol, evidence);

      if (executable(rawLine, file.rel)) {
        executableLines++;
        if (testStatus.includes('TESTE/GATE ASSOCIADO AO CONTEXTO')) {
          directOrAssociatedEvidence++;
        } else if (testStatus.includes('ARQUIVO ALCANÇADO POR TESTE')) {
          fileOnlyEvidence++;
        } else if (testStatus.includes('SEM TESTE PROBATÓRIO RASTREÁVEL')) {
          missingProof++;
        }
      }

      out.push('### Linha ' + String(index + 1).padStart(5, '0'));
      out.push('<code>' + escapeHtml(rawLine || '␠ [linha vazia]') + '</code>');
      out.push('');
      out.push(
        '**Comentário — o que faz:** ' + explanation[0]
        + ' **Como faz:** ' + explanation[1]
        + ' **Por que esta forma:** ' + explanation[2]
        + ' **Por que outra forma tende a ser pior:** ' + explanation[3]
      );
      out.push('');
      out.push('**Teste:** ' + testStatus);
      out.push('');
    }

    out.push('---');
    out.push('');
  }

  const metricInsertion = [
    '- Linhas executáveis/configuracionais analisadas: **' + executableLines + '**.',
    '- Linhas com evidência associada por símbolo/contexto: **' + directOrAssociatedEvidence + '**.',
    '- Linhas em arquivo alcançado por teste, mas sem prova específica: **' + fileOnlyEvidence + '**.',
    '- Linhas sem teste probatório rastreável: **' + missingProof + '**.',
  ];

  const metricsHeadingIndex = out.indexOf('## Índice de arquivos');
  out.splice(metricsHeadingIndex, 0, ...metricInsertion, '');

  const text = out.join('\n') + '\n';
  const bibleLines = text.split('\n').length;

  if (bibleLines <= totalSourceLines) {
    throw new Error(
      'Bíblia inválida: possui ' + bibleLines
      + ' linhas, mas o corpus possui ' + totalSourceLines + '.'
    );
  }

  return {
    text,
    stats: {
      files: files.length,
      totalSourceLines,
      totalSourceBytes,
      bibleLines,
      executableLines,
      directOrAssociatedEvidence,
      fileOnlyEvidence,
      missingProof,
    },
  };
}

function main() {
  const files = loadFiles();
  if (!files.length) {
    throw new Error('Nenhum arquivo elegível foi encontrado para gerar a Bíblia.');
  }

  const result = buildBible(files);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, result.text, 'utf8');

  console.log(JSON.stringify({
    output: OUTPUT_REL,
    ...result.stats,
    outputBytes: Buffer.byteLength(result.text, 'utf8'),
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildBible,
  roleForFile,
};
