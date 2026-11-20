// Etapa de decisão da cadeia de revisão (sem IA): decide se um PR revisado
// pode entrar sozinho no branch de integração ou precisa do dono.
//
// Merge automático só quando TUDO vale:
//   - revisor 2 publicou veredito com zero bloqueantes e zero importantes
//   - CI verde
//   - base = branch de integração (produção é sempre manual)
//   - até `maxLinhas` linhas alteradas (fora lockfile e testes)
//   - nenhum arquivo de alto risco
//
// Configuração em .claude/ecossistema.json (lido de origin/dev pelo
// workflow): integracao, maxLinhas, arquivosSensiveis (regex em texto).
//
// Uso: node scripts/ci/pr-gate.mjs <entrada.json> [ecossistema.json]
// (imprime JSON com a decisão). A lógica pura é `evaluateGate`, testada.

import { readFileSync } from "node:fs";

export const DEFAULT_MAX_CHANGED_LINES = 150;

// Sempre exigem o dono, em qualquer projeto: dependências, CI, as próprias
// regras da revisão e a configuração do ecossistema.
export const BASE_HIGH_RISK = [
  /(^|\/)package(-lock)?\.json$/,
  /(^|\/)(pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|requirements\.txt|poetry\.lock|go\.sum|Cargo\.lock)$/,
  /^\.github\//,
  /^\.claude\/(settings\.json|agents\/|ecossistema\.json)/,
  /^\.agents\/skills\/auditoria-de-pr\//,
  /^scripts\/(ci|hooks)\//,
];

const LOCKFILE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|poetry\.lock|Cargo\.lock|go\.sum)$/;
// Teste não vai para produção e é o que mais infla PR bom: fica fora da
// conta de tamanho (continua revisado normalmente).
const TEST_FILE = /(\.test\.|\.spec\.|_test\.|(^|\/)tests?\/)/;

// Última linha do comentário do revisor 2:
//   <!-- veredito: {"bloqueantes":0,"importantes":1,"menores":2} -->
// Vale a ÚLTIMA linha: a regra é o comentário terminar com ela, e o texto
// pode citar outro veredito antes (o da etapa 1, ou o formato esperado).
export function parseVerdict(body) {
  const m = [...String(body ?? "").matchAll(/<!--\s*veredito:\s*(\{[^}]*\})\s*-->/g)].at(-1);
  if (!m) return null;
  try {
    const v = JSON.parse(m[1]);
    if (!Number.isInteger(v.bloqueantes) || !Number.isInteger(v.importantes)) return null;
    return v;
  } catch {
    return null;
  }
}

// Só conta como etapa 2 o comentário publicado pelo próprio workflow
// ("Publicar revisão", com o GITHUB_TOKEN). Em repositório público qualquer
// conta pode comentar no PR um texto com os marcadores e um veredito zerado.
export const TRUSTED_REVIEW_AUTHOR = "github-actions[bot]";
const MAX_REVIEW_CHARS = 20000;

// comments: [{ login, t (created_at ISO), b (body) }] → corpo da revisão 2
// mais recente do autor confiável, ou "" se não houver.
export function pickReviewBody(comments) {
  const own = (Array.isArray(comments) ? comments : []).filter(
    (c) => c?.login === TRUSTED_REVIEW_AUTHOR && typeof c.b === "string" && c.b.includes("<!-- revisao:2 -->"),
  );
  if (own.length === 0) return "";
  own.sort((a, b) => String(a.t).localeCompare(String(b.t)));
  return own.at(-1).b.slice(-MAX_REVIEW_CHARS);
}

export function loadConfig(cfg = {}) {
  const extra = (cfg.arquivosSensiveis ?? []).map((s) => new RegExp(s));
  return {
    integracao: cfg.integracao || "dev",
    maxLinhas: Number.isInteger(cfg.maxLinhas) ? cfg.maxLinhas : DEFAULT_MAX_CHANGED_LINES,
    highRisk: [...BASE_HIGH_RISK, ...extra],
  };
}

/**
 * @param {{
 *   verdict: {bloqueantes:number, importantes:number} | null,
 *   base: string,
 *   ciConclusion: string | null,
 *   files: {path:string, additions:number, deletions:number}[],
 * }} input
 * @param {ReturnType<typeof loadConfig>} config
 */
export function evaluateGate({ verdict, base, ciConclusion, files }, config = loadConfig()) {
  const reasons = [];
  if (!verdict) {
    reasons.push("o revisor não publicou um veredito legível");
  } else {
    if (verdict.bloqueantes > 0) reasons.push(`${verdict.bloqueantes} achado(s) 🔴 bloqueante(s)`);
    if (verdict.importantes > 0) reasons.push(`${verdict.importantes} achado(s) 🟡 importante(s)`);
  }
  if (ciConclusion !== "success") {
    reasons.push(`CI não está verde (${ciConclusion ?? "sem resultado"})`);
  }
  if (base !== config.integracao) {
    reasons.push(`destino é \`${base}\` — só \`${config.integracao}\` entra sozinho`);
  }

  const changed = files
    .filter((f) => !LOCKFILE.test(f.path) && !TEST_FILE.test(f.path))
    .reduce((n, f) => n + f.additions + f.deletions, 0);
  if (changed > config.maxLinhas) {
    reasons.push(`${changed} linhas alteradas (limite ${config.maxLinhas})`);
  }

  const risky = files.map((f) => f.path).filter((p) => config.highRisk.some((re) => re.test(p)));
  if (risky.length > 0) {
    reasons.push(`arquivo(s) de alto risco: ${risky.map((p) => `\`${p}\``).join(", ")}`);
  }

  const review =
    !verdict || verdict.bloqueantes > 0
      ? verdict
        ? "request-changes"
        : "comment"
      : verdict.importantes > 0
        ? "comment"
        : "approve";

  return { autoMerge: reasons.length === 0, review, reasons };
}

if (process.argv[1] && process.argv[1].endsWith("pr-gate.mjs") && process.argv[2]) {
  const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
  let cfg = {};
  if (process.argv[3]) {
    try {
      cfg = JSON.parse(readFileSync(process.argv[3], "utf8"));
    } catch {}
  }
  // `comments` (com autor) é o formato atual; `reviewBody` fica por
  // compatibilidade com o workflow antigo que ainda esteja no branch padrão.
  const reviewBody = Array.isArray(input.comments) ? pickReviewBody(input.comments) : input.reviewBody;
  const result = evaluateGate({ ...input, verdict: parseVerdict(reviewBody) }, loadConfig(cfg));
  process.stdout.write(JSON.stringify(result));
}
