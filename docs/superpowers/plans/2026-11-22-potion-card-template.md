# Potion Card Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um template de carta de poção com uma carta real, um fixture longo de autofit e validação não bloqueante do preço por PM.

**Architecture:** Manter o pipeline HTML/Playwright existente. Modelar poções como ramo obrigatório do tipo `Card`, centralizar a validação de dados usada pelo build e renderizar o selo de círculo em um slot calibrável e espelhável definido em `src/config.ts`.

**Tech Stack:** Node 20, TypeScript ESM, `tsx`, Playwright/Chromium, HTML/CSS gerado por TypeScript.

**Spec:** Este arquivo, em “Global Constraints”, registra a especificação fornecida na conversa de 2026-11-22 e as decisões de Jhulie de 29–30/07/2026.

> **Status (22/11/2026): executado, com divergências deste plano** — o registro vigente é o `memory.md`.
> - Selo: 11 mm **abaixo da moeda** (não 8 mm no trilho oposto; ali ficava pequeno e encostado na borda).
> - Resistência: campo próprio `resistencia`, renderizado no fim da descrição; `descricao` fica literal (o plano previa acrescentar o texto à descrição).
> - Rodapé recalibrado pelos divisores pintados nas molduras (`FOOTER_CELLS_MM`), com fonte igual nos 3 valores — afeta todas as cartas.
> - Arte ausente deixa a janela vazia e avisa (antes: ícone de imagem quebrada).
> - A sprint de munições também foi executada na sequência (ver `memory.md`).

## Global Constraints

- Produzir somente o template de poção e uma carta real; não executar lote.
- Poção usa exatamente três células: Tipo, Duração, Alvo/Área.
- Resistência, quando presente, aparece no fim da descrição.
- `circulo` é obrigatório e limitado a 1–5 quando `tipo = "pocao"`; `pm` também é obrigatório.
- O build avisa, sem falhar, quando `preco` difere de `T$ 30 × pm²`.
- Nunca deduzir círculo pelo preço ou PM.
- Descrições são cópia literal da fonte da mestre; não consultar `.claude/skills/t20`.
- Reutilizar apenas ícones existentes; registrar a ausência de ícone adequado para Alvo/Área.
- Sem commit, push ou build em lote.
- A sprint de munições fica apenas enfileirada em `memory.md`, sem alteração de cartas `item` nesta sprint.

## Review Focus

- Poção sem `circulo` ou com valor fora de 1–5 deve falhar na validação estrutural.
- Poção sem `pm` inteiro positivo deve falhar na validação estrutural.
- Preço divergente ou ilegível deve emitir aviso e permitir continuidade.
- Selo deve espelhar com a moeda e não tocar arte, título ou frame em ambos os lados.
- Descrição longa com Resistência deve caber sem clipping no mínimo configurado.

---

### Task 1: Modelo e validação de poção

**Files:**
- Modify: `src/types.ts`
- Create: `src/validation.ts`
- Modify: `scripts/build.ts`
- Modify: `scripts/test.ts`

**Interfaces:**
- Produces: `PotionCard`, união discriminada `Card`, `validateCards(cards, warn?)` e aviso de preço por PM.
- Consumes: `FOOTER_CELL_COUNT` e os dados JSON existentes.

- [ ] Tornar `circulo: 1 | 2 | 3 | 4 | 5` e `pm: number` obrigatórios apenas no ramo `pocao`.
- [ ] Validar id, tipo, três atributos, círculo e PM; rejeitar apenas erros estruturais.
- [ ] Interpretar preço em T$, comparar com `30 * pm ** 2` e chamar `warn` quando divergir ou não puder ser lido.
- [ ] Usar a validação no build e no teste visual.
- [ ] Verificar o aviso com um preço propositalmente divergente, sem iniciar lote.

### Task 2: Selo e rodapé de poção

**Files:**
- Modify: `src/config.ts`
- Modify: `src/card.html.ts`
- Modify: `src/render.ts`

**Interfaces:**
- Produces: slot `circleSeal` espelhado por `getSlotsForSide`, fonte calibrável e elemento condicional autofitável.
- Consumes: `PotionCard.circulo` e os slots do frame.

- [ ] Adicionar selo de 8 mm na faixa lateral oposta à moeda, em `src/config.ts`.
- [ ] Renderizar “1º” a “5º” somente em cartas `pocao`, com alto contraste e sem quebra.
- [ ] Incluir o selo no autofit de linha única.
- [ ] Trocar defaults do rodapé de poção para Tipo, Duração e Alvo/Área; deixar o terceiro sem ícone por falta de ativo adequado.

### Task 3: Carta real e fixture de autofit

**Files:**
- Modify: `data/cards.json`
- Modify: `scripts/test.ts`

**Interfaces:**
- Produces: carta real `curar-ferimentos-i` e fixture não produtivo `sono`.
- Consumes: `assets/art/pocao-cura.png`.

- [ ] Adicionar somente `curar-ferimentos-i` ao catálogo com os textos literais fornecidos.
- [ ] Definir `sono` apenas no teste visual, acrescentando literalmente “Resistência: Vontade parcial” ao fim da descrição.
- [ ] Renderizar as duas cartas nos lados right e left em `output/test/`.

### Task 4: Registro e verificação

**Files:**
- Modify: `memory.md`

**Interfaces:**
- Produces: decisão datada da poção e fila literal da sprint de munições.

- [ ] Atualizar a decisão antiga do rodapé de poção para Tipo, Duração e Alvo/Área.
- [ ] Registrar selo, validação do preço, fonte literal e ausência de ícone de Alvo/Área.
- [ ] Guardar a sprint de munições como pendente, sem executá-la.
- [ ] Rodar `pnpm test`, inspecionar os quatro PNGs e rodar `pnpm typecheck`.
- [ ] Conferir `git diff` e confirmar ausência de commit/push e de alterações de munição.
