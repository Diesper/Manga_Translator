import { useMemo, useState } from 'react';
import { findings, testEvals, coverageRows, matrix, gaps, commands, fileTree } from './data/findings';
import { newTests } from './data/newTests';

const sections = [
  ['resumo', 'A. Resumo executivo'],
  ['arvore', 'Mapa do repositório'],
  ['comandos', 'Comandos executados'],
  ['problemas', 'C. Problemas no código'],
  ['testes', 'D. Qualidade dos testes'],
  ['cobertura', 'E. Cobertura real'],
  ['matriz', 'Matriz código ↔ testes'],
  ['lacunas', 'F. Testes ausentes'],
  ['novos', 'G. Código dos novos testes'],
  ['ci', 'H. CI/CD'],
  ['limites', 'I. Limitações'],
] as const;

const sevColor: Record<string, string> = {
  CRÍTICA: 'bg-red-600 text-white',
  ALTA: 'bg-orange-500 text-white',
  MÉDIA: 'bg-amber-400 text-black',
  BAIXA: 'bg-sky-500 text-white',
  INFO: 'bg-zinc-400 text-black',
};
const verdictColor: Record<string, string> = {
  'REAL E ÚTIL': 'bg-emerald-600 text-white',
  'PARCIALMENTE ÚTIL': 'bg-lime-500 text-black',
  FRÁGIL: 'bg-amber-400 text-black',
  ENGANOSO: 'bg-red-600 text-white',
  'NÃO TESTA PRODUÇÃO': 'bg-rose-700 text-white',
  DESABILITADO: 'bg-zinc-500 text-white',
};

function Badge({ text, map }: { text: string; map: Record<string, string> }) {
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold whitespace-nowrap ${map[text] ?? 'bg-zinc-200'}`}>{text}</span>;
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      {title && <h3 className="mb-3 text-base font-semibold text-zinc-900">{title}</h3>}
      {children}
    </div>
  );
}

function Stat({ label, value, sub, tone = 'zinc' }: { label: string; value: string; sub?: string; tone?: string }) {
  const tones: Record<string, string> = {
    zinc: 'border-zinc-200', red: 'border-red-300 bg-red-50', green: 'border-emerald-300 bg-emerald-50', amber: 'border-amber-300 bg-amber-50',
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-zinc-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-600">{sub}</div>}
    </div>
  );
}

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 text-[12px] leading-relaxed text-zinc-100"><code>{children}</code></pre>;
}

function pct(n: number) {
  const color = n === 0 ? 'text-red-600' : n < 60 ? 'text-orange-600' : n < 80 ? 'text-amber-600' : 'text-emerald-700';
  return <span className={`font-mono font-semibold ${color}`}>{n.toFixed(2)}%</span>;
}

export default function App() {
  const [active, setActive] = useState<string>('resumo');
  const [sevFilter, setSevFilter] = useState<string>('TODAS');
  const [verdictFilter, setVerdictFilter] = useState<string>('TODOS');
  const [openTest, setOpenTest] = useState<string | null>('NT-01');

  const filteredFindings = useMemo(
    () => findings.filter(f => sevFilter === 'TODAS' || f.severity === sevFilter),
    [sevFilter],
  );
  const filteredEvals = useMemo(
    () => testEvals.filter(t => verdictFilter === 'TODOS' || t.verdict === verdictFilter),
    [verdictFilter],
  );

  const scrollTo = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-800">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">Auditoria — Diesper/Manga_Translator</h1>
            <p className="text-xs text-zinc-500">HEAD 8d470f4 · extensão MV3 · 20k LOC produção / 30k LOC testes · 112 arquivos de teste · Jest executado neste ambiente</p>
          </div>
          <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">2 CRÍTICOS · 5 ALTOS</span>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <nav className="sticky top-20 hidden h-fit w-56 shrink-0 lg:block">
          <ul className="space-y-1 text-sm">
            {sections.map(([id, label]) => (
              <li key={id}>
                <button onClick={() => scrollTo(id)} className={`w-full rounded-lg px-3 py-2 text-left transition ${active === id ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-200'}`}>{label}</button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 space-y-12">
          {/* A. RESUMO */}
          <section id="resumo" className="space-y-4">
            <h2 className="text-2xl font-bold text-zinc-900">A. Resumo executivo</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Arquivos de produção" value="56 JS + 4 HTML" sub="todos abertos; 22 lidos linha a linha, demais por grep/coverage" />
              <Stat label="Arquivos de teste" value="112" sub="96 unit · 13 integração · 3 E2E (+6 smoke, 7 visual)" />
              <Stat label="Testes Jest executados" value="851" sub="845 no run completo + 6 da suíte morta por OOM (rerodada: passou)" tone="green" />
              <Stat label="Desabilitados" value="0" sub="nenhum .skip/.only/xit/todo; gate CI proíbe" tone="green" />
              <Stat label="Coverage global (V8)" value="79,55%" sub="stmts · branches 71,53% · funcs 83,04%" tone="amber" />
              <Stat label="inject.js coverage" value="0%" sub="471 linhas MAIN world sem execução em teste" tone="red" />
              <Stat label="Testes sem produção" value="~70" sub="13 arquivos + 6 com reimplementação inline" tone="red" />
              <Stat label="Achados" value="14" sub="6 bugs confirmados · 4 riscos · 4 melhorias" tone="amber" />
            </div>
            <Card title="Principais conclusões (com evidência)">
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                <li><b>O núcleo funciona como aparenta.</b> Router, actions do background, job-runner do Gemini, fingerprint e a maior parte do content script são exercitados por testes reais (código carregado via <code>require</code>/loaders) com chrome mock <i>stateful</i>. Os E2E carregam a extensão real no Chromium (<code>playwright.config.js:55-56</code>).</li>
                <li><b>HTML injection confirmada no popup</b> (<code>popup.js:657-661</code>): <code>img.src</code> interpolado em <code>innerHTML</code> sem escape; <code>data:</code> URLs preservam aspas (PoC executado). CSP do MV3 impede XSS, mas markup arbitrário entra no popup.</li>
                <li><b>Manifest de produção contém hook de teste</b> <code>http://127.0.0.1/*</code> (<code>manifest.json:46,56</code>), injetando <code>inject.js</code> em MAIN world em qualquer servidor local e classificando-o como origem confiável "gemini" (<code>router.js:50-51</code>).</li>
                <li><b>Testes enganosos:</b> <code>tests/helpers/extracted-functions.js:18-38</code> reimplementa <code>canonicalTitle</code> com regex que <u>não existem</u> em <code>cm-chapter.js:5-14</code>; 3 de 4 entradas divergem em execução. 4 arquivos de teste validam comportamento inexistente.</li>
                <li><b>Falsa cobertura de inject.js:</b> 3 arquivos "inject/" → 0% de cobertura; um deles admite "sem carregar o inject.js" e faz 16 <code>expect(source).toContain()</code>.</li>
                <li><b>Cobertura de background.js subnotificada:</b> loader com <code>new Function</code> torna o código anônimo para o V8 (provado com <code>NODE_V8_COVERAGE</code>); <code>waitForDownload</code> real é executado mas aparece com 0 hits.</li>
                <li><b>CI é honesto e rigoroso</b> (baseline de contagem, sem <code>|| true</code>, gates de flaky, verificação de inventário) — porém conta stubs como testes e não tem lint/typecheck.</li>
              </ol>
            </Card>
          </section>

          {/* ÁRVORE */}
          <section id="arvore" className="space-y-4">
            <h2 className="text-2xl font-bold text-zinc-900">Mapa do repositório (classificado)</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {(Object.entries(fileTree) as [string, string[]][]).map(([k, items]) => (
                <Card key={k} title={{ production: 'Produção', tests: 'Teste', config: 'Configuração', ci: 'CI', build: 'Build', docs: 'Documentação', irrelevant: 'Gerados / irrelevantes' }[k]}>
                  <ul className="list-disc space-y-1 pl-4 text-xs font-mono">{items.map(i => <li key={i}>{i}</li>)}</ul>
                </Card>
              ))}
            </div>
            <Card title="Auditoria específica de extensão — manifest">
              <ul className="list-disc space-y-1 pl-5 text-sm">
                <li><b>MV3</b>, service worker <code>background.js</code> com <code>importScripts</code> de 33 módulos (<code>background.js:47-78</code>) e fallback <code>require</code> para Node.</li>
                <li><b>Permissões:</b> tabs, scripting, storage, unlimitedStorage, downloads, windows, alarms, contextMenus + <code>host_permissions: &lt;all_urls&gt;</code>. Todas têm uso localizado (downloads em actions/download-*, alarms em jobs-watchdog, contextMenus em background.js:659+). <code>scripting</code>: usado em <code>popup.js:437</code> (<code>executeScript</code> para reload da aba) — justificado. Nenhuma permissão excessiva confirmada; <code>&lt;all_urls&gt;</code> é decisão de produto (tradução em qualquer site).</li>
                <li><b>Sem</b> <code>externally_connectable</code>, <code>onMessageExternal</code>, <code>web_accessible_resources</code>, CSP custom, <code>eval</code>/<code>new Function</code> em produção. Páginas web não conseguem enviar mensagens ao background.</li>
                <li><b>Comunicação:</b> runtime messages → router com <code>ACTION_MAP</code>, <code>allowedSources</code> e <code>validate</code> por ação (<code>router.js:36-158</code>). Exceções: famílias <code>SM_*</code>/<code>GTC_*</code> (SEC-04). Ponte página↔content no Gemini via <code>CustomEvent MANGA_TRANSLATOR_*</code> (<code>inject.js:367-389</code>) — sem <code>window.postMessage</code>.</li>
                <li><b>HTTP:</b> apenas 4 pontos de <code>fetch</code>; <code>fetch-image-base64.js:8-38,60-92</code> valida protocolo, host googleusercontent para sessão, content-type, tamanho (50 MB) e timeout (30 s) — <b>bem implementado</b>.</li>
              </ul>
            </Card>
          </section>

          {/* COMANDOS */}
          <section id="comandos" className="space-y-4">
            <h2 className="text-2xl font-bold text-zinc-900">Comandos executados (registro fiel)</h2>
            <Card>
              <table className="w-full text-left text-xs">
                <thead><tr className="border-b text-zinc-500"><th className="py-2 pr-3">Comando</th><th className="py-2">Resultado</th></tr></thead>
                <tbody>
                  {commands.map(c => (
                    <tr key={c.cmd} className="border-b border-zinc-100 align-top">
                      <td className="py-2 pr-3 font-mono">{c.cmd}</td>
                      <td className={`py-2 ${c.status === 'skip' ? 'text-zinc-500 italic' : c.status === 'warn' ? 'text-amber-700' : 'text-emerald-800'}`}>{c.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>

          {/* C. PROBLEMAS */}
          <section id="problemas" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-2xl font-bold text-zinc-900">C. Problemas no código e nos testes</h2>
              <div className="flex gap-1">
                {['TODAS', 'CRÍTICA', 'ALTA', 'MÉDIA', 'BAIXA'].map(s => (
                  <button key={s} onClick={() => setSevFilter(s)} className={`rounded px-2 py-1 text-xs font-semibold ${sevFilter === s ? 'bg-zinc-900 text-white' : 'bg-zinc-200'}`}>{s}</button>
                ))}
              </div>
            </div>
            {filteredFindings.map(f => (
              <Card key={f.id}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge text={f.severity} map={sevColor} />
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-semibold">{f.kind}</span>
                  <span className="font-mono text-xs text-zinc-500">{f.id}</span>
                  <span className="font-mono text-xs text-indigo-700">{f.file}:{f.lines}</span>
                </div>
                <h3 className="text-base font-bold text-zinc-900">{f.title}</h3>
                <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                  <div><dt className="font-semibold text-zinc-600">Descrição</dt><dd>{f.description}</dd></div>
                  <div><dt className="font-semibold text-zinc-600">Cenário</dt><dd>{f.scenario}</dd></div>
                  <div><dt className="font-semibold text-zinc-600">Impacto</dt><dd>{f.impact}</dd></div>
                  <div><dt className="font-semibold text-zinc-600">Evidência</dt><dd className="font-mono text-xs">{f.evidence}</dd></div>
                  <div className="md:col-span-2 rounded-lg bg-emerald-50 p-3"><dt className="font-semibold text-emerald-800">Correção sugerida</dt><dd>{f.fix}</dd></div>
                </dl>
              </Card>
            ))}
          </section>

          {/* D. TESTES */}
          <section id="testes" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-2xl font-bold text-zinc-900">D. Qualidade dos testes existentes</h2>
              <select value={verdictFilter} onChange={e => setVerdictFilter(e.target.value)} className="rounded border px-2 py-1 text-xs">
                <option>TODOS</option>
                {Object.keys(verdictColor).map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <Card>
              <p className="mb-3 text-sm text-zinc-600">Análise de mutação mental: para cada linha, perguntou-se se inverter uma condição, remover um listener ou trocar uma URL na produção faria o teste falhar. Testes "NÃO TESTA PRODUÇÃO" continuam verdes sob <i>qualquer</i> mutação.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead><tr className="border-b text-zinc-500"><th className="py-2 pr-2">Teste</th><th className="py-2 pr-2">Tipo</th><th className="py-2 pr-2">Código real executado</th><th className="py-2 pr-2">Mocks</th><th className="py-2 pr-2">Avaliação</th><th className="py-2">Motivo</th></tr></thead>
                  <tbody>
                    {filteredEvals.map(t => (
                      <tr key={t.file} className="border-b border-zinc-100 align-top">
                        <td className="py-2 pr-2 font-mono">{t.file}</td>
                        <td className="py-2 pr-2">{t.type}</td>
                        <td className={`py-2 pr-2 ${t.prod.startsWith('NENHUM') ? 'font-bold text-red-700' : ''}`}>{t.prod}</td>
                        <td className="py-2 pr-2">{t.mocks}</td>
                        <td className="py-2 pr-2"><Badge text={t.verdict} map={verdictColor} /></td>
                        <td className="py-2">{t.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="Exemplos de mutação que passariam despercebidas">
              <ul className="list-disc space-y-1 pl-5 text-sm">
                <li><code>cm-chapter.js:7</code> — remover <code>.replace(/^\d+[\s.\-–—:|]+/, '')</code>: <code>canonical-title*.test.js</code> continua verde (testa o helper).</li>
                <li><code>cm-dom-replace.js:81</code> — trocar <code>&gt;=</code> por <code>&gt;</code> em <code>naturalWidth &gt;= minWidth</code>: <code>image-filtering.test.js</code> ("300px exato incluído") continua verde. Só <code>*-real.test.js</code> poderia pegar.</li>
                <li><code>inject.js:367</code> — remover o listener <code>MANGA_TRANSLATOR_FETCH_IMAGE</code>: nenhum teste Jest falha (só E2E CG-30/CG-39 no rpa-flow via mock DOM, e mesmo esse simula o evento).</li>
                <li><code>background/actions/export-all.js</code> — remover o guard de lista vazia: <code>export-guard.test.js</code> continua verde (testa cópia local); <code>export-all-action.test.js</code> <b>falharia</b> (esse é real).</li>
                <li><code>router.js:111</code> — trocar <code>!includes(source)</code> por <code>includes(source)</code>: <code>router.test.js:72</code> <b>falharia</b> ✔.</li>
              </ul>
            </Card>
          </section>

          {/* E. COBERTURA */}
          <section id="cobertura" className="space-y-4">
            <h2 className="text-2xl font-bold text-zinc-900">E. Cobertura real (medida neste ambiente)</h2>
            <Card>
              <p className="mb-3 text-sm">Fonte: <code>tests/coverage/coverage-summary.json</code> + <code>lcov.info</code> gerados por <code>node ci/run-jest-ci.js --coverage</code>. Total: <b>Statements 79,55% · Branches 71,53% · Functions 83,04% · Lines 79,55%</b> (56 arquivos). Sem <code>istanbul ignore</code>/<code>c8 ignore</code> em produção; <code>collectCoverageFrom</code> abrange todo <code>extension/**</code>.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead><tr className="border-b text-zinc-500"><th className="py-2 pr-2">Arquivo</th><th className="py-2 pr-2">Stmts</th><th className="py-2 pr-2">Branches</th><th className="py-2 pr-2">Funcs</th><th className="py-2 pr-2">Lines</th><th className="py-2 pr-2">Linhas s/ cobertura</th><th className="py-2">Falta testar</th></tr></thead>
                  <tbody>
                    {coverageRows.map(r => (
                      <tr key={r.file} className="border-b border-zinc-100">
                        <td className="py-2 pr-2 font-mono">{r.file}</td>
                        <td className="py-2 pr-2">{pct(r.stmts)}</td><td className="py-2 pr-2">{pct(r.branches)}</td><td className="py-2 pr-2">{pct(r.funcs)}</td><td className="py-2 pr-2">{pct(r.lines)}</td>
                        <td className="py-2 pr-2 font-mono">{r.uncovered}</td>
                        <td className="py-2">{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="Regiões específicas sem cobertura (lcov, faixas ≥ 9 linhas)">
              <ul className="space-y-1 font-mono text-xs">
                <li><b>background.js</b>: 47-105 (importScripts — esperado), 170-219 handleStorageManagerMessage, 659-790 isContextMenuPageEnabled/menu, 798-817 waitForDownload*, 819-868 downloadImagesAndShow*, 870-903 handleMarkerAndShow*, 982-1069 startBatch legado, 1092-1103/1183-1193 stopBatch. (*executados via new Function — COV-01)</li>
                <li><b>content_manga.js</b>: 323-462 generateImageFingerprint, 466-676 queryGlobalTranslationCache*/saveGlobalTranslationCacheEntry, 1097-1122 normalizeBlockedImagesStore, 1230-1243 showIntegratedError, 1682-1811 applyAutoRestore/initializeAutoRestorer, 2167-2448 extractAndSendImages (branches), 2679-2765 checkIfComplete.</li>
                <li><b>popup.js</b>: 169-223, 451-465, 581-609, 932-940 (seleção de banidos), 1036-1070, 1229-1299 (ações de capítulo), 1638-1649, 1972-1981.</li>
                <li><b>storage-manager.js</b>: 54-149 openDb/upgrade, 177-236, 270-408 transações.</li>
              </ul>
            </Card>
          </section>

          {/* MATRIZ */}
          <section id="matriz" className="space-y-4">
            <h2 className="text-2xl font-bold text-zinc-900">Matriz código ↔ testes</h2>
            <Card>
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b text-zinc-500"><th className="py-2">Código de produção</th><th className="py-2 text-center">Happy</th><th className="py-2 text-center">Erro</th><th className="py-2 text-center">Edge</th><th className="py-2 text-center">Integração</th><th className="py-2 text-center">E2E</th></tr></thead>
                <tbody>
                  {matrix.map(m => (
                    <tr key={m.module} className="border-b border-zinc-100">
                      <td className="py-1.5 font-mono text-xs">{m.module}</td>
                      <td className="py-1.5 text-center">{m.happy}</td><td className="py-1.5 text-center">{m.error}</td><td className="py-1.5 text-center">{m.edge}</td><td className="py-1.5 text-center">{m.integration}</td><td className="py-1.5 text-center">{m.e2e}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-zinc-500">✅ adequado · ⚠️ parcial · ❌ não coberto. E2E avaliado por leitura dos specs (NÃO EXECUTADO).</p>
            </Card>
          </section>

          {/* F. LACUNAS */}
          <section id="lacunas" className="space-y-4">
            <h2 className="text-2xl font-bold text-zinc-900">F. Testes ausentes recomendados (priorizados)</h2>
            <Card>
              <table className="w-full text-left text-xs">
                <thead><tr className="border-b text-zinc-500"><th className="py-2 pr-2">Prioridade</th><th className="py-2 pr-2">Código</th><th className="py-2 pr-2">Cenário</th><th className="py-2 pr-2">Tipo</th><th className="py-2">Motivo / impacto</th></tr></thead>
                <tbody>
                  {gaps.map((g, i) => (
                    <tr key={i} className="border-b border-zinc-100 align-top">
                      <td className="py-2 pr-2"><Badge text={g.priority} map={sevColor} /></td>
                      <td className="py-2 pr-2 font-mono">{g.code}</td>
                      <td className="py-2 pr-2">{g.scenario}</td>
                      <td className="py-2 pr-2">{g.type}</td>
                      <td className="py-2">{g.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>

          {/* G. NOVOS TESTES */}
          <section id="novos" className="space-y-4">
            <h2 className="text-2xl font-bold text-zinc-900">G. Código dos novos testes (Jest 29, helpers existentes)</h2>
            <p className="text-sm text-zinc-600">Cada exemplo usa apenas APIs encontradas no repositório (<code>loadExtensionPage</code>, <code>loadContentScript</code>, <code>loadBackgroundModule</code>, <code>getTabsMock</code>, <code>getStorageMock</code>, <code>getRuntimeMock</code>, <code>_registerMessageHandler</code>, <code>_setStore</code>). Onde um nome interno não foi confirmado, há uma NOTA no código.</p>
            {newTests.map(t => (
              <Card key={t.id}>
                <button onClick={() => setOpenTest(openTest === t.id ? null : t.id)} className="flex w-full items-start justify-between text-left">
                  <div>
                    <div className="font-mono text-xs text-indigo-700">{t.id} → {t.file}</div>
                    <div className="mt-1 font-semibold text-zinc-900">{t.objective}</div>
                  </div>
                  <span className="ml-3 text-zinc-400">{openTest === t.id ? '▲' : '▼'}</span>
                </button>
                {openTest === t.id && (
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="grid gap-2 md:grid-cols-2">
                      <div><b>Setup:</b> {t.setup}</div>
                      <div><b>Ação:</b> {t.action}</div>
                      <div><b>Resultado esperado:</b> {t.expected}</div>
                      <div className="rounded bg-red-50 p-2"><b>Bug que impediria:</b> {t.bugPrevented}</div>
                    </div>
                    <Code>{t.code}</Code>
                  </div>
                )}
              </Card>
            ))}
          </section>

          {/* H. CI */}
          <section id="ci" className="space-y-4">
            <h2 className="text-2xl font-bold text-zinc-900">H. CI/CD (.github/workflows/ci.yml)</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <Card title="O que está bem">
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  <li>10 jobs: version-integrity, syntax-check, manifest-validation, ci-contract, smoke, visual, unit+integration (Node 20/22), coverage, e2e-shard ×5, e2e merge.</li>
                  <li><code>run-jest-ci.js</code> exige inventário 109/109 arquivos, <code>skipped=0</code>, <code>todo=0</code>, <code>minTests ≥ 848</code> e detecta worker forçado.</li>
                  <li><code>verify-ci-contract.js:86-202</code> falha se qualquer job funcional usar <code>continue-on-error</code> ou <code>|| true</code>. Os 6 <code>continue-on-error</code> existentes estão só em upload de artefatos/Codecov (linhas 194, 207, 255, 347, 395, 433).</li>
                  <li>E2E: <code>retries: 0</code> em CI, gate anti-flaky (<code>playwright-gate-reporter.js</code>), verificação de exatamente 5 blobs, plano de shards conferido.</li>
                  <li>Coverage: <code>verify-coverage.js</code> confere que todos os 56 arquivos de <code>extension/</code> aparecem no summary e lcov, e aplica mínimos globais e por arquivo crítico. Sem exclusões suspeitas.</li>
                </ul>
              </Card>
              <Card title="Onde o verde pode enganar">
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  <li><b>Contagem inclui stubs</b>: ~70 testes que não tocam produção contam para <code>minTests</code>. Um PR que remova esses stubs quebra o gate (CI-02).</li>
                  <li><b>Coverage de background.js subnotificada</b> (COV-01): o gate crítico de 55% está calibrado sobre um número artificialmente baixo; se os testes via <code>loadBackgroundModule</code> forem apagados, o gate <i>não</i> percebe.</li>
                  <li><b>Sem lint/typecheck</b> (CI-01): apenas <code>node --check</code>.</li>
                  <li><b>Smoke e visual-v3 rodam fora do coverage</b>; storage-manager.js fica com 42% no gate embora seja testado no smoke.</li>
                  <li><b>E2E dependem de `127.0.0.1` no manifest de produção</b> (SEC-02) — corrigir o manifest exige ajustar a estratégia E2E, senão os E2E quebram.</li>
                  <li><code>jest-worker-diagnostic</code> (18 casos) roda só em <code>main</code>/dispatch — aceitável, mas PRs não o veem.</li>
                </ul>
              </Card>
            </div>
          </section>

          {/* I. LIMITAÇÕES */}
          <section id="limites" className="space-y-4 pb-16">
            <h2 className="text-2xl font-bold text-zinc-900">I. Limitações da auditoria</h2>
            <Card>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                <li><b>NÃO EXECUTADO:</b> E2E Playwright (sem Chromium/xvfb no sandbox), visual-v3 (224 testes), smoke (6 arquivos), jobs de diagnóstico do CI. Avaliados por leitura estática.</li>
                <li><b>Run de coverage:</b> uma suíte (<code>actions-low-risk.test.js</code>) foi morta por SIGKILL (OOM do sandbox) no run completo; rerodada isoladamente passou (6/6). Os números de coverage podem estar ~0,1-0,3 pp abaixo do CI por essa ausência.</li>
                <li><b>Não reproduzido em browser:</b> a parte de SEC-01 que depende de <code>naturalWidth</code> de um SVG <code>data:</code> URL (o vetor de aspas foi provado em Node; a renderização no popup é hipótese plausível).</li>
                <li><b>Leitura linha a linha:</b> manifest, background.js (seções-chave), router.js, state.js, claim-gemini-job.js, fetch-image-base64.js, cm-chapter.js, cm-dom-replace.js (scan), inject.js (ponte), popup.js (renderização), helpers/mocks de teste, configs Jest/CI. Os demais 30+ módulos foram analisados por grep, coverage e amostragem — não afirmamos revisão exaustiva de <code>gemini/*.js</code>, <code>gtc-indexeddb.js</code>, <code>options.js</code>, <code>reader.js</code>.</li>
                <li><b>Classificação de testes:</b> todos os 112 arquivos foram varridos por padrão (imports de produção, skip/only, jest.mock, reimplementação inline, source-grep); 26 grupos receberam análise individual de fluxo. Os demais foram classificados por evidência de import + coverage atribuída.</li>
                              </ul>
            </Card>
          </section>
        </main>
      </div>
    </div>
  );
}
