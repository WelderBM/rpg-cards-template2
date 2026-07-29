/**
 * All calibratable constants for the card renderer live here.
 *
 * When the real assets/frame/frame.png is dropped in, this is the ONLY file
 * that should need editing to line the text/art/price/footer slots up with
 * the artwork. Everything else (card.html.ts, render.ts, impose.ts) reads
 * from here.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CardType } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export const PATHS = {
  frame: path.join(ROOT_DIR, "assets/frame/frame.png"),
  icons: path.join(ROOT_DIR, "assets/icons"),
  fonts: path.join(ROOT_DIR, "assets/fonts"),
  art: path.join(ROOT_DIR, "assets/art"),
  data: path.join(ROOT_DIR, "data/cards.json"),
  cardsToRepeat: path.join(ROOT_DIR, "data/cards-to-reapeat.json"),
  outputCards: path.join(ROOT_DIR, "output/cards"),
  outputPrint: path.join(ROOT_DIR, "output/print"),
  outputTest: path.join(ROOT_DIR, "output/test"),
  templateBlank: path.join(ROOT_DIR, "output/template-blank.png"),
};

// ---------------------------------------------------------------------------
// Coin side: the frame comes in two mirrored variants (price coin top-right
// vs top-left). Picking a side selects both the frame image AND mirrors
// SLOTS.price horizontally — see FRAME_PATHS / getPriceSlot below.
// ---------------------------------------------------------------------------

export type CoinSide = "left" | "right";

export const FRAME_PATHS: Record<CoinSide, string> = {
  right: path.join(ROOT_DIR, "assets/frame/frame-right.png"),
  left: path.join(ROOT_DIR, "assets/frame/frame-left.png"),
};

// ---------------------------------------------------------------------------
// Resolution / physical size
// ---------------------------------------------------------------------------

export const DPI = 300;

/** Convert millimeters to pixels at the configured DPI, rounded to the nearest px. */
export function mmToPx(mm: number): number {
  return Math.round((mm / 25.4) * DPI);
}

/** Card physical size: A7 portrait. */
export const CARD_WIDTH_MM = 74;
export const CARD_HEIGHT_MM = 105;
export const CARD_WIDTH_PX = mmToPx(CARD_WIDTH_MM); // 874
export const CARD_HEIGHT_PX = mmToPx(CARD_HEIGHT_MM); // 1240

/**
 * Bleed, in mm, added symmetrically around the trim box. 0 disables bleed
 * (cards render at exactly CARD_WIDTH_PX x CARD_HEIGHT_PX). Enabling bleed
 * makes each card canvas bigger than the trim box; the imposition step
 * (src/impose.ts) centers each card on its trim cell so the extra bleed
 * overhangs into the gutter between cards. This trades away a perfectly
 * flush 8-up fit on the A4 sheet, which is why it's opt-in.
 */
export const BLEED_MM = 0;
export const BLEED_PX = mmToPx(BLEED_MM);

/** Final render canvas size (trim box + bleed on all sides). */
export const CANVAS_WIDTH_MM = CARD_WIDTH_MM + BLEED_MM * 2;
export const CANVAS_HEIGHT_MM = CARD_HEIGHT_MM + BLEED_MM * 2;
export const CANVAS_WIDTH_PX = CARD_WIDTH_PX + BLEED_PX * 2;
export const CANVAS_HEIGHT_PX = CARD_HEIGHT_PX + BLEED_PX * 2;

// ---------------------------------------------------------------------------
// A4 imposition: 8x A7 per sheet
// ---------------------------------------------------------------------------
//
// A4 (210x297mm) tiles exactly into 8 A7 cards (74x105mm) when the cards are
// rotated 90 degrees: 2 columns of 105mm = 210mm (exact sheet width), 4 rows
// of 74mm = 296mm (~1mm of slack against the 297mm sheet height, split as a
// top/bottom margin). Each card image is rotated when placed on the sheet.

export const SHEET_WIDTH_MM = 210;
export const SHEET_HEIGHT_MM = 297;
export const SHEET_WIDTH_PX = mmToPx(SHEET_WIDTH_MM); // 2480
export const SHEET_HEIGHT_PX = mmToPx(SHEET_HEIGHT_MM); // 3508

export const IMPOSITION_COLS = 2;
export const IMPOSITION_ROWS = 4;
export const CARDS_PER_SHEET = IMPOSITION_COLS * IMPOSITION_ROWS; // 8

/** Crop marks drawn at every internal and external cut line. */
export const CROP_MARKS = {
  lengthMm: 3,
  thicknessPt: 0.5,
  colorRgb: { r: 0, g: 0, b: 0 },
};

// ---------------------------------------------------------------------------
// Slots (safe areas), in mm, relative to the top-left of the TRIM box
// (i.e. NOT counting bleed). This is the main thing to recalibrate once the
// real frame.png replaces the placeholder.
// ---------------------------------------------------------------------------

export interface BoxMm {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

// Calibrated against assets/frame/final-template.png (the approved frame
// artwork) via percentage grid overlay measurement. Re-run
// scripts/grid-overlay.ts against a new frame if it's ever replaced, and
// re-measure before touching these numbers.

export const SLOTS = {
  /** Title band (top scroll). */
  title: { xMm: 8, yMm: 5, widthMm: 58, heightMm: 13 } as BoxMm,

  /** Item artwork window (center). */
  art: { xMm: 11, yMm: 20, widthMm: 40, heightMm: 40 } as BoxMm,

  /** Description band (bottom scroll). */
  description: { xMm: 7, yMm: 74, widthMm: 60, heightMm: 21 } as BoxMm,
 
  /** Price coin: hangs below the title scroll into the open area, not glued to the top edge. */
  price: { xMm: 52, yMm: 22.5, widthMm: 17, heightMm: 17 } as BoxMm,

  /** Footer strip with 3 attribute cells — its own small scroll below the description band. */
  footer: { xMm: 5, yMm: 94, widthMm: 64, heightMm: 9 } as BoxMm,
} as const;

export interface BoxPx {
  leftPx: number;
  topPx: number;
  widthPx: number;
  heightPx: number;
}

/** Resolve a slot's mm box to absolute pixel coordinates on the render canvas (accounts for bleed offset). */
export function boxToPx(box: BoxMm): BoxPx {
  return {
    leftPx: BLEED_PX + mmToPx(box.xMm),
    topPx: BLEED_PX + mmToPx(box.yMm),
    widthPx: mmToPx(box.widthMm),
    heightPx: mmToPx(box.heightMm),
  };
}

/** Mirrors a box horizontally across the card width: same margin, opposite edge. */
function mirrorBoxMm(box: BoxMm): BoxMm {
  return { ...box, xMm: CARD_WIDTH_MM - box.xMm - box.widthMm };
}

/**
 * Price gets the pure mirror plus a small manual nudge (-1mm x, +1mm y),
 * from fine-tuning the left-coin frame against its actual coin artwork —
 * the two frame images aren't pixel-perfect mirrors of each other, so the
 * plain formula was off by a hair. Re-measure with the percentage-grid
 * technique (see git history / scripts/grid-overlay.ts) if frame-left.png
 * ever changes.
 */
function mirrorPriceBoxMm(box: BoxMm): BoxMm {
  return { xMm: CARD_WIDTH_MM - box.xMm - box.widthMm - 1, yMm: box.yMm + 1, widthMm: box.widthMm, heightMm: box.heightMm };
}

/**
 * Resolves ALL of SLOTS for the given coin side. 'right' is the calibrated
 * original. 'left' mirrors every box horizontally — not just price. This
 * matters because SLOTS.art isn't centered (it's shifted toward the side
 * away from the coin, keeping a deliberate ~1mm clearance from it); mirroring
 * only the price and leaving art in place would collide the art box into
 * the coin on the left-coin frame. Mirroring symmetric boxes (title,
 * description, footer) is a no-op, so this is safe to apply uniformly.
 */
export function getSlotsForSide(side: CoinSide): typeof SLOTS {
  if (side === "right") return SLOTS;
  return {
    title: mirrorBoxMm(SLOTS.title),
    art: mirrorBoxMm(SLOTS.art),
    description: mirrorBoxMm(SLOTS.description),
    price: mirrorPriceBoxMm(SLOTS.price),
    footer: mirrorBoxMm(SLOTS.footer),
  };
}

/** Padding subtracted from every slot's box before text is allowed to sit, in px. */
export const TEXT_SAFE_PADDING_PX = 6;

/** Art gets extra breathing room from the scrolls above/below it, in px. */
export const ART_SAFE_PADDING_PX = 10;

/**
 * Locked min/max size (px, at 300dpi) for the item art's bounding box.
 * Validated below against SLOTS.art so the art slot can never be configured
 * gigantic or tiny by accident.
 */
export const ART_MIN_PX = 320;
export const ART_MAX_PX = 620;

{
  const art = boxToPx(SLOTS.art);
  const smallestSide = Math.min(art.widthPx, art.heightPx) - ART_SAFE_PADDING_PX * 2;
  const largestSide = Math.max(art.widthPx, art.heightPx) - ART_SAFE_PADDING_PX * 2;
  if (smallestSide < ART_MIN_PX) {
    throw new Error(
      `config.ts: SLOTS.art is too small (${smallestSide}px usable) — must be at least ART_MIN_PX (${ART_MIN_PX}px). Recalibrate SLOTS.art or lower ART_MIN_PX.`,
    );
  }
  if (largestSide > ART_MAX_PX) {
    throw new Error(
      `config.ts: SLOTS.art is too large (${largestSide}px usable) — must be at most ART_MAX_PX (${ART_MAX_PX}px). Recalibrate SLOTS.art or raise ART_MAX_PX.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

export const FONTS = {
  title: {
    family: "Cinzel",
    file: path.join(PATHS.fonts, "Cinzel-Variable.ttf"),
    weight: 600,
    minPx: 26,
    maxPx: 56,
  },
  subtitulo: {
    family: "Cinzel",
    file: path.join(PATHS.fonts, "Cinzel-Variable.ttf"),
    weight: 500,
    minPx: 16,
    maxPx: 26,
  },
  description: {
    family: "Lora",
    file: path.join(PATHS.fonts, "Lora-Variable.ttf"),
    weight: 400,
    minPx: 16,
    maxPx: 30,
  },
  price: {
    family: "Cinzel",
    file: path.join(PATHS.fonts, "Cinzel-Variable.ttf"),
    weight: 700,
    minPx: 18,
    maxPx: 34,
  },
  footerValue: {
    family: "Cinzel",
    file: path.join(PATHS.fonts, "Cinzel-Variable.ttf"),
    weight: 600,
    minPx: 18,
    maxPx: 32,
  },
};

/** Line-height, as a multiple of font-size. Auto-fit tightens toward min. */
export const LINE_HEIGHT = {
  max: 1.35,
  min: 1.05,
};

/**
 * Auto-fit search step, in px, used while binary-searching the largest
 * font-size that fits a slot. Smaller = more precise, more iterations.
 */
export const AUTOFIT_PRECISION_PX = 0.5;

// ---------------------------------------------------------------------------
// Footer: type -> default icon/label per attribute slot (0, 1, 2)
// ---------------------------------------------------------------------------
//
// A Card's own `atributos[i].icone` / `.rotulo` always win when present.
// These defaults only fill in gaps, keyed by `tipo`, so card data can stay
// terse (e.g. only supply `valor`) when the card follows the common case
// for its type.

export interface FooterAttrDefault {
  icone: string;
  rotulo: string;
}

// Footer labels are never rendered (icon + value only — see card.html.ts),
// but `rotulo` stays here as self-documentation of what each position means
// per type. Position 3 is always Peso: the price already has its own coin
// slot, so repeating it in the footer would be redundant.
export const TYPE_FOOTER_DEFAULTS: Record<CardType, FooterAttrDefault[]> = {
  arma: [
    { icone: "broadsword.svg", rotulo: "Dano" },
    { icone: "star-formation.svg", rotulo: "Crítico" },
    { icone: "weight.svg", rotulo: "Peso" },
  ],
  item: [
    { icone: "backpack.svg", rotulo: "Peso" },
    { icone: "star-formation.svg", rotulo: "Raridade" },
    { icone: "coins.svg", rotulo: "Custo" },
  ],
  pocao: [
    { icone: "potion-ball.svg", rotulo: "Efeito" },
    { icone: "hourglass.svg", rotulo: "Duração" },
    { icone: "weight.svg", rotulo: "Peso" },
  ],
};

export const FOOTER_CELL_COUNT = 3;

// ---------------------------------------------------------------------------
// Placeholder frame generation (only used when assets/frame/frame.png is
// still the neutral placeholder / needs regenerating)
// ---------------------------------------------------------------------------

export const PLACEHOLDER_FRAME = {
  backgroundColor: "#efe3c8",
  borderColor: "#7a5c34",
  slotColors: {
    title: "rgba(90, 60, 180, 0.25)",
    art: "rgba(200, 110, 30, 0.22)",
    description: "rgba(40, 130, 70, 0.22)",
    price: "rgba(160, 30, 120, 0.28)",
    footer: "rgba(60, 60, 60, 0.2)",
  },
};
