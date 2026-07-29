/**
 * `pnpm dev` — watches data/ and src/ and re-runs the card+sheet build on
 * every change. Intended as a fast preview loop while calibrating slots or
 * editing card data; for the one-shot commands use `pnpm template` / `pnpm build`.
 */
import chokidar from "chokidar";
import { type CoinSide, ROOT_DIR } from "../src/config.js";

// Dev watch mode is a fast PREVIEW loop, not the definitive build — it
// doesn't prompt for a coin side on every rebuild. Pass one on startup
// (`pnpm dev -- left`) if you want to preview the left-coin frame; defaults
// to "right" otherwise.
const side: CoinSide = process.argv.slice(2).includes("left") ? "left" : "right";

let running = false;
let queued = false;

async function runBuild(): Promise<void> {
  if (running) {
    queued = true;
    return;
  }
  running = true;
  queued = false;

  console.log(`\n[dev] rebuilding (lado: ${side}) at ${new Date().toLocaleTimeString()}...`);
  try {
    // Cache-busted import so edited modules (and their transitive imports) are
    // picked up fresh on every rebuild, without restarting the watcher process.
    const { runBuild: run } = await import(`./build.js?t=${Date.now()}`);
    await run(side);
  } catch (err) {
    console.error("[dev] build failed:", err);
  } finally {
    running = false;
    if (queued) await runBuild();
  }
}

function main(): void {
  const watcher = chokidar.watch(["data", "src", "assets/frame"], {
    cwd: ROOT_DIR,
    ignoreInitial: true,
  });

  watcher.on("add", runBuild).on("change", runBuild).on("unlink", runBuild);

  console.log("[dev] watching data/, src/, assets/frame/ for changes (Ctrl+C to stop)...");
  runBuild();
}

main();
