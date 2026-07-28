import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";
import { buildBlankFrameHtml, buildCardHtml } from "./card.html.js";
import {
  AUTOFIT_PRECISION_PX,
  CANVAS_HEIGHT_PX,
  CANVAS_WIDTH_PX,
  LINE_HEIGHT,
  PATHS,
} from "./config.js";
import type { Card } from "./types.js";

/** Raised when a card's text cannot fit its slot even at the minimum configured font-size. */
export class TextOverflowError extends Error {
  constructor(cardId: string, slot: string, detail: string) {
    super(`Card "${cardId}": text in slot "${slot}" does not fit even at minimum size — ${detail}`);
    this.name = "TextOverflowError";
  }
}

async function newPage(browser: Browser): Promise<Page> {
  return browser.newPage({
    viewport: { width: CANVAS_WIDTH_PX, height: CANVAS_HEIGHT_PX },
    deviceScaleFactor: 1,
  });
}

/**
 * Loads `html` into `page` via a temporary file:// document rather than
 * page.setContent(). Chromium refuses to load local file:// subresources
 * (our frame/art/icon images) from an about:blank document — navigating to
 * a file:// URL first gives the page a matching origin so those loads work.
 */
async function loadHtml(page: Page, html: string): Promise<void> {
  const tmpPath = path.join(os.tmpdir(), `rpg-card-${randomUUID()}.html`);
  await fs.writeFile(tmpPath, html, "utf-8");
  try {
    await page.goto(`file://${tmpPath}`, { waitUntil: "load" });
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

interface FitMeasurement {
  fits: boolean;
  textWidthPx: number;
  textHeightPx: number;
  availWidthPx: number;
  availHeightPx: number;
}

/**
 * Runs in the browser: measures `selector`'s natural (unwrapped-or-not) content
 * size against its parent's usable area, i.e. the parent's clientWidth/Height
 * MINUS the parent's own CSS padding (clientWidth/Height includes padding, but
 * the padding is exactly the safety margin we must not let text cross).
 */
function measureFit(selector: string): FitMeasurement {
  const el = document.querySelector(selector) as HTMLElement;
  const box = el.parentElement as HTMLElement;
  const cs = getComputedStyle(box);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const availWidthPx = box.clientWidth - padX;
  const availHeightPx = box.clientHeight - padY;
  const textWidthPx = el.scrollWidth;
  const textHeightPx = el.scrollHeight;
  return {
    fits: textWidthPx <= availWidthPx && textHeightPx <= availHeightPx,
    textWidthPx,
    textHeightPx,
    availWidthPx,
    availHeightPx,
  };
}

function overflowDetail(m: FitMeasurement): string {
  return `text measures ${m.textWidthPx.toFixed(1)}x${m.textHeightPx.toFixed(1)}px but only ${m.availWidthPx.toFixed(1)}x${m.availHeightPx.toFixed(1)}px is available`;
}

/** Binary-search the largest font-size (px) in [minPx, maxPx] for which `apply` still fits, per `measure`. */
async function binarySearchFit(
  minPx: number,
  maxPx: number,
  apply: (px: number) => Promise<void>,
  measure: () => Promise<FitMeasurement>,
): Promise<number | null> {
  await apply(maxPx);
  if ((await measure()).fits) return maxPx;

  await apply(minPx);
  if (!(await measure()).fits) return null;

  let lo = minPx;
  let hi = maxPx;
  while (hi - lo > AUTOFIT_PRECISION_PX) {
    const mid = (lo + hi) / 2;
    await apply(mid);
    if ((await measure()).fits) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  await apply(lo);
  return lo;
}

/** Fits a single-line element (title, price, footer value) by shrinking font-size until it fits its box. */
async function fitSingleLine(page: Page, selector: string, cardId: string, slotName: string): Promise<void> {
  const minPx = Number(await page.getAttribute(selector, "data-min"));
  const maxPx = Number(await page.getAttribute(selector, "data-max"));

  const apply = (px: number) =>
    page.evaluate(
      ({ selector, px }) => {
        (document.querySelector(selector) as HTMLElement).style.fontSize = `${px}px`;
      },
      { selector, px },
    );
  const measure = () => page.evaluate(measureFit, selector);

  const result = await binarySearchFit(minPx, maxPx, apply, measure);
  if (result === null) {
    throw new TextOverflowError(cardId, slotName, `at minimum ${minPx}px, ${overflowDetail(await measure())}`);
  }
}

/** Fits the (potentially multi-line) description: shrinks font-size first, then tightens line-height, before giving up. */
async function fitMultiLine(page: Page, selector: string, cardId: string, slotName: string): Promise<void> {
  const minPx = Number(await page.getAttribute(selector, "data-min"));
  const maxPx = Number(await page.getAttribute(selector, "data-max"));
  const lhMin = Number(await page.getAttribute(selector, "data-lh-min")) || LINE_HEIGHT.min;
  const lhMax = Number(await page.getAttribute(selector, "data-lh-max")) || LINE_HEIGHT.max;

  const apply = (px: number, lineHeight: number) =>
    page.evaluate(
      ({ selector, px, lineHeight }) => {
        const el = document.querySelector(selector) as HTMLElement;
        el.style.fontSize = `${px}px`;
        el.style.lineHeight = String(lineHeight);
      },
      { selector, px, lineHeight },
    );
  const measure = () => page.evaluate(measureFit, selector);

  // Phase 1: binary-search font-size at the loosest (max) line-height.
  const phase1 = await binarySearchFit(minPx, maxPx, (px) => apply(px, lhMax), measure);
  if (phase1 !== null && phase1 > minPx) {
    await apply(phase1, lhMax);
    return;
  }

  // Phase 2: at the minimum font-size, tighten line-height toward its min.
  await apply(minPx, lhMax);
  if ((await measure()).fits) return;

  await apply(minPx, lhMin);
  if (!(await measure()).fits) {
    throw new TextOverflowError(
      cardId,
      slotName,
      `even at minimum ${minPx}px font-size and ${lhMin} line-height, ${overflowDetail(await measure())}`,
    );
  }

  let lo = lhMin;
  let hi = lhMax;
  while (hi - lo > 0.01) {
    const mid = (lo + hi) / 2;
    await apply(minPx, mid);
    if ((await measure()).fits) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  await apply(minPx, hi);
}

async function autofitCard(page: Page, cardId: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);

  await fitSingleLine(page, ".title-text", cardId, "title");
  await fitSingleLine(page, ".price-text", cardId, "price");
  await fitMultiLine(page, ".description-text", cardId, "description");

  if ((await page.locator("#subtitle-text").count()) > 0) {
    await fitSingleLine(page, "#subtitle-text", cardId, "subtitulo");
  }

  const footerValueCount = await page.locator(".footer-pair").count();
  for (let i = 0; i < footerValueCount; i++) {
    await fitSingleLine(page, `#footer-value-${i}`, cardId, `footer[${i}].valor`);
  }
}

/** Renders only the frame layer (no text/art/price) to output/template-blank.png, for visual approval. */
export async function renderTemplateBlank(): Promise<string> {
  const browser = await chromium.launch();
  try {
    const page = await newPage(browser);
    await loadHtml(page, buildBlankFrameHtml());
    await fs.mkdir(path.dirname(PATHS.templateBlank), { recursive: true });
    await page.screenshot({ path: PATHS.templateBlank, omitBackground: true });
    return PATHS.templateBlank;
  } finally {
    await browser.close();
  }
}

/** Renders every card to output/cards/{id}.png. Throws TextOverflowError on the first card whose text can't be made to fit. */
export async function renderCards(cards: Card[]): Promise<string[]> {
  const browser = await chromium.launch();
  const outputPaths: string[] = [];
  try {
    await fs.mkdir(PATHS.outputCards, { recursive: true });
    const page = await newPage(browser);
    for (const card of cards) {
      await loadHtml(page, buildCardHtml(card));
      await autofitCard(page, card.id);
      const outPath = path.join(PATHS.outputCards, `${card.id}.png`);
      await page.screenshot({ path: outPath, omitBackground: true });
      outputPaths.push(outPath);
      console.log(`  rendered ${outPath}`);
    }
    return outputPaths;
  } finally {
    await browser.close();
  }
}
