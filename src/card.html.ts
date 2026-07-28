import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ART_SAFE_PADDING_PX,
  CANVAS_HEIGHT_PX,
  CANVAS_WIDTH_PX,
  FONTS,
  FOOTER_CELL_COUNT,
  LINE_HEIGHT,
  PATHS,
  PLACEHOLDER_FRAME,
  ROOT_DIR,
  SLOTS,
  TEXT_SAFE_PADDING_PX,
  TYPE_FOOTER_DEFAULTS,
  boxToPx,
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
export function buildCardHtml(card: Card): string {
  const titleBox = boxToPx(SLOTS.title);
  const artBox = boxToPx(SLOTS.art);
  const descBox = boxToPx(SLOTS.description);
  const priceBox = boxToPx(SLOTS.price);
  const footerBox = boxToPx(SLOTS.footer);

  const artUrl = fileUrl(path.join(ROOT_DIR, card.imagem));
  const frameUrl = fileUrl(PATHS.frame);

  const cellWidthPx = Math.floor(footerBox.widthPx / FOOTER_CELL_COUNT);
  const footerIconPx = 22;
  const footerGapPx = 6;
  const footerVerticalInsetPx = 4;
  // Fixed (not shrink-to-fit) box for the label+value stack, so the autofit
  // measurement below has a real ceiling to compare against instead of an
  // auto-sized parent that would always "fit" its own content.
  const footerTextWidthPx = cellWidthPx - footerIconPx - footerGapPx - TEXT_SAFE_PADDING_PX * 2;
  const footerTextHeightPx = footerBox.heightPx - footerVerticalInsetPx * 2;

  const footerCells = Array.from({ length: FOOTER_CELL_COUNT }, (_, i) => {
    const attr = resolveFooterAttr(card, i);
    const iconUrl = attr.icone ? fileUrl(path.join(PATHS.icons, attr.icone)) : "";
    return `
      <div class="footer-cell" style="width:${cellWidthPx}px;">
        ${iconUrl ? `<img class="footer-icon" src="${iconUrl}" alt="" />` : ""}
        <div class="footer-text" style="width:${footerTextWidthPx}px;height:${footerTextHeightPx}px;">
          <div class="footer-label">${escapeHtml(attr.rotulo)}</div>
          <div id="footer-value-${i}" class="footer-value" data-autofit="single" data-min="${FONTS.footerValue.minPx}" data-max="${FONTS.footerValue.maxPx}">${escapeHtml(attr.valor)}</div>
        </div>
      </div>
    `;
  }).join("\n");

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
  }

  .title-slot {
    left: ${titleBox.leftPx}px;
    top: ${titleBox.topPx}px;
    width: ${titleBox.widthPx}px;
    height: ${titleBox.heightPx}px;
    padding: 0 ${TEXT_SAFE_PADDING_PX}px;
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

  .footer-slot {
    left: ${footerBox.leftPx}px;
    top: ${footerBox.topPx}px;
    width: ${footerBox.widthPx}px;
    height: ${footerBox.heightPx}px;
  }
  .footer-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 100%;
    padding: 0 ${TEXT_SAFE_PADDING_PX}px;
    border-right: 1px solid rgba(43, 26, 13, 0.35);
  }
  .footer-cell:last-child { border-right: none; }
  .footer-icon {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
  }
  .footer-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    line-height: 1.1;
    flex-shrink: 0;
  }
  .footer-label {
    font-family: "Lora", serif;
    font-weight: ${FONTS.footerLabel.weight};
    font-size: ${FONTS.footerLabel.minPx}px;
    color: #2b1a0d;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .footer-value {
    font-family: "Cinzel", serif;
    font-weight: ${FONTS.footerValue.weight};
    color: #2b1a0d;
    white-space: nowrap;
  }
</style>
</head>
<body>
  <div class="layer art-layer">
    <img class="art-image" src="${artUrl}" alt="" />
  </div>
  <img class="layer" src="${frameUrl}" alt="" />

  <div class="slot title-slot">
    <div class="title-text" data-autofit="single" data-min="${FONTS.title.minPx}" data-max="${FONTS.title.maxPx}">${escapeHtml(card.titulo)}</div>
  </div>

  <div class="slot price-slot">
    <div class="price-text" data-autofit="single" data-min="${FONTS.price.minPx}" data-max="${FONTS.price.maxPx}">${escapeHtml(card.preco)}</div>
  </div>

  <div class="slot description-slot">
    <div class="description-text" data-autofit="multi" data-min="${FONTS.description.minPx}" data-max="${FONTS.description.maxPx}" data-lh-min="${LINE_HEIGHT.min}" data-lh-max="${LINE_HEIGHT.max}">${escapeHtml(card.descricao)}</div>
  </div>

  <div class="slot footer-slot">
    ${footerCells}
  </div>
</body>
</html>`;
}

/** Frame-only HTML, used by `pnpm template` to render output/template-blank.png for approval. */
export function buildBlankFrameHtml(): string {
  const frameUrl = fileUrl(PATHS.frame);
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
