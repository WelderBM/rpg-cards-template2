/**
 * `pnpm art` — generates item art with Gemini (Google AI) from
 * data/art-prompts.json and saves it, background cut out, as
 * assets/art/{id}.png (the path cards use in `imagem`).
 *
 *   pnpm art                          → every id in art-prompts.json that has no art yet
 *   pnpm art -- sono luz              → only these ids
 *   pnpm art -- sono --variacoes=3    → 3 candidates for review instead of 1
 *   pnpm art -- sono --refazer        → regenerate even if assets/art/sono.png exists
 *   pnpm art -- --aprovar=sono:2      → copy candidate 2 of sono to assets/art/sono.png
 *
 * Candidates go to output/arte/{id}-v{n}.png, each with a preview of the card
 * on both coin sides ({id}-v{n}-moeda-{direita,esquerda}.png). With a single
 * variation (the default) the candidate is also installed in assets/art/ right
 * away; with several, pick one with --aprovar.
 *
 * Needs GEMINI_API_KEY in the environment or in .env (git-ignored). Model:
 * GEMINI_IMAGE_MODEL, default below. Card texts never come from here — this
 * only draws the picture.
 */
import { existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Page } from "playwright";
import { loadCatalog } from "../src/catalog.js";
import { PATHS, ROOT_DIR } from "../src/config.js";
import { renderSingleCard } from "../src/render.js";
import type { Card } from "../src/types.js";

const PROMPTS_FILE = path.join(ROOT_DIR, "data/art-prompts.json");
const CANDIDATES_DIR = path.join(ROOT_DIR, "output/arte");
const DEFAULT_MODEL = "gemini-nano-banana-2.1";
const API_BASE = "https://generativelanguage.googleapis.com/v1/models";

/** Appended to every prompt: the cut-out below depends on a clean white background. */
const TECHNICAL_RULES =
  "Technical requirements: a single object, isolated, on a perfectly flat pure white (#FFFFFF) background " +
  "with no cast shadow; nothing touches the image edges; no text or lettering of any kind.";

/** Background cut-out: max RGB distance from white still treated as background (flood-filled from the edges). */
const BG_TOLERANCE = 28;

interface ArtPrompts {
  estilo: string;
  evitar: string;
  itens: Record<string, string>;
}

/** Minimal .env reader (KEY=VALUE lines); real environment variables win. */
function loadDotEnv(): void {
  const file = path.join(ROOT_DIR, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function buildPrompt(prompts: ArtPrompts, id: string): string {
  return `${prompts.estilo}\n\nObject: ${prompts.itens[id]}\n\n${TECHNICAL_RULES}\n\nAvoid: ${prompts.evitar}`;
}

/** One Gemini generateContent call → the first image part (base64 + mime type). */
async function generateImage(prompt: string, apiKey: string, model: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(`${API_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: "1:1", imageSize: "1K" },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini respondeu ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  const json = (await res.json()) as {
    candidates?: { finishReason?: string; content?: { parts?: Record<string, any>[] } }[];
  };
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = part.inlineData ?? part.inline_data;
    if (inline?.data) return { data: inline.data, mimeType: inline.mimeType ?? inline.mime_type ?? "image/png" };
  }
  const text = parts.map((p) => p.text).filter(Boolean).join(" ");
  throw new Error(`Gemini não devolveu imagem (finishReason=${json.candidates?.[0]?.finishReason ?? "?"}) ${text}`.trim());
}

/**
 * Makes the white background transparent and trims it, in the browser canvas.
 * Flood-fill from the 4 edges (not "every white pixel"), so white highlights
 * INSIDE the glass stay opaque; the 2-pixel rim next to the background gets a
 * soft partial alpha. With real alpha, the card's drop-shadow follows the
 * object's outline, as in the reference card.
 */
export async function cutOutBackground(page: Page, base64: string, mimeType: string): Promise<Buffer> {
  // tsx/esbuild wraps named inner functions in __name(...), which doesn't
  // exist in the page; a string is never transformed, so define it there.
  await page.evaluate("globalThis.__name = (fn) => fn");
  const dataUrl = await page.evaluate(
    async ({ src, tol }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const image = ctx.getImageData(0, 0, w, h);
      const px = image.data;
      const distFromWhite = (k: number) => {
        const r = 255 - px[k * 4], g = 255 - px[k * 4 + 1], b = 255 - px[k * 4 + 2];
        return Math.sqrt(r * r + g * g + b * b);
      };

      // 0 = object, 1 = background, 2/3 = rim rings next to the background.
      const mark = new Uint8Array(w * h);
      const queue = new Int32Array(w * h);
      let head = 0;
      let tail = 0;
      const visit = (x: number, y: number) => {
        const k = y * w + x;
        if (mark[k] === 0 && distFromWhite(k) <= tol) {
          mark[k] = 1;
          queue[tail++] = k;
        }
      };
      for (let x = 0; x < w; x++) { visit(x, 0); visit(x, h - 1); }
      for (let y = 0; y < h; y++) { visit(0, y); visit(w - 1, y); }
      while (head < tail) {
        const k = queue[head++];
        const x = k % w;
        const y = (k - x) / w;
        if (x > 0) visit(x - 1, y);
        if (x < w - 1) visit(x + 1, y);
        if (y > 0) visit(x, y - 1);
        if (y < h - 1) visit(x, y + 1);
      }
      const touches = (k: number, value: number) => {
        const x = k % w;
        const y = (k - x) / w;
        return (x > 0 && mark[k - 1] === value) || (x < w - 1 && mark[k + 1] === value) ||
          (y > 0 && mark[k - w] === value) || (y < h - 1 && mark[k + w] === value);
      };
      for (let k = 0; k < w * h; k++) if (mark[k] === 0 && touches(k, 1)) mark[k] = 2;
      for (let k = 0; k < w * h; k++) if (mark[k] === 0 && touches(k, 2)) mark[k] = 3;

      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let k = 0; k < w * h; k++) {
        const strength = Math.min(1, distFromWhite(k) / (tol * 4));
        const alpha = mark[k] === 1 ? 0 : mark[k] === 2 ? 0.35 + 0.65 * strength : mark[k] === 3 ? 0.75 + 0.25 * strength : 1;
        px[k * 4 + 3] = Math.round(alpha * 255);
        if (alpha > 0) {
          const x = k % w;
          const y = (k - x) / w;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX < 0) throw new Error("imagem ficou vazia após remover o fundo");
      ctx.putImageData(image, 0, 0);

      const margin = Math.round(Math.max(maxX - minX, maxY - minY) * 0.03);
      const sx = Math.max(0, minX - margin);
      const sy = Math.max(0, minY - margin);
      const sw = Math.min(w, maxX + margin + 1) - sx;
      const sh = Math.min(h, maxY + margin + 1) - sy;
      const out = document.createElement("canvas");
      out.width = sw;
      out.height = sh;
      out.getContext("2d")!.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      return out.toDataURL("image/png");
    },
    { src: `data:${mimeType};base64,${base64}`, tol: BG_TOLERANCE },
  );
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
}

/** A catalog card to preview the art in; a stand-in potion card when the id isn't in the catalog yet. */
function previewCard(catalog: Card[], id: string, imagem: string): Card {
  const real = catalog.find((c) => c.id === id);
  if (real) return { ...real, imagem };
  const titulo = id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  return {
    id, tipo: "pocao", titulo, subtitulo: "Poção", circulo: 1, pm: 1, preco: "T$30",
    descricao: "Prévia da arte. O texto desta carta vem da mestre.",
    atributos: [{ valor: "" }, { valor: "" }, { valor: "" }],
    imagem,
  };
}

function parseArgs(argv: string[]) {
  const ids = argv.filter((a) => !a.startsWith("-"));
  const flag = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const variations = Number(flag("variacoes") ?? 1);
  if (!Number.isInteger(variations) || variations < 1 || variations > 4) throw new Error("--variacoes deve ser de 1 a 4.");
  return { ids, variations, redo: argv.includes("--refazer"), approve: flag("aprovar") };
}

async function approve(spec: string): Promise<void> {
  for (const pick of spec.split(",")) {
    const [id, n] = pick.split(":");
    const from = path.join(CANDIDATES_DIR, `${id}-v${n}.png`);
    if (!existsSync(from)) throw new Error(`Não existe ${path.relative(ROOT_DIR, from)} — gere antes com pnpm art -- ${id} --variacoes=N.`);
    const to = path.join(PATHS.art, `${id}.png`);
    await fs.copyFile(from, to);
    console.log(`  aprovada: ${path.relative(ROOT_DIR, from)} → ${path.relative(ROOT_DIR, to)}`);
  }
}

export async function runArt(argv: string[]): Promise<void> {
  loadDotEnv();
  const args = parseArgs(argv);
  if (args.approve) return approve(args.approve);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta GEMINI_API_KEY. Crie o arquivo .env na raiz com a linha GEMINI_API_KEY=<sua chave> (o .env não vai para o git).");
  }
  const model = process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;
  const prompts = JSON.parse(await fs.readFile(PROMPTS_FILE, "utf-8")) as ArtPrompts;
  const unknown = args.ids.filter((id) => !(id in prompts.itens));
  if (unknown.length > 0) throw new Error(`Sem prompt em data/art-prompts.json para: ${unknown.join(", ")}`);

  const wanted = args.ids.length > 0 ? args.ids : Object.keys(prompts.itens);
  const todo = wanted.filter((id) => {
    if (args.redo || args.variations > 1 || !existsSync(path.join(PATHS.art, `${id}.png`))) return true;
    console.log(`  ${id}: já tem assets/art/${id}.png (use --refazer para gerar de novo)`);
    return false;
  });
  if (todo.length === 0) return;

  const { cards: catalog } = await loadCatalog();
  await fs.mkdir(CANDIDATES_DIR, { recursive: true });
  console.log(`=== ARTE — ${todo.length} item(ns) × ${args.variations} variação(ões), modelo ${model} ===`);

  const browser = await chromium.launch();
  const failures: string[] = [];
  try {
    const page = await browser.newPage();
    for (const id of todo) {
      for (let n = 1; n <= args.variations; n++) {
        const candidate = path.join(CANDIDATES_DIR, `${id}-v${n}.png`);
        try {
          const image = await generateImage(buildPrompt(prompts, id), apiKey, model);
          await fs.writeFile(candidate, await cutOutBackground(page, image.data, image.mimeType));
          const rel = path.relative(ROOT_DIR, candidate).split(path.sep).join("/");
          const card = previewCard(catalog, id, rel);
          await renderSingleCard(card, "right", path.join(CANDIDATES_DIR, `${id}-v${n}-moeda-direita.png`));
          await renderSingleCard(card, "left", path.join(CANDIDATES_DIR, `${id}-v${n}-moeda-esquerda.png`));
          console.log(`  ${id} v${n}: ${rel} (+ prévias nos dois lados)`);
        } catch (err) {
          failures.push(`${id} v${n}: ${(err as Error).message}`);
          console.error(`  FALHOU ${id} v${n}: ${(err as Error).message}`);
        }
      }
      if (args.variations === 1 && existsSync(path.join(CANDIDATES_DIR, `${id}-v1.png`)) && !failures.some((f) => f.startsWith(`${id} `))) {
        await fs.copyFile(path.join(CANDIDATES_DIR, `${id}-v1.png`), path.join(PATHS.art, `${id}.png`));
        console.log(`    instalada em assets/art/${id}.png`);
      }
    }
  } finally {
    await browser.close();
  }

  if (args.variations > 1) console.log("\nEscolha com: pnpm art -- --aprovar=<id>:<n>[,<id>:<n>…]");
  if (failures.length > 0) throw new Error(`${failures.length} geração(ões) falharam:\n  ${failures.join("\n  ")}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runArt(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
