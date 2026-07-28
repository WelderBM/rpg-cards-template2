/**
 * `pnpm template` — renders ONLY the frame (no text/art/price) to
 * output/template-blank.png for visual approval. Does not touch data/cards.json
 * or run the batch build; that's `pnpm build`, and it should wait until this
 * file has been reviewed.
 */
import fssync from "node:fs";
import { PATHS } from "../src/config.js";
import { renderTemplateBlank } from "../src/render.js";
import { generatePlaceholderFrame } from "./generate-placeholder-frame.js";

async function main(): Promise<void> {
  if (!fssync.existsSync(PATHS.frame)) {
    console.log(`No frame found at ${PATHS.frame}.`);
    console.log("Generating a neutral placeholder frame first...");
    await generatePlaceholderFrame();
    console.log("This is NOT approved artwork — see README for how to swap in the real frame.\n");
  }

  const outPath = await renderTemplateBlank();
  console.log(`Frame-only preview written to ${outPath}`);
  console.log("Review it before running `pnpm build`.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
