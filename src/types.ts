export type CardType = "arma" | "item" | "pocao";

export interface CardAttribute {
  /** SVG filename inside assets/icons/. Falls back to config.TYPE_FOOTER_DEFAULTS by tipo+position when omitted. */
  icone?: string;
  /** Falls back to config.TYPE_FOOTER_DEFAULTS by tipo+position when omitted. */
  rotulo?: string;
  valor: string;
}

interface CardBase {
  id: string;
  titulo: string;
  subtitulo?: string;
  /** e.g. "T$2" */
  preco: string;
  descricao: string;
  /** Exactly 3 entries — one per footer cell. */
  atributos: CardAttribute[];
  /** Path to the item art, relative to the project root, e.g. "assets/art/espada.png" */
  imagem: string;
  /** Where the literal text came from. Documentation only — never rendered. */
  _fonte?: string;
}

export interface NonPotionCard extends CardBase {
  tipo: Exclude<CardType, "pocao">;
  circulo?: never;
  pm?: never;
}

export type SpellCircle = 1 | 2 | 3 | 4 | 5;

export const POTION_KINDS = ["Poção", "Óleo", "Granada"] as const;
export type PotionKind = (typeof POTION_KINDS)[number];

/**
 * Approved layout (Jhulie, 22/11/2026): subtitle = potion kind; footer =
 * [Duração, Alvo/Área, Resistência], with Resistência "" when the spell has
 * none (the cell then stays blank); circle seal; price on the coin.
 */
export interface PotionCard extends CardBase {
  tipo: "pocao";
  subtitulo: PotionKind;
  /** Base spell circle. Never inferred from price or PM cost. */
  circulo: SpellCircle;
  /** Total spell-point cost used to craft this specific potion (price check: T$30 × pm²). */
  pm: number;
}

export type Card = NonPotionCard | PotionCard;

export interface CardRepeatEntry {
  /** Must match a Card.id in data/cards.json. */
  id: string;
  /** Total number of copies to print for this card (not additional — replaces the default single copy). */
  "times-to-repeat": number;
}

/** Shape of data/cards-to-reapeat.json. */
export interface CardsToRepeatFile {
  "cards-to-repeat": CardRepeatEntry[];
}
