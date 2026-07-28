import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, degrees, rgb } from "pdf-lib";
import {
  CANVAS_HEIGHT_MM,
  CANVAS_WIDTH_MM,
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
  CARDS_PER_SHEET,
  CROP_MARKS,
  IMPOSITION_COLS,
  IMPOSITION_ROWS,
  PATHS,
  SHEET_HEIGHT_MM,
  SHEET_WIDTH_MM,
} from "./config.js";

const PT_PER_MM = 72 / 25.4;
const mmToPt = (mm: number): number => mm * PT_PER_MM;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Where each grid cell's center sits, in mm, measured from the sheet's top-left (y-down). */
function cellCenterFromTopLeftMm(col: number, row: number): { xMm: number; yFromTopMm: number } {
  const gridWidthMm = IMPOSITION_COLS * CARD_HEIGHT_MM; // cards rotated 90deg: landscape width = card height
  const gridHeightMm = IMPOSITION_ROWS * CARD_WIDTH_MM; // landscape height = card width
  const marginLeftMm = (SHEET_WIDTH_MM - gridWidthMm) / 2;
  const marginTopMm = (SHEET_HEIGHT_MM - gridHeightMm) / 2;
  return {
    xMm: marginLeftMm + col * CARD_HEIGHT_MM + CARD_HEIGHT_MM / 2,
    yFromTopMm: marginTopMm + row * CARD_WIDTH_MM + CARD_WIDTH_MM / 2,
  };
}

async function buildSheet(cardPngPaths: (string | null)[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([mmToPt(SHEET_WIDTH_MM), mmToPt(SHEET_HEIGHT_MM)]);

  for (let i = 0; i < cardPngPaths.length; i++) {
    const pngPath = cardPngPaths[i];
    if (!pngPath) continue;

    const col = i % IMPOSITION_COLS;
    const row = Math.floor(i / IMPOSITION_COLS);
    const { xMm, yFromTopMm } = cellCenterFromTopLeftMm(col, row);
    const centerYFromBottomMm = SHEET_HEIGHT_MM - yFromTopMm;

    const bytes = await fs.readFile(pngPath);
    const image = await pdfDoc.embedPng(bytes);

    // The image (CANVAS_WIDTH_MM x CANVAS_HEIGHT_MM, trim box centered within
    // it when bleed > 0) is rotated 90deg CCW anchored at (x,y). For that
    // anchor, the rotated bounding box is centered at
    // (x - CANVAS_HEIGHT_MM/2, y + CANVAS_WIDTH_MM/2) -- see README
    // "Imposição" for the derivation -- so solving for the anchor that
    // centers the rotated image on the cell center gives:
    const anchorXMm = xMm + CANVAS_HEIGHT_MM / 2;
    const anchorYMm = centerYFromBottomMm - CANVAS_WIDTH_MM / 2;

    page.drawImage(image, {
      x: mmToPt(anchorXMm),
      y: mmToPt(anchorYMm),
      width: mmToPt(CANVAS_WIDTH_MM),
      height: mmToPt(CANVAS_HEIGHT_MM),
      rotate: degrees(90),
    });
  }

  drawCropMarks(page);

  return pdfDoc.save();
}

function drawCropMarks(page: import("pdf-lib").PDFPage): void {
  const color = rgb(CROP_MARKS.colorRgb.r, CROP_MARKS.colorRgb.g, CROP_MARKS.colorRgb.b);
  const thickness = CROP_MARKS.thicknessPt;
  const sheetHeightPt = mmToPt(SHEET_HEIGHT_MM);
  const sheetWidthPt = mmToPt(SHEET_WIDTH_MM);

  // Internal column gutters (cards are IMPOSITION_COLS wide, landscape CARD_HEIGHT_MM each).
  for (let c = 1; c < IMPOSITION_COLS; c++) {
    const xPt = mmToPt(c * CARD_HEIGHT_MM);
    page.drawLine({ start: { x: xPt, y: 0 }, end: { x: xPt, y: sheetHeightPt }, thickness, color });
  }

  // Internal row gutters (cards are IMPOSITION_ROWS tall, landscape CARD_WIDTH_MM each).
  for (let r = 1; r < IMPOSITION_ROWS; r++) {
    const yFromTopMm = r * CARD_WIDTH_MM;
    const yPt = mmToPt(SHEET_HEIGHT_MM - yFromTopMm);
    page.drawLine({ start: { x: 0, y: yPt }, end: { x: sheetWidthPt, y: yPt }, thickness, color });
  }
}

/**
 * Reads output/cards/{id}.png for each card and composes A4 sheets of
 * CARDS_PER_SHEET (8) cards each, saved to output/print/sheet-{n}.pdf.
 * The last sheet may have fewer cards; empty cells are simply left blank.
 */
export async function imposeToPdf(cardIdsInOrder: string[]): Promise<string[]> {
  await fs.mkdir(PATHS.outputPrint, { recursive: true });

  const pngPaths = cardIdsInOrder.map((id) => path.join(PATHS.outputCards, `${id}.png`));
  const sheets = chunk(pngPaths, CARDS_PER_SHEET);

  const outputPaths: string[] = [];
  for (let i = 0; i < sheets.length; i++) {
    const sheetCards = sheets[i];
    const padded: (string | null)[] = [...sheetCards, ...Array(CARDS_PER_SHEET - sheetCards.length).fill(null)];
    const pdfBytes = await buildSheet(padded);
    const outPath = path.join(PATHS.outputPrint, `sheet-${i + 1}.pdf`);
    await fs.writeFile(outPath, pdfBytes);
    outputPaths.push(outPath);
    console.log(`  imposed ${outPath} (${sheetCards.length} card(s))`);
  }
  return outputPaths;
}
