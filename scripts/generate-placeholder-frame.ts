/**
 * Generator for a NEUTRAL placeholder assets/frame/frame.png.
 * Run directly with: pnpm exec tsx scripts/generate-placeholder-frame.ts
 *
 * This is only meant to unblock development before the real, approved
 * pergaminho frame artwork is dropped in. It renders the configured SLOTS
 * as labeled, color-coded guide boxes so it doubles as a calibration aid.
 * Re-run it any time SLOTS changes in src/config.ts to refresh the guide.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { buildPlaceholderFrameHtml } from "../src/card.html.js";
import { CANVAS_HEIGHT_PX, CANVAS_WIDTH_PX, PATHS } from "../src/config.js";

export async function generatePlaceholderFrame(): Promise<string> {
  await fs.mkdir(path.dirname(PATHS.frame), { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: CANVAS_WIDTH_PX, height: CANVAS_HEIGHT_PX },
      deviceScaleFactor: 1,
    });
    await page.setContent(buildPlaceholderFrameHtml(), { waitUntil: "load" });
    await page.screenshot({ path: PATHS.frame });
  } finally {
    await browser.close();
  }

  return PATHS.frame;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  generatePlaceholderFrame()
    .then((framePath) => {
      console.log(`Placeholder frame written to ${framePath}`);
      console.log("This is NOT approved artwork — replace it with the real pergaminho frame when ready (see README).");
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
}
