import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { PATHS, ROOT_DIR } from "./config.js";
import { loadDotEnv } from "./env.js";

/** Last synced hash per sheet, so an unchanged sheet is not copied (and re-uploaded by Drive) again. */
const MANIFEST = path.join(ROOT_DIR, "output", ".print-sync.json");
const isSheet = (name: string) => /^sheet-\d+\.pdf$/.test(name);

async function listSheets(dir: string): Promise<string[]> {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const name of await fs.readdir(path.join(dir, entry.name))) {
      if (isSheet(name)) out.push(`${entry.name}/${name}`);
    }
  }
  return out;
}

/**
 * Mirrors output/print/ into PRINT_SYNC_DIR (env or .env), e.g. a folder of
 * Google Drive for Desktop ("G:\Meu Drive\Cartas RPG - print"), so the
 * printable sheets in the Drive always match the last build: changed sheets
 * are copied, sheets that no longer exist are removed there. Unset = no sync.
 * When the folder can't be reached (Drive app closed), the build still
 * succeeds but says so loudly: the copies there are then out of date.
 */
export async function syncPrintFolder(): Promise<void> {
  loadDotEnv();
  const dest = process.env.PRINT_SYNC_DIR;
  if (!dest) return;
  if (!existsSync(path.dirname(dest))) {
    console.error(
      `\n!!! DRIVE NÃO SINCRONIZADO: ${path.dirname(dest)} não está acessível (o app do Google Drive está aberto e logado?).` +
        `\n!!! As folhas de lá ficaram desatualizadas. Abra o Drive e rode: pnpm sync-print`,
    );
    return;
  }

  let manifest: { dest?: string; files: Record<string, string> } = { files: {} };
  try {
    manifest = JSON.parse(await fs.readFile(MANIFEST, "utf-8"));
  } catch {
    /* first sync */
  }
  if (manifest.dest !== dest) manifest = { dest, files: {} };

  const local = await listSheets(PATHS.outputPrint);
  let removed = 0;
  for (const rel of await listSheets(dest)) {
    if (!local.includes(rel)) {
      await fs.rm(path.join(dest, rel));
      delete manifest.files[rel];
      removed++;
    }
  }
  let copied = 0;
  for (const rel of local) {
    const from = path.join(PATHS.outputPrint, rel);
    const to = path.join(dest, rel);
    const hash = createHash("sha256").update(await fs.readFile(from)).digest("hex");
    const same = manifest.files[rel] === hash && existsSync(to) && (await fs.stat(to)).size === (await fs.stat(from)).size;
    if (same) continue;
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(from, to);
    manifest.files[rel] = hash;
    copied++;
  }
  await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Drive: ${copied} folha(s) copiada(s), ${local.length - copied} igual(is), ${removed} removida(s) → ${dest}`);
}

const isMain = process.argv[1]?.endsWith("sync.ts");
if (isMain) {
  syncPrintFolder().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
