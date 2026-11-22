/**
 * `pnpm build` — the DEFINITIVE, print-ready build. Renders every card in
 * the catalog (data/cards.json + data/pocoes-*.json, see src/catalog.ts)
 * to output/cards/{id}.png and imposes them onto A4 sheets
 * (8-up, with crop marks) at output/print/sheet-{n}.pdf.
 *
 * The frame comes in two mirrored variants (price coin top-right vs
 * top-left — see src/config.ts FRAME_PATHS/getPriceSlot), so this build
 * requires an explicit side choice: pass it as a CLI arg
 * (`pnpm build -- left` or `pnpm build -- --side=left`), or it will prompt
 * for one interactively. There is no default — a definitive build should
 * never silently guess which coin side is on the printed cards.
 *
 * `--ids=a,b,c` builds only those cards (the whole catalog is still
 * validated). Repeats from data/cards-to-reapeat.json still apply to them.
 * Every run deletes the previous output/print/sheet-*.pdf first.
 *
 * For a quick one-card-each comparison of both sides instead, see `pnpm test`
 * (scripts/test.ts), which writes to output/test/ and never touches
 * output/cards or output/print.
 */
import path from "node:path";
import readline from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { loadCatalog } from "../src/catalog.js";
import { type CoinSide, ROOT_DIR } from "../src/config.js";
import { imposeToPdf } from "../src/impose.js";
import { renderCards, TextOverflowError } from "../src/render.js";
import type { Card } from "../src/types.js";

function parseSideFromArgv(argv: string[]): CoinSide | null {
  for (const arg of argv) {
    const flagMatch = arg.match(/^--side=(left|right)$/);
    if (flagMatch) return flagMatch[1] as CoinSide;
    if (arg === "left" || arg === "right") return arg;
  }
  return null;
}

/**
 * `--ids=balas,flechas` → ["balas", "flechas"]; null when the flag is absent
 * (build everything). Spaces also separate: unquoted in PowerShell, the comma
 * list arrives as "--ids=balas flechas".
 */
function parseIdsFromArgv(argv: string[]): string[] | null {
  for (const arg of argv) {
    const m = arg.match(/^--ids=(.*)$/s);
    if (m) return m[1].split(/[\s,]+/).filter(Boolean);
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
export async function runBuild(side: CoinSide, onlyIds: string[] | null = null): Promise<void> {
  console.log(`=== BUILD DEFINITIVA — lado da moeda: ${side} ===`);

  // Always validates the whole catalog (cards.json + pocoes-*.json), even for a partial build.
  const { cards: catalog, files } = await loadCatalog();
  console.log(`Dados: ${files.map((f) => path.relative(ROOT_DIR, f)).join(" + ")} (${catalog.length} cartas)`);

  let cards: Card[] = catalog;
  if (onlyIds) {
    const unknown = onlyIds.filter((id) => !catalog.some((c) => c.id === id));
    if (unknown.length > 0) throw new Error(`--ids: id(s) not in the catalog: ${unknown.join(", ")}`);
    if (onlyIds.length === 0) throw new Error("--ids= is empty — list at least one card id.");
    cards = catalog.filter((c) => onlyIds.includes(c.id));
    console.log(`Build parcial (--ids): ${cards.map((c) => c.id).join(", ")}`);
  }

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
  await imposeToPdf(
    cards.map((c) => c.id),
    catalog.map((c) => c.id),
  );

  console.log("\nDone. See output/cards/ and output/print/.");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const cliSide = parseSideFromArgv(process.argv.slice(2));
  const side = cliSide ?? (await promptForSide());
  runBuild(side, parseIdsFromArgv(process.argv.slice(2))).catch((err) => {
    if (!(err instanceof TextOverflowError)) console.error(err);
    process.exitCode = 1;
  });
}
