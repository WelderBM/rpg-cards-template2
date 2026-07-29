/**
 * `pnpm build` — the DEFINITIVE, print-ready build. Renders every card in
 * data/cards.json to output/cards/{id}.png and imposes them onto A4 sheets
 * (8-up, with crop marks) at output/print/sheet-{n}.pdf.
 *
 * The frame comes in two mirrored variants (price coin top-right vs
 * top-left — see src/config.ts FRAME_PATHS/getPriceSlot), so this build
 * requires an explicit side choice: pass it as a CLI arg
 * (`pnpm build -- left` or `pnpm build -- --side=left`), or it will prompt
 * for one interactively. There is no default — a definitive build should
 * never silently guess which coin side is on the printed cards.
 *
 * For a quick one-card-each comparison of both sides instead, see `pnpm test`
 * (scripts/test.ts), which writes to output/test/ and never touches
 * output/cards or output/print.
 */
import fs from "node:fs/promises";
import readline from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { type CoinSide, FOOTER_CELL_COUNT, PATHS } from "../src/config.js";
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

function parseSideFromArgv(argv: string[]): CoinSide | null {
  for (const arg of argv) {
    const flagMatch = arg.match(/^--side=(left|right)$/);
    if (flagMatch) return flagMatch[1] as CoinSide;
    if (arg === "left" || arg === "right") return arg;
  }
  return null;
}

/** Prompts on stdin until the user types a valid side. Used only when the CLI arg is omitted. */
async function promptForSide(): Promise<CoinSide> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const answer = (await rl.question('Lado da moeda de preço — "left" ou "right"? ')).trim().toLowerCase();
      if (answer === "left" || answer === "right") return answer;
      console.log('Resposta inválida — digite "left" ou "right".');
    }
  } finally {
    rl.close();
  }
}

/** Runs the full render+impose pipeline for the given coin side. Returns normally on success, throws on failure. */
export async function runBuild(side: CoinSide): Promise<void> {
  console.log(`=== BUILD DEFINITIVA — lado da moeda: ${side} ===`);

  const raw = await fs.readFile(PATHS.data, "utf-8");
  const cards: Card[] = JSON.parse(raw);

  validateCards(cards);

  console.log(`Rendering ${cards.length} card(s)...`);
  try {
    await renderCards(cards, side);
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

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const cliSide = parseSideFromArgv(process.argv.slice(2));
  const side = cliSide ?? (await promptForSide());
  runBuild(side).catch((err) => {
    if (!(err instanceof TextOverflowError)) console.error(err);
    process.exitCode = 1;
  });
}
