import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ART_SAFE_PADDING_PX,
  CANVAS_HEIGHT_PX,
  CANVAS_WIDTH_PX,
  type CoinSide,
  FONTS,
  FOOTER_CELL_PADDING_PX,
  FOOTER_CELLS_MM,
  FOOTER_EMPTY_VALUE,
  FRAME_PATHS,
  LINE_HEIGHT,
  PATHS,
  PLACEHOLDER_FRAME,
  ROOT_DIR,
  SLOTS,
  TEXT_SAFE_PADDING_PX,
  TYPE_FOOTER_DEFAULTS,
  boxToPx,
  getSlotsForSide,
} from "./config.js";
import type { Card, CardAttribute } from "./types.js";

function fileUrl(absolutePath: string): string {
  return pathToFileURL(absolutePath).href;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fontFaces(): string {
  return `
    @font-face {
      font-family: "Cinzel";
      src: url("${fileUrl(FONTS.title.file)}") format("truetype-variations"),
           url("${fileUrl(FONTS.title.file)}") format("truetype");
      font-weight: 400 900;
    }
    @font-face {
      font-family: "Lora";
      src: url("${fileUrl(FONTS.description.file)}") format("truetype-variations"),
           url("${fileUrl(FONTS.description.file)}") format("truetype");
      font-weight: 400 700;
    }
  `;
}

function baseStyles(): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${CANVAS_WIDTH_PX}px;
      height: ${CANVAS_HEIGHT_PX}px;
      overflow: hidden;
      background: transparent;
    }
    .layer {
      position: absolute;
      top: 0;
      left: 0;
      width: ${CANVAS_WIDTH_PX}px;
      height: ${CANVAS_HEIGHT_PX}px;
    }
    .slot {
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: visible;
    }
  `;
}

/** Resolve a card's footer attribute at `index`, filling gaps from the type default. */
function resolveFooterAttr(card: Card, index: number): { icone: string; rotulo: string; valor: string } {
  const given: CardAttribute | undefined = card.atributos[index];
  const fallback = TYPE_FOOTER_DEFAULTS[card.tipo][index];
  return {
    icone: given?.icone ?? fallback?.icone ?? "",
    rotulo: given?.rotulo ?? fallback?.rotulo ?? "",
    valor: given?.valor ?? "",
  };
}

/** Full HTML document for a single populated card, ready to be loaded by Playwright. */
export function buildCardHtml(card: Card, side: CoinSide = "right"): string {
  const slots = getSlotsForSide(side);
  const titleBox = boxToPx(slots.title);
  const artBox = boxToPx(slots.art);
  const descBox = boxToPx(slots.description);
  const priceBox = boxToPx(slots.price);
  const circleSealBox = boxToPx(slots.circleSeal);

  // Missing art file → leave the art window as plain parchment. Rendering the
  // <img> anyway printed Chromium's broken-image icon + grey border on the
  // card (and in the print PDFs). validateCards warns about these cards.
  const artPath = path.join(ROOT_DIR, card.imagem);
  const artUrl = existsSync(artPath) ? fileUrl(artPath) : null;
  const frameUrl = fileUrl(FRAME_PATHS[side]);

  // Fixed budget reserved for the two flourish glyphs flanking the subtitle,
  // so the subtitle's own fit-measurement wrapper has a real (non-shrink-wrap) width.
  const subtitleFlourishBudgetPx = 40;
  const subtitleTextWidthPx = titleBox.widthPx - TEXT_SAFE_PADDING_PX * 2 - subtitleFlourishBudgetPx * 2;

  const footerIconPx = 22;
  const footerGapPx = 6;

  // One cell per compartment PAINTED on the frame's footer scroll (the
  // dividers are part of the frame art, so no separators are drawn here);
  // icon + value centered in it, no label text — the icon conveys what the
  // stat is. An empty valor ("") shows FOOTER_EMPTY_VALUE ("–") with no icon
  // (ammunition [Qtd, Carga, –]; potions without Resistência).
  const footerCells = FOOTER_CELLS_MM[side].map((span, i) => {
    const attr = resolveFooterAttr(card, i);
    const cell = boxToPx({ xMm: span.xMm, yMm: slots.footer.yMm, widthMm: span.widthMm, heightMm: slots.footer.heightMm });
    const isEmpty = attr.valor.trim() === "";
    const iconUrl = attr.icone && !isEmpty ? fileUrl(path.join(PATHS.icons, attr.icone)) : "";
    // Width budget passed via data-max-width-px (not a wrapping box): the
    // value must shrink-wrap and sit centered right next to its icon; the
    // autofit still enforces this ceiling (measureFit's maxWidthOverride).
    const textWidthPx = cell.widthPx - FOOTER_CELL_PADDING_PX * 2 - (iconUrl ? footerIconPx + footerGapPx : 0);
    const content = `${iconUrl ? `<img class="footer-icon" src="${iconUrl}" alt="" />` : ""}
        <div id="footer-value-${i}" class="footer-pair" data-autofit="single" data-min="${FONTS.footerValue.minPx}" data-max="${FONTS.footerValue.maxPx}" data-max-width-px="${textWidthPx}">${escapeHtml(isEmpty ? FOOTER_EMPTY_VALUE : attr.valor)}</div>`;
    return `
      <div class="slot footer-cell" style="left:${cell.leftPx}px; top:${cell.topPx}px; width:${cell.widthPx}px; height:${cell.heightPx}px;">
        ${content}
      </div>`;
  }).join("\n");

  const circleSeal =
    card.tipo === "pocao"
      ? `<div class="slot circle-seal-slot">
    <div id="circle-seal-text" class="circle-seal-text" data-autofit="single" data-min="${FONTS.circleSeal.minPx}" data-max="${FONTS.circleSeal.maxPx}">${card.circulo}º</div>
  </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<style>
  ${fontFaces()}
  ${baseStyles()}

  .art-layer {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .art-image {
    position: absolute;
    left: ${artBox.leftPx + ART_SAFE_PADDING_PX}px;
    top: ${artBox.topPx + ART_SAFE_PADDING_PX}px;
    width: ${artBox.widthPx - ART_SAFE_PADDING_PX * 2}px;
    height: ${artBox.heightPx - ART_SAFE_PADDING_PX * 2}px;
    object-fit: contain;
    /* Art sits ON TOP of the (fully opaque) frame, so it needs its own drop
       shadow to read as sitting on the parchment -- matches the reference. */
    filter: drop-shadow(3px 6px 6px rgba(20, 10, 0, 0.35));
  }

  .title-slot {
    left: ${titleBox.leftPx}px;
    top: ${titleBox.topPx}px;
    width: ${titleBox.widthPx}px;
    height: ${titleBox.heightPx}px;
    padding: 0 ${TEXT_SAFE_PADDING_PX}px;
    flex-direction: column;
    gap: 2px;
  }
  .title-text {
    font-family: "Cinzel", serif;
    font-weight: ${FONTS.title.weight};
    font-variation-settings: "wght" ${FONTS.title.weight};
    white-space: nowrap;
    text-align: center;
    color: #2b1a0d;
    letter-spacing: 0.02em;
  }
  .subtitle-text {
    font-family: "Cinzel", serif;
    font-weight: ${FONTS.subtitulo.weight};
    font-variation-settings: "wght" ${FONTS.subtitulo.weight};
    white-space: nowrap;
    text-align: center;
    color: #2b1a0d;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .subtitle-line {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .subtitle-text-box {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .subtitle-flourish {
    color: rgba(43, 26, 13, 0.55);
    flex-shrink: 0;
  }

  .price-slot {
    left: ${priceBox.leftPx}px;
    top: ${priceBox.topPx}px;
    width: ${priceBox.widthPx}px;
    height: ${priceBox.heightPx}px;
    border-radius: 50%;
    /* Extra inset (beyond TEXT_SAFE_PADDING_PX) so text stays inside the circle's inscribed square, not just its bounding box. */
    padding: ${Math.round(priceBox.widthPx * 0.24)}px;
  }
  .price-text {
    font-family: "Cinzel", serif;
    font-weight: ${FONTS.price.weight};
    font-variation-settings: "wght" ${FONTS.price.weight};
    white-space: nowrap;
    text-align: center;
    color: #2b1a0d;
    line-height: 1;
  }

  .circle-seal-slot {
    left: ${circleSealBox.leftPx}px;
    top: ${circleSealBox.topPx}px;
    width: ${circleSealBox.widthPx}px;
    height: ${circleSealBox.heightPx}px;
    border-radius: 50%;
    padding: ${TEXT_SAFE_PADDING_PX}px;
    border: 3px solid #4c1714;
    background: radial-gradient(circle at 35% 28%, #ad5145 0%, #812c28 48%, #5b1b18 100%);
    box-shadow: 2px 3px 5px rgba(43, 26, 13, 0.45), inset 0 0 0 3px rgba(238, 194, 104, 0.42);
  }
  .circle-seal-slot::before {
    content: "";
    position: absolute;
    inset: 6px;
    border: 1px solid rgba(255, 224, 151, 0.65);
    border-radius: 50%;
  }
  .circle-seal-text {
    font-family: "Cinzel", serif;
    font-weight: ${FONTS.circleSeal.weight};
    font-variation-settings: "wght" ${FONTS.circleSeal.weight};
    color: #ffe5a7;
    line-height: 1;
    white-space: nowrap;
    text-shadow: 0 1px 1px rgba(43, 13, 10, 0.8);
    z-index: 1;
  }

  .description-slot {
    left: ${descBox.leftPx}px;
    top: ${descBox.topPx}px;
    width: ${descBox.widthPx}px;
    height: ${descBox.heightPx}px;
    padding: ${TEXT_SAFE_PADDING_PX}px;
    align-items: flex-start;
  }
  .description-text {
    font-family: "Lora", serif;
    font-style: italic;
    font-weight: ${FONTS.description.weight};
    width: 100%;
    text-align: center;
    color: #2b1a0d;
    overflow-wrap: break-word;
    word-break: break-word;
  }

  .footer-cell {
    gap: ${footerGapPx}px;
    padding: 0 ${FOOTER_CELL_PADDING_PX}px;
  }
  .footer-icon {
    width: ${footerIconPx}px;
    height: ${footerIconPx}px;
    flex-shrink: 0;
  }
  .footer-pair {
    font-family: "Lora", serif;
    font-weight: ${FONTS.footerValue.weight};
    color: #2b1a0d;
    white-space: nowrap;
  }
  /* Fallback set by render.ts when a value can't fit one line even at the
     minimum size (e.g. "Vontade parcial" in the narrow 3rd compartment). */
  .footer-pair.footer-wrap {
    white-space: normal;
    text-align: center;
    line-height: 1.05;
  }
</style>
</head>
<body>
  <img class="layer" src="${frameUrl}" alt="" />
  <div class="layer art-layer">
    ${artUrl ? `<img class="art-image" src="${artUrl}" alt="" />` : ""}
  </div>

  <div class="slot title-slot">
    <div class="title-text" data-autofit="single" data-min="${FONTS.title.minPx}" data-max="${FONTS.title.maxPx}">${escapeHtml(card.titulo)}</div>
    ${
      card.subtitulo
        ? `
    <div class="subtitle-line">
      <span class="subtitle-flourish">&#10022;</span>
      <div class="subtitle-text-box" style="width:${subtitleTextWidthPx}px;">
        <div id="subtitle-text" class="subtitle-text" data-autofit="single" data-min="${FONTS.subtitulo.minPx}" data-max="${FONTS.subtitulo.maxPx}">${escapeHtml(card.subtitulo)}</div>
      </div>
      <span class="subtitle-flourish">&#10022;</span>
    </div>`
        : ""
    }
  </div>

  <div class="slot price-slot">
    <div class="price-text" data-autofit="single" data-min="${FONTS.price.minPx}" data-max="${FONTS.price.maxPx}">${escapeHtml(card.preco)}</div>
  </div>

  ${circleSeal}

  <div class="slot description-slot">
    <div class="description-text" data-autofit="multi" data-min="${FONTS.description.minPx}" data-max="${FONTS.description.maxPx}" data-lh-min="${LINE_HEIGHT.min}" data-lh-max="${LINE_HEIGHT.max}">${escapeHtml(card.descricao)}</div>
  </div>

  ${footerCells}
</body>
</html>`;
}

/** Frame-only HTML, used by `pnpm template` to render output/template-blank.png for approval. */
export function buildBlankFrameHtml(side: CoinSide = "right"): string {
  const frameUrl = fileUrl(FRAME_PATHS[side]);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  ${baseStyles()}
</style>
</head>
<body>
  <img class="layer" src="${frameUrl}" alt="" />
</body>
</html>`;
}

/** Diagnostic HTML for generating a neutral placeholder frame.png (color-coded slot guides). */
export function buildPlaceholderFrameHtml(): string {
  const boxes = [
    { name: "title", box: boxToPx(SLOTS.title), color: PLACEHOLDER_FRAME.slotColors.title },
    { name: "art", box: boxToPx(SLOTS.art), color: PLACEHOLDER_FRAME.slotColors.art },
    { name: "description", box: boxToPx(SLOTS.description), color: PLACEHOLDER_FRAME.slotColors.description },
    { name: "price", box: boxToPx(SLOTS.price), color: PLACEHOLDER_FRAME.slotColors.price },
    { name: "footer", box: boxToPx(SLOTS.footer), color: PLACEHOLDER_FRAME.slotColors.footer },
  ];

  const boxesHtml = boxes
    .map(
      ({ name, box, color }) => `
      <div style="
        position:absolute;
        left:${box.leftPx}px; top:${box.topPx}px;
        width:${box.widthPx}px; height:${box.heightPx}px;
        background:${color};
        border: 2px dashed rgba(0,0,0,0.55);
        ${name === "price" ? "border-radius: 50%;" : ""}
        display:flex; align-items:center; justify-content:center;
        font: 16px sans-serif; color:#111; text-align:center;
      ">${name}<br/>${box.widthPx}&times;${box.heightPx}px</div>
    `,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  ${baseStyles()}
  body { background: ${PLACEHOLDER_FRAME.backgroundColor}; }
  .outer-border {
    position: absolute;
    left: 6px; top: 6px;
    width: ${CANVAS_WIDTH_PX - 12}px;
    height: ${CANVAS_HEIGHT_PX - 12}px;
    border: 6px solid ${PLACEHOLDER_FRAME.borderColor};
    border-radius: 24px;
  }
  .banner {
    position: absolute;
    left: 0; top: 45%;
    width: 100%;
    text-align: center;
    font: 700 28px sans-serif;
    color: rgba(0,0,0,0.35);
    transform: rotate(-8deg);
  }
</style>
</head>
<body>
  <div class="outer-border"></div>
  ${boxesHtml}
  <div class="banner">PLACEHOLDER &mdash; substitua assets/frame/frame.png</div>
</body>
</html>`;
}
