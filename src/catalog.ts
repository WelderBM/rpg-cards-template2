import fs from "node:fs/promises";
import path from "node:path";
import { PATHS } from "./config.js";
import type { Card } from "./types.js";
import { validateCards } from "./validation.js";

/** Extra data files picked up next to data/cards.json: data/pocoes-*.json and data/armaduras*.json. */
const EXTRA_DATA_FILE = /^(pocoes-.+|armaduras.*)\.json$/;

/**
 * The card catalog = data/cards.json + every data/pocoes-*.json and
 * data/armaduras*.json, in that
 * order (extra files sorted by name). The potion files are kept as the game
 * master's literal source instead of being merged into cards.json, so a new
 * circle is just a new file and there is no second copy to drift. The whole
 * catalog is validated together, so an id repeated across files still fails.
 */
export async function loadCatalog(): Promise<{ cards: Card[]; files: string[] }> {
  const dataDir = path.dirname(PATHS.data);
  const extra = (await fs.readdir(dataDir)).filter((name) => EXTRA_DATA_FILE.test(name)).sort();
  const files = [PATHS.data, ...extra.map((name) => path.join(dataDir, name))];

  const all: unknown[] = [];
  for (const file of files) {
    const parsed: unknown = JSON.parse(await fs.readFile(file, "utf-8"));
    if (!Array.isArray(parsed)) throw new Error(`${path.relative(path.dirname(dataDir), file)} must contain a JSON array of cards.`);
    all.push(...parsed);
  }
  validateCards(all);
  return { cards: all, files };
}
