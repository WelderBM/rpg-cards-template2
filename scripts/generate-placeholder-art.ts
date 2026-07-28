/**
 * One-off generator for placeholder item-art PNGs used by the example cards
 * in data/cards.json. Reuses the already-vendored game-icons.net SVGs so the
 * repo doesn't need extra unlicensed images just to demonstrate the pipeline.
 * Replace assets/art/*.png with real item art per card as needed.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { PATHS } from "../src/config.js";

const ART_SIZE_PX = 900;

// Fully transparent background: the art now floats directly on the parchment
// (drawn on top of the frame, with a CSS drop-shadow), so it needs real alpha
// around the item silhouette rather than a filled backing shape.
const PLACEHOLDER_ARTS: { file: string; icon: string }[] = [
  { file: "espada-longa.png", icon: "broadsword.svg" },
  { file: "pocao-cura.png", icon: "potion-ball.svg" },
];

async function main(): Promise<void> {
  await fs.mkdir(PATHS.art, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: ART_SIZE_PX, height: ART_SIZE_PX }, deviceScaleFactor: 1 });
    for (const { file, icon } of PLACEHOLDER_ARTS) {
      const svg = await fs.readFile(path.join(PATHS.icons, icon), "utf-8");
      const html = `<!DOCTYPE html><html><head><style>
        * { margin:0; padding:0; }
        body { width:${ART_SIZE_PX}px; height:${ART_SIZE_PX}px; display:flex; align-items:center; justify-content:center; }
        svg { width:80%; height:80%; }
      </style></head><body>${svg}</body></html>`;
      await page.setContent(html, { waitUntil: "load" });
      const outPath = path.join(PATHS.art, file);
      await page.screenshot({ path: outPath, omitBackground: true });
      console.log(`  wrote ${outPath}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
