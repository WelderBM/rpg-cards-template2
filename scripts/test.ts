/**
 * `pnpm test` — quick visual comparison, NOT the definitive build. Renders
 * each sample with BOTH coin sides to output/test/{id}-moeda-{direita,esquerda}.png.
 *
 *   pnpm test                 → the two potion samples: curar-ferimentos-i (catalog)
 *                               + sono (long-text fixture below, not in the catalog)
 *   pnpm test -- flechas      → any catalog card(s) by id instead
 *
 * Never touches output/cards/ or output/print/ — for the real, print-ready
 * batch (which requires picking ONE side), use `pnpm build` instead.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadCatalog } from "../src/catalog.js";
import { PATHS } from "../src/config.js";
import { renderSingleCard } from "../src/render.js";
import type { Card, PotionCard } from "../src/types.js";
import { validateCards } from "../src/validation.js";

const LONG_TEXT_POTION: PotionCard = {
  id: "sono",
  tipo: "pocao",
  titulo: "Sono",
  subtitulo: "Poção",
  circulo: 1,
  pm: 1,
  preco: "T$30",
  descricao:
    "Um cansaço místico recai sobre o alvo. Se falhar na resistência, ele fica inconsciente e caído ou, se estiver envolvido em combate ou outra situação perigosa, fica exausto por 1 rodada, depois fatigado. Em ambos os casos, se passar, o alvo fica fatigado por 1d4 rodadas.",
  atributos: [{ valor: "Cena" }, { valor: "1 criatura" }, { valor: "Vontade parcial" }],
  imagem: "assets/art/pocao-cura.png",
};

export async function runTest(ids: string[] = []): Promise<void> {
  console.log("=== TESTE — comparação lado a lado (não é a build definitiva) ===");

  const { cards: catalog } = await loadCatalog();

  let samples: Card[];
  if (ids.length > 0) {
    const unknown = ids.filter((id) => !catalog.some((card) => card.id === id));
    if (unknown.length > 0) throw new Error(`id(s) not in the catalog: ${unknown.join(", ")}`);
    samples = catalog.filter((card) => ids.includes(card.id));
  } else {
    const healingPotion = catalog.find((card) => card.id === "curar-ferimentos-i");
    if (!healingPotion || healingPotion.tipo !== "pocao") {
      throw new Error('data/cards.json must contain the potion "curar-ferimentos-i".');
    }
    // The catalog card was already validated above; validating it again would print its warnings twice.
    validateCards([LONG_TEXT_POTION]);
    samples = [healingPotion, LONG_TEXT_POTION];
  }

  await fs.mkdir(PATHS.outputTest, { recursive: true });

  for (const sample of samples) {
    const rightPath = path.join(PATHS.outputTest, `${sample.id}-moeda-direita.png`);
    const leftPath = path.join(PATHS.outputTest, `${sample.id}-moeda-esquerda.png`);

    await renderSingleCard(sample, "right", rightPath);
    console.log(`  rendered ${rightPath}`);
    await renderSingleCard(sample, "left", leftPath);
    console.log(`  rendered ${leftPath}`);
  }

  console.log(`\nDone. See output/test/ (${samples.length * 2} images).`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  // pnpm may forward the "--" separator itself; card ids never start with "-".
  runTest(process.argv.slice(2).filter((arg) => !arg.startsWith("-"))).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
