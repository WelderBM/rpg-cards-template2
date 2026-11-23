# rpg-cards-renderer — instruções para agentes

> Lido por qualquer agente (Claude Code, Codex, Gemini…). As regras genéricas de
> trabalho vêm do plugin **ecossistema** (skill `regras-de-trabalho`); aqui fica
> só o que é deste projeto. Lição técnica nova → `docs/claude-lessons.md`.
> Arquitetura detalhada: `CLAUDE.md`. Histórico de decisões: `memory.md` e
> `lessons.md` (raiz).

## O projeto
- **O que é:** Gerador de cartas de itens de Tormenta20 para impressão (PNG por carta + PDF A4 com 8 cartas por folha)
- **Objetivo atual:** Cobrir outros tipos de item além das armas (armaduras, itens gerais, poções etc.)
- **Stack:** Node 20 + TypeScript (ESM, rodado com `tsx`), Playwright/Chromium para renderizar o HTML de cada carta em PNG, `pdf-lib` para montar as folhas A4, `chokidar` no modo watch. Gerenciador: pnpm 10.
- **Branches:** trabalho nasce de `dev`; produção é `main` (só o dono faz merge).

## Comandos
| Para | Comando |
|---|---|
| Instalar | `pnpm install` e, na primeira vez, `pnpm exec playwright install chromium` |
| Rodar local | `pnpm dev -- right` (watch) · `pnpm template` (só a moldura) · `pnpm build -- right\|left` (lote definitivo) · `pnpm build -- right --ids=a,b` (só essas cartas) |
| Checar tipos/lint | `pnpm typecheck` (= `tsc --noEmit`; não há lint) |
| Testes | `pnpm test` (as 2 poções de amostra nos dois lados, em `output/test/`) · `pnpm test -- <id> [<id>…]` (qualquer carta). Não há suíte de testes unitários |
| Arte por IA | `pnpm art` (Gemini; precisa de `GEMINI_API_KEY` no `.env`, que nunca vai para o git) · `pnpm art -- <id> --variacoes=3` e depois `--aprovar=<id>:<n>` |
| Testes do gate de revisão | `node --test scripts/ci/*.test.mjs` |
| Fila de prioridade | `node scripts/prioridade.mjs` |

Sem pnpm instalado na máquina: `npx pnpm@10 <comando>` funciona igual.

## Ritual antes de commitar
1. Checagem de tipos/lint e testes passando.
2. `git diff --stat` conferido (diff inflado = fim de linha).

## Superfícies (para o smoke de runtime)
Não é app web: as "superfícies" são as imagens e PDFs gerados em `output/`.
- `pnpm template` → `output/template-blank.png` (moldura vazia, para aprovar calibração).
- `pnpm test` → `output/test/{id}-moeda-{direita,esquerda}.png`.
- `pnpm build -- right` e `pnpm build -- left` → `output/cards/{id}.png` + `output/print/sheet-{n}.pdf` (as folhas antigas são apagadas antes). **É o fluxo que importa**: o PDF que vai para a gráfica.
- Conferir nos dois lados da moeda: texto dentro das caixas, arte sem encostar na moeda, rodapé com 3 atributos.

## Regras que mais pegam bug
- Toda medida física (mm, px, DPI, caixas, fontes) mora em `src/config.ts`. Nada de valor fixo em `card.html.ts`, `render.ts` ou `impose.ts`.
- Calibração se mede em cima de um PNG já renderizado (`output/template-blank.png` ou uma carta), nunca no PNG bruto da moldura (~1054×1492, escalado pelo Chromium para 874×1240).
- O lado `left` espelha **todas** as caixas (`getSlotsForSide`), não só o preço: a arte é deslocada de propósito para longe da moeda.
- Texto nunca é cortado: se não cabe no tamanho mínimo, `TextOverflowError` aborta o build. Não "resolver" baixando o mínimo sem o dono aprovar.
- `times-to-repeat` em `data/cards-to-reapeat.json` é o total de cópias, não cópias extras. O nome do arquivo tem o typo de propósito.
- Os divisores do rodapé são pintados na moldura: as células seguem `FOOTER_CELLS_MM` (medido por lado), não terços iguais.
- Dados: o catálogo é `data/cards.json` + `data/pocoes-*.json` (`src/catalog.ts`). Textos de poção: os que a mestre escreve ficam literais; os demais seguem o padrão dela, conferidos com o efeito completo da magia no livro. Nunca escrever a partir de magia truncada com "(...)" em `.claude/skills/t20`. Se o material da mesa diverge do livro Tormenta20, vale o livro; valor duplo do livro ("1d10/1d12") → usar o maior.
- Detectar "rodado direto" com `import.meta.url === pathToFileURL(process.argv[1]).href`; a concatenação `file://${...}` nunca bate no Windows.

## Lentes do revisor (opcional)
| Arquivos | Lente |
|---|---|
| `src/config.ts`, `src/card.html.ts`, `assets/frame/` | Layout de impressão: mm↔px, espelhamento left/right, caixas que se sobrepõem |
| `src/render.ts` | Autofit de texto: busca binária, mínimo/máximo, nunca cortar |
| `src/impose.ts`, `data/cards-to-reapeat.json` | Imposição A4: 8 por folha, repetições, ids inválidos |
| `data/*.json`, `src/types.ts`, `src/validation.ts`, `src/catalog.ts` | Dados: campos obrigatórios, tipo de carta, atributos do rodapé, arte faltando, fidelidade ao livro |

## Padrões reutilizáveis (não reimplementar)
- `getSlotsForSide(side)` e `boxToPx` / `mmToPx` (`src/config.ts`): caixas já espelhadas e convertidas.
- `TYPE_FOOTER_DEFAULTS` (`src/config.ts`): ícones/rótulos do rodapé por tipo. Tipo novo de carta = novo valor em `CardType` (`src/types.ts`) + entrada aqui.
- `buildCardHtml` / `buildBlankFrameHtml` (`src/card.html.ts`) e `renderSingleCard` / `renderCards` (`src/render.ts`): pipeline de uma carta.
- `imposeToPdf` (`src/impose.ts`): monta as folhas A4.
