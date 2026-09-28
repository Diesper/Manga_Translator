import { useState, type ReactNode } from "react";
import {
  meta, commands, problems, testQuality, coverageGaps, matrix, recommended, ciFindings, type Sev,
} from "./auditData";
import { cn } from "./utils/cn";

const sevColor: Record<Sev, string> = {
  "CRÍTICO": "bg-red-600 text-white",
  "ALTO": "bg-orange-500 text-white",
  "MÉDIO": "bg-amber-400 text-black",
  "BAIXO": "bg-sky-500 text-white",
  "INFO": "bg-slate-500 text-white",
};

const gradeColor = (g: string) =>
  g.startsWith("REAL") ? "bg-emerald-100 text-emerald-800"
  : g.startsWith("PARCIAL") ? "bg-amber-100 text-amber-800"
  : "bg-red-100 text-red-800";

const sections = [
  ["resumo", "A. Resumo"],
  ["comandos", "Comandos executados"],
  ["problemas", "C. Problemas"],
  ["testes", "D. Qualidade dos testes"],
  ["cobertura", "E. Cobertura real"],
  ["matriz", "Matriz código ↔ testes"],
  ["recomendados", "F. Testes ausentes"],
  ["ci", "H. CI"],
  ["limites", "I. Limitações"],
] as const;

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-600">
          <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100 align-top hover:bg-slate-50/60">
              {r.map((c, j) => <td key={j} className="px-3 py-2 text-slate-700">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const [active, setActive] = useState<(typeof sections)[number][0]>("resumo");
  const c = meta.coverage;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <h1 className="text-2xl font-bold tracking-tight">Auditoria — {meta.repo}</h1>
          <p className="mt-1 text-sm text-slate-600">
            Commit {meta.commit} · {meta.version} · Extensão MV3 (Chrome) · Jest 29 + Playwright
          </p>
          <nav className="mt-4 flex flex-wrap gap-2">
            {sections.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setActive(id)}
                className={cn(
                  "rounded-full px-3 py-1 text-sm transition",
                  active === id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {active === "resumo" && (
          <section className="space-y-6">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat label="Arquivos de produção" value={meta.prodFiles} sub={`${meta.prodLoc.toLocaleString("pt-BR")} LOC em extension/`} />
              <Stat label="Arquivos de teste" value={meta.testFiles} sub="unit, integration, e2e, smoke, visual-v3, ci" />
              <Stat label="Jest executado" value={`${meta.jestTests} ✓`} sub={`${meta.jestSuites} suítes · 0 falhas · 0 skipped · ${meta.jestTimeSec}s`} />
              <Stat label="Outros executados" value={`${meta.visualTests} + ${meta.smokeFiles}`} sub="visual-v3 testes · smoke arquivos" />
              <Stat label="Statements" value={`${c.statements}%`} />
              <Stat label="Branches" value={`${c.branches}%`} />
              <Stat label="Functions" value={`${c.functions}%`} />
              <Stat label="Lines" value={`${c.lines}%`} sub="coverage V8 medido localmente" />
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-5">
              <h2 className="font-semibold text-red-900">Principais achados</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-900">
                <li><b>36+ testes verdes sobre uma cópia divergente</b> de canonicalTitle (mutação real na produção não quebrou nada).</li>
                <li><b>inject.js com 0% de cobertura</b>: os 3 arquivos de teste "inject" simulam a lógica e fazem grep no fonte.</li>
                <li><b>background/log.js nunca é carregado</b>: eventos SOURCE_DENIED/ACTION_ERROR do router são descartados em produção.</li>
                <li><b>HTML injection no popup</b> (popup.js:657, 930) via img.src sem escape — explorável com data: URL contendo aspas.</li>
                <li><b>identifySource por substring</b> aceita hosts lookalike como "gemini".</li>
                <li><b>Manifest de produção inclui http://127.0.0.1/*</b> (scaffolding E2E) para inject.js em MAIN world.</li>
                <li>smoke-01/02 não importam produção; smoke-01 afirma comportamento oposto ao real.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
              <h2 className="font-semibold">O que está bem</h2>
              <p className="mt-1">
                Núcleo do background (router, jobs-lifecycle, reconciliation, ações) e content scripts são testados com código real
                e mocks chrome.* com estado; sem jest.mock(), sem snapshots, sem .skip/.only; E2E é verdadeiro (extensão carregada
                via --load-extension, service worker real, mock do Gemini em 127.0.0.1:3999); CI sem continue-on-error / || true e com
                gates de inventário (≥848 testes, 0 skipped).
              </p>
            </div>
          </section>
        )}

        {active === "comandos" && (
          <Table
            head={["Comando", "Resultado", "Status"]}
            rows={commands.map((r) => [
              <code className="text-xs">{r.cmd}</code>,
              r.result,
              <span className={cn("rounded px-2 py-0.5 text-xs font-semibold",
                r.status === "ok" ? "bg-emerald-100 text-emerald-800" : r.status === "mut" ? "bg-red-100 text-red-800" : "bg-slate-200 text-slate-700")}>
                {r.status === "ok" ? "EXECUTADO" : r.status === "mut" ? "MUTAÇÃO SOBREVIVEU" : "NÃO EXECUTADO"}
              </span>,
            ])}
          />
        )}

        {active === "problemas" && (
          <Table
            head={["Sev.", "Tipo", "Arquivo / linha", "Problema", "Evidência", "Correção"]}
            rows={problems.map((p) => [
              <span className={cn("rounded px-2 py-0.5 text-xs font-bold", sevColor[p.sev])}>{p.sev}</span>,
              <span className="text-xs">{p.kind}</span>,
              <code className="text-xs">{p.file}<br />{p.line}</code>,
              p.problem, <span className="text-xs">{p.evidence}</span>, <span className="text-xs">{p.fix}</span>,
            ])}
          />
        )}

        {active === "testes" && (
          <Table
            head={["Teste", "Código real executado", "Mocks", "Assertion relevante", "Avaliação", "Motivo"]}
            rows={testQuality.map((t) => [
              <code className="text-xs">{t.test}</code>, t.code, t.mocks, t.assertion,
              <span className={cn("rounded px-2 py-0.5 text-xs font-semibold", gradeColor(t.grade))}>{t.grade}</span>,
              <span className="text-xs">{t.why}</span>,
            ])}
          />
        )}

        {active === "cobertura" && (
          <Table
            head={["Arquivo", "Função / trecho", "Estado", "Risco"]}
            rows={coverageGaps.map((g) => [<code className="text-xs">{g.file}</code>, g.fn, <b>{g.state}</b>, g.risk])}
          />
        )}

        {active === "matriz" && (
          <Table
            head={["Código de produção", "Happy path", "Erro", "Edge cases", "Integração", "E2E"]}
            rows={matrix.map((m) => [<code className="text-xs">{m.code}</code>, m.happy, m.error, m.edge, m.integ, m.e2e])}
          />
        )}

        {active === "recomendados" && (
          <Table
            head={["Prioridade", "Código", "Cenário", "Tipo", "Motivo"]}
            rows={recommended.map((r) => [
              <span className={cn("rounded px-2 py-0.5 text-xs font-bold",
                r.prio === "CRÍTICA" ? sevColor["CRÍTICO"] : r.prio === "ALTA" ? sevColor["ALTO"] : r.prio === "MÉDIA" ? sevColor["MÉDIO"] : sevColor["BAIXO"])}>{r.prio}</span>,
              <code className="text-xs">{r.code}</code>, r.scenario, r.type, r.why,
            ])}
          />
        )}

        {active === "ci" && (
          <ul className="space-y-2">
            {ciFindings.map((f, i) => (
              <li key={i} className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">{f}</li>
            ))}
          </ul>
        )}

        {active === "limites" && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm leading-relaxed shadow-sm">
            <ul className="list-disc space-y-1 pl-5">
              <li>E2E Playwright: <b>NÃO EXECUTADO</b> (sem Chromium no sandbox). Classificação como "E2E verdadeiro" baseia-se na leitura de playwright.config.js e translation-flow.spec.js:44-183.</li>
              <li>Lint/typecheck: não existem no repositório.</li>
              <li>Injeção HTML no popup: confirmada por leitura de código e pelo comportamento de URL data: em Node; a exploração ponta-a-ponta (página hostil → popup) não foi reproduzida em navegador.</li>
              <li>Arquivos lidos integralmente: background.js, router.js, state.js (parcial), jobs-lifecycle.js (parcial), 8 ações, cm-chapter.js, cm-dom-replace.js (parcial), content_manga.js (trechos 320-330, 1520-1720, 2585-2790), inject.js (1-120, 285-392), popup.js (trechos), options.js (trecho), reader.js (120-175), manifest.json, todos os configs de teste/CI, helpers e mocks, amostras dos testes. <b>Não</b> foram lidos linha a linha: gemini/*.js (2 800 LOC), gtc-indexeddb.js, gtc-fingerprint.js, storage-manager.js, shared-ui.js, tab-identity.js.</li>
              <li>Só uma mutação foi executada de fato (canonicalTitle); as demais análises de mutação são raciocínio estático.</li>
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
