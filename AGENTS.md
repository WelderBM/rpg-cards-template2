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
| Rodar local | `pnpm dev -- right` (watch) · `pnpm template` (só a moldura) · `pnpm build -- right\|left` (lote definitivo) |
| Checar tipos/lint | `pnpm exec tsc --noEmit` (não há lint) |
| Testes | `pnpm test` (renderiza 1 carta nos dois lados em `output/test/`; não há suíte de testes unitários) |
| Testes do gate de revisão | `node --test scripts/ci/*.test.mjs` |
| Fila de prioridade | `node scripts/prioridade.mjs` |

Sem pnpm instalado na máquina: `npx pnpm@10 <comando>` funciona igual.

## Ritual antes de commitar
1. Checagem de tipos/lint e testes passando.
2. `git diff --stat` conferido (diff inflado = fim de linha).

## Superfícies (para o smoke de runtime)
Não é app web: as "superfícies" são as imagens e PDFs gerados em `output/`.
- `pnpm template` → `output/template-blank.png` (moldura vazia, para aprovar calibração).
- `pnpm test` → `output/test/exemplo-moeda-{direita,esquerda}.png`.
- `pnpm build -- right` e `pnpm build -- left` → `output/cards/{id}.png` + `output/print/sheet-{n}.pdf`. **É o fluxo que importa**: o PDF que vai para a gráfica.
- Conferir nos dois lados da moeda: texto dentro das caixas, arte sem encostar na moeda, rodapé com 3 atributos.

## Regras que mais pegam bug
- Toda medida física (mm, px, DPI, caixas, fontes) mora em `src/config.ts`. Nada de valor fixo em `card.html.ts`, `render.ts` ou `impose.ts`.
- Calibração se mede em cima de um PNG já renderizado (`output/template-blank.png` ou uma carta), nunca no PNG bruto da moldura (~1054×1492, escalado pelo Chromium para 874×1240).
- O lado `left` espelha **todas** as caixas (`getSlotsForSide`), não só o preço: a arte é deslocada de propósito para longe da moeda.
- Texto nunca é cortado: se não cabe no tamanho mínimo, `TextOverflowError` aborta o build. Não "resolver" baixando o mínimo sem o dono aprovar.
- `times-to-repeat` em `data/cards-to-reapeat.json` é o total de cópias, não cópias extras. O nome do arquivo tem o typo de propósito.
- Detectar "rodado direto" com `import.meta.url === pathToFileURL(process.argv[1]).href`; a concatenação `file://${...}` nunca bate no Windows.

## Lentes do revisor (opcional)
| Arquivos | Lente |
|---|---|
| `src/config.ts`, `src/card.html.ts`, `assets/frame/` | Layout de impressão: mm↔px, espelhamento left/right, caixas que se sobrepõem |
| `src/render.ts` | Autofit de texto: busca binária, mínimo/máximo, nunca cortar |
| `src/impose.ts`, `data/cards-to-reapeat.json` | Imposição A4: 8 por folha, repetições, ids inválidos |
| `data/cards.json`, `src/types.ts` | Dados: campos obrigatórios, tipo de carta, atributos do rodapé, arte faltando |

## Padrões reutilizáveis (não reimplementar)
- `getSlotsForSide(side)` e `boxToPx` / `mmToPx` (`src/config.ts`): caixas já espelhadas e convertidas.
- `TYPE_FOOTER_DEFAULTS` (`src/config.ts`): ícones/rótulos do rodapé por tipo. Tipo novo de carta = novo valor em `CardType` (`src/types.ts`) + entrada aqui.
- `buildCardHtml` / `buildBlankFrameHtml` (`src/card.html.ts`) e `renderSingleCard` / `renderCards` (`src/render.ts`): pipeline de uma carta.
- `imposeToPdf` (`src/impose.ts`): monta as folhas A4.
