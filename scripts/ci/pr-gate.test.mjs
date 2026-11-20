// node --test scripts/ci/*.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateGate, parseVerdict, loadConfig } from "./pr-gate.mjs";

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
});
