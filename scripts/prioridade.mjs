#!/usr/bin/env node
// Fila de prioridade das issues (regra em docs/fluxo/prioridade.md).
//
//   node scripts/prioridade.mjs                 → as duas filas
//   node scripts/prioridade.mjs --frente montador  → desempate a favor da frente atual
//
// Pontuação = 3·O + 2·S + A + D − E − R, lida das etiquetas da issue
// (o:1–5, s:1–3, a:1–3, destrava, e:p/m/g, risco). Desempate, em ordem:
// pontos → destrava → não conflita com PR aberto → mesma frente → menor
// esforço → número menor (nunca empata).

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ESFORCO = { p: 1, m: 2, g: 3 };
// Issues que não são trabalho (lembrete, resumo de vistoria, épico).
const FORA_DA_FILA = new Set(["lembrete", "vistoria-resumo", "epic"]);

const val = (labels, prefix) => {
  const l = labels.find((x) => x.startsWith(prefix));
  return l ? l.slice(prefix.length) : null;
};

export function pontuar(labels) {
  const o = Number(val(labels, "o:"));
  const s = Number(val(labels, "s:"));
  const a = Number(val(labels, "a:"));
  const e = ESFORCO[val(labels, "e:")] ?? null;
  if (!o || !s || !a || !e) return null; // sem pontuação completa
  const d = labels.includes("destrava") ? 2 : 0;
  const r = labels.includes("risco") ? 1 : 0;
  return {
    pontos: 3 * o + 2 * s + a + d - e - r,
    o, s, a, e, destrava: d > 0, risco: r > 0,
    frente: val(labels, "frente:"),
    dono: labels.includes("precisa-de-voce") || !labels.includes("autonomo"),
  };
}

// issues: [{ number, title, labels: string[] }]
// emAndamento: números de issues com PR aberto (saem da fila; a frente
// delas conta como "conflita").
export function ordenar(issues, { frente = null, emAndamento = new Set() } = {}) {
  const frentesOcupadas = new Set();
  const pontuadas = [];
  const semPontos = [];
  for (const i of issues) {
    if (i.labels.some((l) => FORA_DA_FILA.has(l))) continue;
    const p = pontuar(i.labels);
    if (!p) { semPontos.push(i); continue; }
    if (emAndamento.has(i.number)) { if (p.frente) frentesOcupadas.add(p.frente); continue; }
    pontuadas.push({ ...i, ...p });
  }
  const cmp = (x, y) =>
    y.pontos - x.pontos ||
    Number(y.destrava) - Number(x.destrava) ||
    Number(frentesOcupadas.has(x.frente)) - Number(frentesOcupadas.has(y.frente)) ||
    Number(y.frente === frente && frente != null) - Number(x.frente === frente && frente != null) ||
    x.e - y.e ||
    x.number - y.number;
  pontuadas.sort(cmp);
  return {
    autonoma: pontuadas.filter((i) => !i.dono),
    dono: pontuadas.filter((i) => i.dono),
    semPontos,
  };
}

function linha(i) {
  const tags = [`O${i.o} S${i.s} A${i.a} E${i.e}`, i.destrava && "destrava", i.risco && "risco", i.frente]
    .filter(Boolean).join(" · ");
  return `${String(i.pontos).padStart(3)}  #${i.number}  ${i.title.slice(0, 70)}  (${tags})`;
}

function main() {
  const args = process.argv.slice(2);
  const fi = args.indexOf("--frente");
  const frente = fi >= 0 ? args[fi + 1] : null;
  const gh = (a) => JSON.parse(execFileSync("gh", a, { encoding: "utf8" }));
  const issues = gh(["issue", "list", "--state", "open", "--limit", "300", "--json", "number,title,labels"])
    .map((i) => ({ number: i.number, title: i.title, labels: i.labels.map((l) => l.name) }));
  // Issue citada por um PR aberto ("#123" no título ou corpo) = em andamento.
  const emAndamento = new Set();
  for (const pr of gh(["pr", "list", "--state", "open", "--json", "title,body"])) {
    for (const m of `${pr.title} ${pr.body}`.matchAll(/#(\d+)/g)) emAndamento.add(Number(m[1]));
  }
  const { autonoma, dono, semPontos } = ordenar(issues, { frente, emAndamento });
  console.log(`Fila autônoma (eu pego sem perguntar)${frente ? ` — frente atual: ${frente}` : ""}`);
  autonoma.forEach((i) => console.log(linha(i)));
  console.log("\nFila do dono (decisão ou ação sua)");
  dono.forEach((i) => console.log(linha(i)));
  if (semPontos.length) {
    console.log("\nSem pontuação (pontuar na triagem):");
    semPontos.forEach((i) => console.log(`       #${i.number}  ${i.title.slice(0, 70)}`));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
