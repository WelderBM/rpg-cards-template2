import { existsSync } from "node:fs";
import path from "node:path";
import { FOOTER_CELL_COUNT, ROOT_DIR, TYPE_FOOTER_DEFAULTS } from "./config.js";
import { POTION_KINDS, type Card, type PotionCard } from "./types.js";

type WarningSink = (message: string) => void;

function parseTibars(value: unknown): number | null {
  if (typeof value !== "string") return null;

  const match = value.trim().match(/^T\$\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?)$/i);
  if (!match) return null;

  const parsed = Number(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTibars(value: number): string {
  return `T$${value.toLocaleString("pt-BR")}`;
}

export function potionPriceWarning(card: Pick<PotionCard, "id" | "pm" | "preco">): string | null {
  const actualPrice = parseTibars(card.preco);
  const expectedPrice = 30 * card.pm ** 2;

  if (actualPrice === null) {
    return `Aviso: poção "${card.id}" tem preço ilegível "${String(card.preco)}"; esperado ${formatTibars(expectedPrice)} pela fórmula T$30 × ${card.pm}². O build continuará.`;
  }

  if (actualPrice !== expectedPrice) {
    return `Aviso: poção "${card.id}" custa ${card.preco}, mas ${card.pm} PM exige ${formatTibars(expectedPrice)} pela fórmula T$30 × ${card.pm}². O build continuará.`;
  }

  return null;
}

/** Runtime validation for JSON data. Price mismatches warn; structural errors still fail fast. */
export function validateCards(cards: unknown[], warn: WarningSink = console.warn): asserts cards is Card[] {
  const seenIds = new Set<string>();
  const missingArt: string[] = [];

  for (const rawCard of cards) {
    if (typeof rawCard !== "object" || rawCard === null) {
      throw new Error("Every card must be a JSON object.");
    }

    const card = rawCard as Record<string, unknown>;
    if (typeof card.id !== "string" || card.id.length === 0) {
      throw new Error("Every card needs a non-empty `id`.");
    }
    if (seenIds.has(card.id)) throw new Error(`Duplicate card id "${card.id}" (data/cards.json + data/pocoes-*.json).`);
    seenIds.add(card.id);

    if (!['arma', 'item', 'pocao'].includes(String(card.tipo))) {
      throw new Error(`Card "${card.id}": invalid tipo "${String(card.tipo)}" (expected arma|item|pocao).`);
    }
    if (typeof card.imagem !== "string" || card.imagem.length === 0) {
      throw new Error(`Card "${card.id}": needs an \`imagem\` path (the file itself may not exist yet).`);
    }
    if (!existsSync(path.join(ROOT_DIR, card.imagem))) missingArt.push(card.id);

    if (!Array.isArray(card.atributos) || card.atributos.length !== FOOTER_CELL_COUNT) {
      const count = Array.isArray(card.atributos) ? card.atributos.length : 0;
      throw new Error(
        `Card "${card.id}": atributos must have exactly ${FOOTER_CELL_COUNT} entries (got ${count}).`,
      );
    }
    const attrs = card.atributos as Record<string, unknown>[];
    attrs.forEach((attr, i) => {
      if (typeof attr !== "object" || attr === null || typeof attr.valor !== "string") {
        throw new Error(`Card "${card.id}": atributos[${i}] needs a string \`valor\` ("" leaves the cell blank).`);
      }
    });
    if (card._fonte !== undefined && typeof card._fonte !== "string") {
      throw new Error(`Card "${card.id}": _fonte, when present, must be a string.`);
    }
    // Old potion layout put Resistência at the end of the description; it is now footer cell 3.
    if (card.resistencia !== undefined) {
      throw new Error(`Card "${card.id}": "resistencia" is no longer a field — put it in atributos[2].valor ("" when none).`);
    }

    if (card.tipo === "pocao") {
      if (!Number.isInteger(card.circulo) || Number(card.circulo) < 1 || Number(card.circulo) > 5) {
        throw new Error(`Card "${card.id}": pocao requires integer circulo from 1 to 5.`);
      }
      if (!Number.isInteger(card.pm) || Number(card.pm) < 1) {
        throw new Error(`Card "${card.id}": pocao requires a positive integer pm cost.`);
      }
      if (!(POTION_KINDS as readonly unknown[]).includes(card.subtitulo)) {
        throw new Error(
          `Card "${card.id}": pocao needs subtitulo ${POTION_KINDS.join(" | ")} (got ${JSON.stringify(card.subtitulo)}).`,
        );
      }

      // `rotulo` is documentation in the data; here it guards the cell order.
      attrs.forEach((attr, i) => {
        const expected = TYPE_FOOTER_DEFAULTS.pocao[i].rotulo;
        if (typeof attr.rotulo === "string" && attr.rotulo !== expected) {
          warn(`Aviso: poção "${card.id}": atributos[${i}] tem rotulo "${attr.rotulo}", mas essa célula é "${expected}" (ordem: Duração, Alvo/Área, Resistência).`);
        }
      });

      const warning = potionPriceWarning(card as unknown as PotionCard);
      if (warning) warn(warning);
    } else {
      // Silently ignoring these would hide a typo'd tipo (e.g. a potion saved as "item").
      for (const field of ["circulo", "pm"] as const) {
        if (card[field] !== undefined) {
          throw new Error(`Card "${card.id}": "${field}" only applies to tipo "pocao" (got tipo "${String(card.tipo)}").`);
        }
      }
    }
  }

  // One aggregated line instead of one per card (a fresh catalog can have dozens).
  if (missingArt.length > 0) {
    warn(
      `Aviso: ${missingArt.length} carta(s) sem arte em assets/art/ — saem com a janela da arte vazia: ${missingArt.join(", ")}.`,
    );
  }
}
