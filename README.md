# RPG Cards Renderer

Gerador standalone de cartas de RPG estilo pergaminho (Tormenta 20), prontas
para impressão. Renderiza HTML/CSS via Chromium headless (Playwright) com
fidelidade visual total e auto-fit de texto — nenhum texto pode estourar ou
cortar feio, sob pena do build falhar com um erro claro.

## Stack

- Node + TypeScript, executado com `tsx` (sem passo de compilação manual).
- Playwright + Chromium (local, sem rede em runtime).
- `pdf-lib` para montar as folhas A4 de impressão (8 cartas A7 por folha, com
  marcas de corte).
- `chokidar` para o modo watch (`pnpm dev`).

## Setup

```bash
pnpm install
```

O Chromium do Playwright precisa estar disponível localmente (em ambientes
com Chromium pré-instalado, configure `PLAYWRIGHT_BROWSERS_PATH` e
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` antes do install; caso contrário rode
`pnpm exec playwright install chromium` uma vez).

pnpm >= recente bloqueia scripts de build de dependências (`esbuild`, usado
pelo `tsx`) por padrão. Isso já está liberado em `pnpm-workspace.yaml`
(`allowBuilds.esbuild: true`) — se o install falhar com
`ERR_PNPM_IGNORED_BUILDS`, confira se esse arquivo não foi removido.

## Fluxo de uso

### 1. `pnpm template` — aprovar o frame

Renderiza **só o frame** (sem título, descrição, arte ou preço) em
`output/template-blank.png`, no tamanho exato de impressão (874×1240px,
300dpi). Esse é o arquivo que deve ser revisado/aprovado antes de gerar o
lote de cartas. Se nenhum frame existir ainda em `assets/frame/frame-right.png`
(veja "Lado da moeda" abaixo), um placeholder neutro é gerado automaticamente
com caixas coloridas mostrando cada slot — isso NÃO é arte aprovada.

### 2. `pnpm test` — comparação rápida (não é o lote final)

Renderiza **uma única carta de exemplo** (a primeira de `data/cards.json`)
nos dois lados possíveis da moeda, para `output/test/`:

- `exemplo-moeda-direita.png`
- `exemplo-moeda-esquerda.png`

Não toca em `output/cards/` nem `output/print/`. É só pra decidir/conferir
visualmente qual frame usar antes de rodar o lote de verdade.

### 3. `pnpm build` — gerar o lote definitivo

Renderiza cada carta de `data/cards.json` em `output/cards/{id}.png` e monta
as folhas de impressão A4 (8 cartas A7 por folha, com marcas de corte) em
`output/print/sheet-{n}.pdf`.

Como o frame existe em duas versões espelhadas (moeda à esquerda ou à
direita — veja abaixo), essa é a build **definitiva** e sempre exige escolher
um lado:

```bash
pnpm build -- right          # ou: pnpm build -- left
pnpm build -- --side=left    # forma alternativa, mesma coisa
pnpm build                   # sem argumento: pergunta interativamente no terminal
```

Se o texto de alguma carta não couber em um slot mesmo no tamanho mínimo de
fonte configurado, o build **falha** com uma mensagem citando o `id` da carta,
o slot e as dimensões medidas vs. disponíveis — nunca corta ou estoura texto
silenciosamente.

### 4. `pnpm dev` — watch

Observa `data/`, `src/` e `assets/frame/` e re-executa o build a cada
mudança. Aceita um lado opcional (`pnpm dev -- left`, padrão `right`) mas
**nunca pergunta** — é um preview rápido, não a build definitiva.

## Lado da moeda (frame espelhado)

O frame aprovado existe em duas versões, espelhadas horizontalmente:

- `assets/frame/frame-right.png` — moeda de preço no canto superior direito.
- `assets/frame/frame-left.png` — moeda no canto superior esquerdo.

`getSlotsForSide()` (`src/config.ts`) espelha **todos** os slots (não só o
preço) para o lado esquerdo — a caixa de arte não é centralizada no cartão
(fica deslocada pra manter folga da moeda), então espelhar só o preço faria a
arte colidir com a moeda nesse lado. `pnpm test` / `pnpm build` / `pnpm dev`
escolhem qual frame carregar através desse mesmo mecanismo.

## Como trocar o frame

1. Substitua `assets/frame/frame-right.png` (e opcionalmente `frame-left.png`,
   sua versão espelhada) pela arte aprovada do pergaminho.
   - O frame é **totalmente opaco** — a arte do item é desenhada **por cima**
     dele (com uma sombra própria), não atrás de uma janela recortada. As
     faixas de título/descrição/rodapé já vêm no próprio PNG; o texto é
     desenhado por cima.
   - O arquivo pode estar em qualquer resolução nativa — ele é escalado via
     CSS para o canvas de render (874×1240px a 300dpi, sem sangria por
     padrão). **Nunca meça posições de slot em cima do arquivo bruto** — a
     resolução nativa costuma ser bem maior que o canvas; meça sempre em
     cima de um screenshot já renderizado (`output/template-blank.png`) ou em
     porcentagem da imagem.
2. Rode `pnpm template` de novo e confira `output/template-blank.png`.
3. Ajuste as caixas em `SLOTS` (`src/config.ts`) até título, arte, descrição,
   preço e rodapé caírem exatamente sobre as áreas certas do frame real —
   veja a seção abaixo.

## Como calibrar os slots (`src/config.ts`)

Tudo que é calibrável vive em `src/config.ts`:

- `SLOTS` — caixas (`xMm, yMm, widthMm, heightMm`) de título, arte,
  descrição, preço e rodapé, relativas ao canto superior esquerdo da caixa
  de corte (trim box) do cartão. São os valores do frame **direito**;
  `getSlotsForSide("left")` deriva o espelhado automaticamente.
- `FONTS` — família, peso e tamanho mín/máx (px) de cada campo de texto.
- `LINE_HEIGHT` — múltiplo mín/máx de line-height usado no auto-fit da
  descrição.
- `TEXT_SAFE_PADDING_PX` / `ART_SAFE_PADDING_PX` — margem de segurança
  interna de cada slot, subtraída antes do texto/arte poder ocupar espaço.
- `ART_MIN_PX` / `ART_MAX_PX` — trava o tamanho da arte do item (o slot de
  arte é validado contra esses limites já no carregamento do config).
- `TYPE_FOOTER_DEFAULTS` — ícone/rótulo padrão de cada célula do rodapé,
  por `tipo` de carta (uma carta pode sobrescrever `icone`/`rotulo` por
  atributo; só `valor` é sempre obrigatório). Rótulos nunca são desenhados
  no cartão (só ícone + valor) — `rotulo` existe só como documentação de
  qual atributo é qual.
- `BLEED_MM` — sangria opcional (padrão `0`). Ativar sangria renderiza cada
  carta um pouco maior que a caixa de corte; na imposição (`src/impose.ts`)
  isso faz a arte "vazar" para a área de vinco entre cartas, mantendo as
  marcas de corte na posição correta — mas sacrifica o encaixe perfeito
  8-up (0 folga) da folha A4.

## Formato de `data/cards.json`

```jsonc
{
  "id": "espada-longa",           // único, usado no nome do arquivo de saída
  "tipo": "arma",                 // "arma" | "item" | "pocao" — controla os ícones/ordem padrão do rodapé
  "titulo": "Espada Longa",
  "subtitulo": "Arma",            // opcional, aparece abaixo do título com florões
  "preco": "T$75",                // vai na moeda
  "descricao": "Uma lâmina reta e equilibrada...",
  "atributos": [                  // EXATAMENTE 3 entradas (uma por célula do rodapé)
    { "valor": "1d8" },            // arma: [Dano, Crítico, Peso]. poção: [Efeito, Duração, Peso].
    { "valor": "19x2" },           // icone/rotulo herdam de TYPE_FOOTER_DEFAULTS[tipo][i] se omitidos
    { "valor": "1.5kg" }
  ],
  "imagem": "assets/art/espada-longa.png" // caminho relativo à raiz do projeto
}
```

### `data/cards-to-reapeat.json` — repetir cartas na impressão

Opcional. Lista cartas que devem sair em mais de uma cópia nas folhas de
impressão (`pnpm build`), sem duplicar a entrada em `cards.json`:

```json
{
  "cards-to-repeat": [
    { "id": "espada-longa", "times-to-repeat": 3 },
    { "id": "adaga", "times-to-repeat": 2 }
  ]
}
```

`"times-to-repeat"` é o **total** de cópias a imprimir daquela carta (não é
"a mais, além da padrão"). Ids que não existem em `cards.json` geram um
aviso no terminal e são ignorados — não quebram o build. As cópias saem
agrupadas na sequência (facilita separar/cortar depois).

## Imposição (`src/impose.ts`)

A folha A4 (210×297mm) encaixa exatamente 8 cartas A7 (74×105mm) quando elas
são rotacionadas 90°: 2 colunas de 105mm = 210mm (largura exata da folha), 4
linhas de 74mm = 296mm (contra 297mm da folha — a folga de ~1mm vira margem
superior/inferior). Esse arranjo usa 99,97% da área da folha — já é o máximo
matemático pra esse tamanho de carta (avaliamos migrar pra tamanho "Magic",
2,5×3,5pol, e o ganho seria zero: 9 cartas numa A4 contra as 8 atuais só
compensaria se o tamanho físico da carta fosse menor, o que não era o
objetivo). Cada carta é desenhada rotacionada com `pdf-lib`
(`drawImage(..., rotate: degrees(90))`), ancorada de forma a centralizar a
imagem (que inclui a sangria, se houver) exatamente no centro de cada célula
da grade. Marcas de corte são linhas finas nos vincos internos (1 vertical +
3 horizontais); as bordas externas da folha já coincidem com a borda das
cartas, então não precisam de marca separada.

## Licenças dos assets vendorizados

- **Fontes** (`assets/fonts/`): Cinzel e Lora, licença
  [SIL Open Font License](https://openfontlicense.org/) — arquivos `OFL.txt`
  incluídos junto de cada família, baixados do repositório
  [google/fonts](https://github.com/google/fonts).
- **Ícones** (`assets/icons/`): [game-icons.net](https://game-icons.net/),
  licença CC BY 3.0 — recoloridos (removido o fundo preto padrão, ícone
  pintado na cor de tinta `#3a2415`) a partir do repositório
  [game-icons/icons](https://github.com/game-icons/icons). Créditos: Lorc e
  Delapouite.
- **Frame** (`assets/frame/frame-right.png` / `frame-left.png`): arte
  aprovada, gerada com auxílio de IA (Canva) a partir da referência em
  `assets/inspiration/exemplo-carta-pronta.jpg`.
- **Arte dos itens**: a maioria das cartas em `data/cards.json` ainda não tem
  arte própria em `assets/art/` — falta gerar/adicionar por item.
