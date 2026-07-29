/**
 * `pnpm test` — quick visual comparison, NOT the definitive build. Renders
 * exactly ONE sample card (the first entry in data/cards.json) with each
 * coin side, side by side, to output/test/:
 *   - exemplo-moeda-direita.png (right — the original layout)
 *   - exemplo-moeda-esquerda.png (left — the new mirrored frame)
 *
 * Never touches output/cards/ or output/print/ — for the real, print-ready
 * batch (which requires picking ONE side), use `pnpm build` instead.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PATHS } from "../src/config.js";
import { renderSingleCard } from "../src/render.js";
import type { Card } from "../src/types.js";

export async function runTest(): Promise<void> {
  console.log("=== TESTE — comparação lado a lado (não é a build definitiva) ===");

  const raw = await fs.readFile(PATHS.data, "utf-8");
  const cards: Card[] = JSON.parse(raw);
  if (cards.length === 0) throw new Error("data/cards.json is empty — need at least one card to test.");
  const sample = cards[0];

  await fs.mkdir(PATHS.outputTest, { recursive: true });

  const rightPath = path.join(PATHS.outputTest, "exemplo-moeda-direita.png");
  const leftPath = path.join(PATHS.outputTest, "exemplo-moeda-esquerda.png");

  await renderSingleCard(sample, "right", rightPath);
  console.log(`  rendered ${rightPath}`);
  await renderSingleCard(sample, "left", leftPath);
  console.log(`  rendered ${leftPath}`);

  console.log("\nDone. See output/test/ (2 images).");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runTest().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
