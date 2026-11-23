/**
 * `pnpm test` — quick visual comparison, NOT the definitive build. Renders
 * each sample with BOTH coin sides to output/test/{id}-moeda-{direita,esquerda}.png.
 *
 *   pnpm test                 → the potion samples (DEFAULT_SAMPLE_IDS): the shortest
 *                               text, a resistance in the footer, and the two longest texts
 *   pnpm test -- flechas      → any catalog card(s) by id instead
 *
 * Never touches output/cards/ or output/print/ — for the real, print-ready
 * batch (which requires picking ONE side), use `pnpm build` instead.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadCatalog } from "../src/catalog.js";
import { PATHS } from "../src/config.js";
import { renderSingleCard } from "../src/render.js";
import type { Card } from "../src/types.js";

// Extremes of the potion layout: shortest text, a long resistance in the narrow
// footer cell, and the two longest descriptions (autofit stress test).
const DEFAULT_SAMPLE_IDS = ["curar-ferimentos-i", "sono", "compreensao", "visao-mistica"];

export async function runTest(ids: string[] = []): Promise<void> {
  console.log("=== TESTE — comparação lado a lado (não é a build definitiva) ===");

  const { cards: catalog } = await loadCatalog();

  const wanted = ids.length > 0 ? ids : DEFAULT_SAMPLE_IDS;
  const unknown = wanted.filter((id) => !catalog.some((card) => card.id === id));
  if (unknown.length > 0) throw new Error(`id(s) not in the catalog: ${unknown.join(", ")}`);
  const samples: Card[] = catalog.filter((card) => wanted.includes(card.id));

  await fs.mkdir(PATHS.outputTest, { recursive: true });

  for (const sample of samples) {
    const rightPath = path.join(PATHS.outputTest, `${sample.id}-moeda-direita.png`);
    const leftPath = path.join(PATHS.outputTest, `${sample.id}-moeda-esquerda.png`);

    await renderSingleCard(sample, "right", rightPath);
    console.log(`  rendered ${rightPath}`);
    await renderSingleCard(sample, "left", leftPath);
    console.log(`  rendered ${leftPath}`);
  }

  console.log(`\nDone. See output/test/ (${samples.length * 2} images).`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  // pnpm may forward the "--" separator itself; card ids never start with "-".
  runTest(process.argv.slice(2).filter((arg) => !arg.startsWith("-"))).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
