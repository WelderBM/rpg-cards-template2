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
 *   pnpm art -- --recortar=sono:2     → redo the cut-out of candidate 2 (no API call, no cost)
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
import type { Card, CardType } from "../src/types.js";

const PROMPTS_FILE = path.join(ROOT_DIR, "data/art-prompts.json");
const CANDIDATES_DIR = path.join(ROOT_DIR, "output/arte");
const DEFAULT_MODEL = "gemini-nano-banana-2.1";
const API_BASE = "https://generativelanguage.googleapis.com/v1/models";

/** Appended to every prompt: the cut-out below depends on a clean white background. */
const TECHNICAL_RULES =
  "Technical requirements: a single item (one object, or one compact group for ammunition), isolated, on a perfectly flat pure white (#FFFFFF) background " +
  "with no cast shadow; nothing touches the image edges; no text or lettering of any kind.";

/** Background cut-out: max RGB distance from white still treated as background (flood-filled from the edges). */
const BG_TOLERANCE = 28;
/**
 * Soft zone of the cut-out: light, grey (low-saturation) pixels reachable from
 * the background within SOFT_MAX_DEPTH_PX (smoke, mist, wisps) become
 * translucent (colour-to-alpha against white) instead of being chopped at the
 * tolerance line. Coloured or darker pixels (glass rims, cork, iron) stop it.
 */
const SOFT_MAX_DIST = 120;
const SOFT_MAX_SATURATION = 28;
const SOFT_MAX_DEPTH_PX = 24;
// Enclosed gaps (between a bow and its string, chain links, a net's mesh):
// the edge flood-fill never reaches them, so their white would stay opaque.
// A closed region this close to pure white and at least this big is
// background too. Only for non-potion art: a potion's pale smoke or a glass
// highlight could pass the test, and the 17 potions are already approved.
const HOLE_MAX_DIST = 12;
const HOLE_MIN_AREA_FRACTION = 0.0005; // 0.05% of the image (~520 px at 1024²)
// Smaller closed specks (white between a net's ropes, inside chain links) are
// background too when the ring 3 px around them is dark (seen through dark
// material). A specular highlight fades out into a light ring, so it stays.
const SPECK_MIN_AREA_PX = 6;
const SPECK_RING_MIN_DIST = 80;

interface ArtPrompts {
  /** Default style (written for the potions). */
  estilo: string;
  evitar: string;
  /** Optional per-type style/avoid list (arma, municao, armadura...), replacing the default for that type. */
  estilos?: Partial<Record<CardType, string>>;
  evitar_por_tipo?: Partial<Record<CardType, string>>;
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

function buildPrompt(prompts: ArtPrompts, id: string, tipo: CardType | undefined): string {
  const estilo = (tipo && prompts.estilos?.[tipo]) || prompts.estilo;
  const evitar = (tipo && prompts.evitar_por_tipo?.[tipo]) || prompts.evitar;
  return `${estilo}\n\nObject: ${prompts.itens[id]}\n\n${TECHNICAL_RULES}\n\nAvoid: ${evitar}`;
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
    usageMetadata?: Record<string, unknown>;
  };
  // Billing is per token: log the usage of every call so spending stays visible.
  if (json.usageMetadata) console.log(`    uso: ${JSON.stringify(json.usageMetadata)}`);
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
 *
 * The image is drawn over white with a small white border first, so a PNG
 * that was already cut out (transparent background) comes back as the
 * original white-background image: `--recortar` relies on that.
 */
export async function cutOutBackground(
  page: Page,
  base64: string,
  mimeType: string,
  opts: { holes?: boolean } = {},
): Promise<Buffer> {
  // tsx/esbuild wraps named inner functions in __name(...), which doesn't
  // exist in the page; a string is never transformed, so define it there.
  await page.evaluate("globalThis.__name = (fn) => fn");
  const dataUrl = await page.evaluate(
    async ({ src, tol, softDist, softSat, softDepth, holeDist, holeArea, speckArea, speckRing }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const pad = 8;
      const w = img.naturalWidth + pad * 2;
      const h = img.naturalHeight + pad * 2;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, pad, pad);
      const image = ctx.getImageData(0, 0, w, h);
      const px = image.data;
      const distFromWhite = (k: number) => {
        const r = 255 - px[k * 4], g = 255 - px[k * 4 + 1], b = 255 - px[k * 4 + 2];
        return Math.sqrt(r * r + g * g + b * b);
      };
      const saturation = (k: number) =>
        Math.max(px[k * 4], px[k * 4 + 1], px[k * 4 + 2]) - Math.min(px[k * 4], px[k * 4 + 1], px[k * 4 + 2]);

      // 0 = object, 1 = background, 2/3 = rim rings next to the background, 4 = soft zone (smoke, mist).
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
      // Enclosed gaps: closed near-white regions big enough to be background seen through the object.
      if (holeArea > 0) {
        const minArea = Math.max(200, Math.round(holeArea * w * h));
        const seen = new Uint8Array(w * h);
        for (let s = 0; s < w * h; s++) {
          if (mark[s] !== 0 || seen[s] || distFromWhite(s) > holeDist) continue;
          const comp: number[] = [];
          head = 0;
          tail = 0;
          queue[tail++] = s;
          seen[s] = 1;
          while (head < tail) {
            const k = queue[head++];
            comp.push(k);
            const x = k % w;
            const y = (k - x) / w;
            for (const n of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1]) {
              if (n >= 0 && mark[n] === 0 && !seen[n] && distFromWhite(n) <= holeDist) {
                seen[n] = 1;
                queue[tail++] = n;
              }
            }
          }
          if (comp.length >= minArea) {
            for (const k of comp) mark[k] = 1;
          } else if (comp.length >= speckArea) {
            // Ring 3 px out from the speck: mean distance from white.
            const ringDepth = new Map<number, number>();
            for (const k of comp) ringDepth.set(k, 0);
            let frontier = comp.slice();
            let sum = 0;
            let count = 0;
            for (let d = 1; d <= 3; d++) {
              const next: number[] = [];
              for (const k of frontier) {
                const x = k % w;
                const y = (k - x) / w;
                for (const n of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1]) {
                  if (n >= 0 && !ringDepth.has(n)) {
                    ringDepth.set(n, d);
                    next.push(n);
                    if (d === 3) {
                      sum += distFromWhite(n);
                      count++;
                    }
                  }
                }
              }
              frontier = next;
            }
            if (count > 0 && sum / count >= speckRing) for (const k of comp) mark[k] = 1;
          }
        }
      }
      // Soft zone: grow from the background through light grey pixels, at most softDepth steps.
      const depth = new Uint16Array(w * h);
      head = 0;
      tail = 0;
      for (let k = 0; k < w * h; k++) if (mark[k] === 1) queue[tail++] = k;
      while (head < tail) {
        const k = queue[head++];
        const d = mark[k] === 1 ? 0 : depth[k];
        if (d >= softDepth) continue;
        const x = k % w;
        const y = (k - x) / w;
        for (const n of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1]) {
          if (n >= 0 && mark[n] === 0 && distFromWhite(n) <= softDist && saturation(n) <= softSat) {
            mark[n] = 4;
            depth[n] = d + 1;
            queue[tail++] = n;
          }
        }
      }
      const touches = (k: number, test: (value: number) => boolean) => {
        const x = k % w;
        const y = (k - x) / w;
        return (x > 0 && test(mark[k - 1])) || (x < w - 1 && test(mark[k + 1])) ||
          (y > 0 && test(mark[k - w])) || (y < h - 1 && test(mark[k + w]));
      };
      for (let k = 0; k < w * h; k++) if (mark[k] === 0 && touches(k, (v) => v === 1 || v === 4)) mark[k] = 2;
      for (let k = 0; k < w * h; k++) if (mark[k] === 0 && touches(k, (v) => v === 2)) mark[k] = 3;

      // Rim coverage: a rim pixel is (object colour × alpha) + (white × (1 − alpha)),
      // so alpha ≈ its distance from white ÷ that of the solid object next to it.
      const rimAlpha = (k: number) => {
        const x = k % w;
        const y = (k - x) / w;
        let ref = 0;
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const n = ny * w + nx;
            if (mark[n] === 0 || mark[n] === 3) ref = Math.max(ref, distFromWhite(n));
          }
        }
        if (ref < tol * 1.5) return 1; // light object edge: keep it, there is nothing to separate
        return Math.min(1, Math.max(0.05, distFromWhite(k) / ref));
      };

      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let k = 0; k < w * h; k++) {
        // Soft zone: colour-to-alpha against white (a light grey wisp = a dark wisp at low opacity).
        const alpha = mark[k] === 1 ? 0 : mark[k] === 0 ? 1
          : mark[k] === 4 ? (255 - Math.min(px[k * 4], px[k * 4 + 1], px[k * 4 + 2])) / 255
          : rimAlpha(k);
        px[k * 4 + 3] = Math.round(alpha * 255);
        // De-matte the rim: its RGB is still blended with the white background,
        // which would draw a light halo over the parchment. Remove the white.
        if (alpha > 0 && alpha < 1) {
          for (let c = 0; c < 3; c++) {
            const v = (px[k * 4 + c] - 255 * (1 - alpha)) / alpha;
            px[k * 4 + c] = Math.round(Math.min(255, Math.max(0, v)));
          }
        }
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
    {
      src: `data:${mimeType};base64,${base64}`,
      tol: BG_TOLERANCE,
      softDist: SOFT_MAX_DIST,
      softSat: SOFT_MAX_SATURATION,
      // The soft zone exists for potion smoke and mist. On weapons and armor it
      // eats pale steel highlights and grey feathers touching the edge, so it is off there.
      softDepth: opts.holes ? 0 : SOFT_MAX_DEPTH_PX,
      holeDist: HOLE_MAX_DIST,
      holeArea: opts.holes ? HOLE_MIN_AREA_FRACTION : 0,
      speckArea: SPECK_MIN_AREA_PX,
      speckRing: SPECK_RING_MIN_DIST,
    },
  );
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
}

/** A catalog card to preview the art in; a stand-in potion card when the id isn't in the catalog yet. */
function previewCard(catalog: Card[], id: string, imagem: string, subject: string): Card {
  const real = catalog.find((c) => c.id === id);
  if (real) return { ...real, imagem };
  const titulo = id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  // Vessel family named in the art prompt ("an OIL vial", "a GRENADE orb").
  const subtitulo = /\bGRENADE\b/.test(subject) ? "Granada" : /\bOIL\b/.test(subject) ? "Óleo" : "Poção";
  return {
    id, tipo: "pocao", titulo, subtitulo, circulo: 1, pm: 1, preco: "T$30",
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
  return { ids, variations, redo: argv.includes("--refazer"), approve: flag("aprovar"), recut: flag("recortar") };
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

/** Raw image as Gemini returned it, kept next to the candidate so the cut-out can be redone for free. */
const RAW_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const rawPath = (id: string, n: number | string, ext: string) => path.join(CANDIDATES_DIR, `${id}-v${n}-bruta.${ext}`);

/** Candidate + previews of the card on both coin sides. */
async function writeCandidate(
  page: Page,
  catalog: Card[],
  prompts: ArtPrompts,
  id: string,
  n: number | string,
  image: { data: string; mimeType: string },
): Promise<string> {
  const candidate = path.join(CANDIDATES_DIR, `${id}-v${n}.png`);
  const tipo = catalog.find((c) => c.id === id)?.tipo;
  const holes = tipo !== undefined && tipo !== "pocao";
  await fs.writeFile(candidate, await cutOutBackground(page, image.data, image.mimeType, { holes }));
  const rel = path.relative(ROOT_DIR, candidate).split(path.sep).join("/");
  const card = previewCard(catalog, id, rel, prompts.itens[id] ?? "");
  await renderSingleCard(card, "right", path.join(CANDIDATES_DIR, `${id}-v${n}-moeda-direita.png`));
  await renderSingleCard(card, "left", path.join(CANDIDATES_DIR, `${id}-v${n}-moeda-esquerda.png`));
  return rel;
}

/**
 * --recortar=id:n[,id:n...] redoes the cut-out of existing candidates without
 * calling the API (no cost): from the raw image when it was kept, otherwise
 * from the candidate itself (its transparent background goes back to white).
 */
async function recut(spec: string): Promise<void> {
  const prompts = JSON.parse(await fs.readFile(PROMPTS_FILE, "utf-8")) as ArtPrompts;
  const { cards: catalog } = await loadCatalog();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const pick of spec.split(",")) {
      const [id, n] = pick.split(":");
      const raw = Object.entries(RAW_EXT).find(([, ext]) => existsSync(rawPath(id, n, ext)));
      const from = raw ? rawPath(id, n, raw[1]) : path.join(CANDIDATES_DIR, `${id}-v${n}.png`);
      if (!existsSync(from)) throw new Error(`Não existe ${path.relative(ROOT_DIR, from)}.`);
      const data = (await fs.readFile(from)).toString("base64");
      const rel = await writeCandidate(page, catalog, prompts, id, n, { data, mimeType: raw ? raw[0] : "image/png" });
      console.log(`  recortada: ${rel} (de ${path.relative(ROOT_DIR, from)}; + prévias); instale com --aprovar=${id}:${n}`);
    }
  } finally {
    await browser.close();
  }
}

export async function runArt(argv: string[]): Promise<void> {
  loadDotEnv();
  const args = parseArgs(argv);
  if (args.approve) return approve(args.approve);
  if (args.recut) return recut(args.recut);

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
        try {
          const image = await generateImage(buildPrompt(prompts, id, catalog.find((c) => c.id === id)?.tipo), apiKey, model);
          await fs.writeFile(rawPath(id, n, RAW_EXT[image.mimeType] ?? "png"), Buffer.from(image.data, "base64"));
          const rel = await writeCandidate(page, catalog, prompts, id, n, image);
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
