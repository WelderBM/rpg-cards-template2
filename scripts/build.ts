/**
 * `pnpm build` — renders every card in data/cards.json to output/cards/{id}.png
 * and imposes them onto A4 sheets (8-up, with crop marks) at output/print/sheet-{n}.pdf.
 */
import fs from "node:fs/promises";
import { FOOTER_CELL_COUNT, PATHS } from "../src/config.js";
import { imposeToPdf } from "../src/impose.js";
import { renderCards, TextOverflowError } from "../src/render.js";
import type { Card } from "../src/types.js";

function validateCards(cards: Card[]): void {
  const seenIds = new Set<string>();
  for (const card of cards) {
    if (!card.id) throw new Error("Every card needs a non-empty `id`.");
    if (seenIds.has(card.id)) throw new Error(`Duplicate card id "${card.id}" in data/cards.json.`);
    seenIds.add(card.id);

    if (!["arma", "item", "pocao"].includes(card.tipo)) {
      throw new Error(`Card "${card.id}": invalid tipo "${card.tipo}" (expected arma|item|pocao).`);
    }
    if (card.atributos.length !== FOOTER_CELL_COUNT) {
      throw new Error(
        `Card "${card.id}": atributos must have exactly ${FOOTER_CELL_COUNT} entries (got ${card.atributos.length}).`,
      );
    }
  }
}

/** Runs the full render+impose pipeline. Returns normally on success, throws on failure. */
export async function runBuild(): Promise<void> {
  const raw = await fs.readFile(PATHS.data, "utf-8");
  const cards: Card[] = JSON.parse(raw);

  validateCards(cards);

  console.log(`Rendering ${cards.length} card(s)...`);
  try {
    await renderCards(cards);
  } catch (err) {
    if (err instanceof TextOverflowError) {
      console.error(`\nBuild failed: ${err.message}`);
      console.error("Shorten the text, or widen the slot / raise font min-max in src/config.ts.");
      throw err;
    }
    throw err;
  }

  console.log("Imposing sheets...");
  await imposeToPdf(cards.map((c) => c.id));

  console.log("\nDone. See output/cards/ and output/print/.");
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runBuild().catch((err) => {
    if (!(err instanceof TextOverflowError)) console.error(err);
    process.exitCode = 1;
  });
}
