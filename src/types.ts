export type CardType = "arma" | "item" | "pocao";

export interface CardAttribute {
  /** SVG filename inside assets/icons/. Falls back to config.TYPE_FOOTER_DEFAULTS by tipo+position when omitted. */
  icone?: string;
  /** Falls back to config.TYPE_FOOTER_DEFAULTS by tipo+position when omitted. */
  rotulo?: string;
  valor: string;
}

export interface Card {
  id: string;
  tipo: CardType;
  titulo: string;
  subtitulo?: string;
  /** e.g. "T$2" */
  preco: string;
  descricao: string;
  /** Exactly 3 entries — one per footer cell. */
  atributos: CardAttribute[];
  /** Path to the item art, relative to the project root, e.g. "assets/art/espada.png" */
  imagem: string;
}
