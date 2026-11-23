import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { PATHS, ROOT_DIR } from "./config.js";
import { loadDotEnv } from "./env.js";

/** Last synced hash per file, so an unchanged file is not copied (and re-uploaded by Drive) again. */
const MANIFEST = path.join(ROOT_DIR, "output", ".drive-sync.json");

/** What is mirrored: local folder → subfolder of DRIVE_SYNC_DIR, one level of type folders inside. */
const MIRRORS = [
  { from: PATHS.outputPrint, to: "imprimir", file: /^sheet-\d+\.pdf$/ },
  { from: PATHS.outputCards, to: "cards", file: /\.png$/ },
];

async function listFiles(dir: string, file: RegExp): Promise<string[]> {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const name of await fs.readdir(path.join(dir, entry.name))) {
      if (file.test(name)) out.push(`${entry.name}/${name}`);
    }
  }
  return out;
}

/**
 * Mirrors output/print/ → {DRIVE_SYNC_DIR}/imprimir/ and output/cards/ →
 * {DRIVE_SYNC_DIR}/cards/. DRIVE_SYNC_DIR (env or .env) is a Google Drive for
 * Desktop folder, e.g. "G:\Meu Drive\Cartas RPG". Owner's hard rule: what
 * changes here must change there. Changed files are copied, files that no
 * longer exist here are removed there. Unset = no sync. When the folder can't
 * be reached (Drive app closed), the build still succeeds but says so loudly.
 */
export async function syncToDrive(): Promise<void> {
  loadDotEnv();
  const root = process.env.DRIVE_SYNC_DIR;
  if (!root) return;
  // "D:pasta" (no slash after the drive) is relative to D:'s current folder on
  // Windows: the copy would land somewhere else entirely. Absolute paths only.
  if (!path.isAbsolute(root) || /^[A-Za-z]:(?![\\/])/.test(root)) {
    throw new Error(`DRIVE_SYNC_DIR precisa ser um caminho absoluto (ex.: D:/.../Cartas RPG), veio "${root}".`);
  }
  if (!existsSync(path.dirname(root))) {
    console.error(
      `\n!!! DRIVE NÃO SINCRONIZADO: ${path.dirname(root)} não está acessível (o app do Google Drive está aberto e logado?).` +
        `\n!!! O Drive ficou desatualizado. Abra o Drive e rode: pnpm sync-drive`,
    );
    return;
  }

  let manifest: { root?: string; files: Record<string, string> } = { files: {} };
  try {
    manifest = JSON.parse(await fs.readFile(MANIFEST, "utf-8"));
  } catch {
    /* first sync */
  }
  if (manifest.root !== root) manifest = { root, files: {} };

  for (const mirror of MIRRORS) {
    const dest = path.join(root, mirror.to);
    const local = await listFiles(mirror.from, mirror.file);
    let removed = 0;
    for (const rel of await listFiles(dest, mirror.file)) {
      if (!local.includes(rel)) {
        await fs.rm(path.join(dest, rel));
        delete manifest.files[`${mirror.to}/${rel}`];
        removed++;
      }
    }
    let copied = 0;
    for (const rel of local) {
      const key = `${mirror.to}/${rel}`;
      const from = path.join(mirror.from, rel);
      const to = path.join(dest, rel);
      const hash = createHash("sha256").update(await fs.readFile(from)).digest("hex");
      const same = manifest.files[key] === hash && existsSync(to) && (await fs.stat(to)).size === (await fs.stat(from)).size;
      if (same) continue;
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
      manifest.files[key] = hash;
      copied++;
    }
    console.log(`Drive ${mirror.to}/: ${copied} copiado(s), ${local.length - copied} igual(is), ${removed} removido(s)`);
  }
  await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Drive sincronizado → ${root}`);
}

const isMain = process.argv[1]?.endsWith("sync.ts");
if (isMain) {
  syncToDrive().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
