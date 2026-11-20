// node --test scripts/ci/*.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateGate, parseVerdict, pickReviewBody, loadConfig } from "./pr-gate.mjs";

const clean = { bloqueantes: 0, importantes: 0, menores: 1 };
const ok = (over = {}) => ({
  verdict: clean,
  base: "dev",
  ciConclusion: "success",
  files: [{ path: "src/a.ts", additions: 10, deletions: 2 }],
  ...over,
});

describe("evaluateGate", () => {
  it("PR pequeno, limpo, verde, para a integração → merge automático com aprovação", () => {
    const r = evaluateGate(ok());
    assert.equal(r.autoMerge, true);
    assert.equal(r.review, "approve");
  });

  it("achado importante segura o merge e não aprova", () => {
    const r = evaluateGate(ok({ verdict: { bloqueantes: 0, importantes: 1 } }));
    assert.equal(r.autoMerge, false);
    assert.equal(r.review, "comment");
    assert.match(r.reasons.join(), /importante/);
  });

  it("bloqueante pede mudanças", () => {
    assert.equal(evaluateGate(ok({ verdict: { bloqueantes: 1, importantes: 0 } })).review, "request-changes");
  });

  it("sem veredito vai para o dono", () => {
    const r = evaluateGate(ok({ verdict: null }));
    assert.equal(r.autoMerge, false);
    assert.equal(r.review, "comment");
  });

  it("CI vermelho segura", () => {
    assert.equal(evaluateGate(ok({ ciConclusion: "failure" })).autoMerge, false);
  });

  it("destino diferente da integração segura (produção é manual)", () => {
    assert.equal(evaluateGate(ok({ base: "main" })).autoMerge, false);
  });

  it("respeita o branch de integração configurado", () => {
    const cfg = loadConfig({ integracao: "develop" });
    assert.equal(evaluateGate(ok({ base: "develop" }), cfg).autoMerge, true);
    assert.equal(evaluateGate(ok({ base: "dev" }), cfg).autoMerge, false);
  });

  it("PR grande segura; lockfile e teste não contam", () => {
    const big = [{ path: "src/a.ts", additions: 150, deletions: 1 }];
    assert.equal(evaluateGate(ok({ files: big })).autoMerge, false);
    const withTests = [
      { path: "src/a.ts", additions: 100, deletions: 0 },
      { path: "src/a.test.ts", additions: 400, deletions: 0 },
    ];
    assert.equal(evaluateGate(ok({ files: withTests })).autoMerge, true);
  });

  it("limite de linhas configurável", () => {
    const cfg = loadConfig({ maxLinhas: 300 });
    const f = [{ path: "src/a.ts", additions: 250, deletions: 0 }];
    assert.equal(evaluateGate(ok({ files: f }), cfg).autoMerge, true);
  });

  it("arquivo sensível padrão e do projeto seguram", () => {
    assert.equal(evaluateGate(ok({ files: [{ path: ".github/workflows/x.yml", additions: 1, deletions: 0 }] })).autoMerge, false);
    const cfg = loadConfig({ arquivosSensiveis: ["^src/pagamento/"] });
    const f = [{ path: "src/pagamento/pix.ts", additions: 1, deletions: 0 }];
    assert.equal(evaluateGate(ok({ files: f }), cfg).autoMerge, false);
    assert.equal(evaluateGate(ok({ files: f })).autoMerge, true);
  });
});

describe("parseVerdict", () => {
  it("lê a linha de veredito", () => {
    assert.deepEqual(parseVerdict('x\n<!-- veredito: {"bloqueantes":0,"importantes":2,"menores":1} -->'), {
      bloqueantes: 0,
      importantes: 2,
      menores: 1,
    });
  });
  it("rejeita formato inválido", () => {
    assert.equal(parseVerdict("sem veredito"), null);
    assert.equal(parseVerdict('<!-- veredito: {"bloqueantes":"0","importantes":0} -->'), null);
  });
  it("com mais de uma linha de veredito, vale a última", () => {
    const body =
      '<!-- revisao:2 -->\nA etapa 1 dizia <!-- veredito: {"bloqueantes":0,"importantes":0} -->\n' +
      '<!-- veredito: {"bloqueantes":0,"importantes":1,"menores":0} -->';
    assert.equal(parseVerdict(body).importantes, 1);
  });
});

describe("pickReviewBody", () => {
  const bot = (t, b) => ({ login: "github-actions[bot]", t, b });
  const zerado = '<!-- revisao:2 -->\nok\n<!-- veredito: {"bloqueantes":0,"importantes":0} -->';

  it("comentário humano com marcador e veredito zerado é ignorado", () => {
    const body = pickReviewBody([{ login: "qualquer-conta", t: "2026-01-01T00:00:00Z", b: zerado }]);
    assert.equal(body, "");
    const r = evaluateGate(ok({ verdict: parseVerdict(body) }));
    assert.equal(r.autoMerge, false);
    assert.match(r.reasons.join(), /veredito legível/);
  });

  it("humano comentando depois do bot não substitui a revisão do bot", () => {
    const real = '<!-- revisao:2 -->\n<!-- veredito: {"bloqueantes":0,"importantes":1} -->';
    const body = pickReviewBody([
      bot("2026-01-01T00:00:00Z", real),
      { login: "qualquer-conta", t: "2026-01-02T00:00:00Z", b: zerado },
    ]);
    assert.equal(parseVerdict(body).importantes, 1);
  });

  it("entre revisões do bot, vale a mais recente", () => {
    const antiga = '<!-- revisao:2 -->\n<!-- veredito: {"bloqueantes":1,"importantes":0} -->';
    const body = pickReviewBody([bot("2026-01-03T00:00:00Z", zerado), bot("2026-01-01T00:00:00Z", antiga)]);
    assert.equal(parseVerdict(body).bloqueantes, 0);
  });

  it("ignora comentário do bot que não é revisão 2 e entrada inválida", () => {
    assert.equal(pickReviewBody([bot("2026-01-01T00:00:00Z", "✅ Entrou em dev")]), "");
    assert.equal(pickReviewBody(null), "");
  });
});
