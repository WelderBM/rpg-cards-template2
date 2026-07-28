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

## Fluxo de uso

### 1. `pnpm template` — aprovar o frame

Renderiza **só o frame** (sem título, descrição, arte ou preço) em
`output/template-blank.png`, no tamanho exato de impressão (874×1240px,
300dpi). Esse é o arquivo que deve ser revisado/aprovado antes de gerar o
lote de cartas.

Se `assets/frame/frame.png` ainda não existir, um placeholder neutro é
gerado automaticamente (caixas coloridas tracejadas mostrando cada slot
configurado em `src/config.ts`, rotuladas com nome e dimensões em px) — isso
NÃO é arte aprovada, é só um guia de calibração.

### 2. `pnpm build` — gerar o lote

Renderiza cada carta de `data/cards.json` em `output/cards/{id}.png` e monta
as folhas de impressão A4 (8 cartas A7 por folha, com marcas de corte) em
`output/print/sheet-{n}.pdf`.

Se o texto de alguma carta não couber em um slot mesmo no tamanho mínimo de
fonte configurado, o build **falha** com uma mensagem citando o `id` da carta,
o slot e as dimensões medidas vs. disponíveis — nunca corta ou estoura texto
silenciosamente.

### 3. `pnpm dev` — watch

Observa `data/`, `src/` e `assets/frame/` e re-executa o build a cada
mudança. Útil enquanto se calibra os slots no config ou se edita os dados
das cartas.

## Como trocar o frame

1. Substitua `assets/frame/frame.png` pela arte aprovada do pergaminho.
   - Tamanho exato esperado: `CANVAS_WIDTH_PX × CANVAS_HEIGHT_PX` (por padrão,
     sem sangria, isso é 874×1240px a 300dpi — veja `src/config.ts`).
   - O frame deve ter uma "janela" transparente (alpha) onde a arte do item
     aparece — a arte é desenhada **atrás** do frame, e o frame por cima
     (com a borda ornamentada se sobrepondo levemente à arte). As faixas de
     título/descrição devem já vir texturizadas/em branco no próprio PNG,
     pois o texto é desenhado **por cima** do frame.
2. Rode `pnpm template` de novo e confira `output/template-blank.png`.
3. Ajuste as caixas em `SLOTS` (`src/config.ts`) até título, arte, descrição,
   preço e rodapé caírem exatamente sobre as áreas certas do frame real —
   veja a seção abaixo.

## Como calibrar os slots (`src/config.ts`)

Tudo que é calibrável vive em `src/config.ts`:

- `SLOTS` — caixas (`xMm, yMm, widthMm, heightMm`) de título, arte,
  descrição, preço e rodapé, relativas ao canto superior esquerdo da caixa
  de corte (trim box) do cartão.
- `FONTS` — família, peso e tamanho mín/máx (px) de cada campo de texto.
- `LINE_HEIGHT` — múltiplo mín/máx de line-height usado no auto-fit da
  descrição.
- `TEXT_SAFE_PADDING_PX` / `ART_SAFE_PADDING_PX` — margem de segurança
  interna de cada slot, subtraída antes do texto/arte poder ocupar espaço.
- `ART_MIN_PX` / `ART_MAX_PX` — trava o tamanho da arte do item (o slot de
  arte é validado contra esses limites já no carregamento do config).
- `TYPE_FOOTER_DEFAULTS` — ícone/rótulo padrão de cada célula do rodapé,
  por `tipo` de carta (uma carta pode sobrescrever `icone`/`rotulo` por
  atributo; só `valor` é sempre obrigatório).
- `BLEED_MM` — sangria opcional (padrão `0`). Ativar sangria renderiza cada
  carta um pouco maior que a caixa de corte; na imposição (`src/impose.ts`)
  isso faz a arte "vazar" para a área de vinco entre cartas, mantendo as
  marcas de corte na posição correta — mas sacrifica o encaixe perfeito
  8-up (0 folga) da folha A4.
- Dica de calibração rápida: gere o frame placeholder
  (`pnpm exec tsx scripts/generate-placeholder-frame.ts`), que desenha cada
  `SLOTS.*` como uma caixa tracejada colorida com rótulo — sobreponha essa
  imagem à arte real do pergaminho (em um editor de imagem) para conferir
  visualmente onde cada slot cai.

## Formato de `data/cards.json`

```jsonc
{
  "id": "espada-longa",           // único, usado no nome do arquivo de saída
  "tipo": "arma",                 // "arma" | "item" | "pocao" — controla os ícones padrão do rodapé
  "titulo": "Espada Longa",
  "subtitulo": "Arma Marcial",    // opcional, não renderizado no template atual
  "preco": "T$75",
  "descricao": "Uma lâmina reta e equilibrada...",
  "atributos": [                  // EXATAMENTE 3 entradas (uma por célula do rodapé)
    { "valor": "1d8" },            // icone/rotulo herdam de TYPE_FOOTER_DEFAULTS[tipo][i] se omitidos
    { "valor": "1.5kg" },
    { "valor": "T$75" }
  ],
  "imagem": "assets/art/espada-longa.png" // caminho relativo à raiz do projeto
}
```

## Imposição (`src/impose.ts`)

A folha A4 (210×297mm) encaixa exatamente 8 cartas A7 (74×105mm) quando elas
são rotacionadas 90°: 2 colunas de 105mm = 210mm (largura exata da folha), 4
linhas de 74mm = 296mm (contra 297mm da folha — a folga de ~1mm vira margem
superior/inferior). Cada carta é desenhada rotacionada com `pdf-lib`
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
- **Frame** (`assets/frame/frame.png`): placeholder neutro gerado
  localmente — **substituir pela arte aprovada** antes de qualquer uso real.
- **Arte dos itens de exemplo** (`assets/art/espada-longa.png`,
  `assets/art/pocao-cura.png`): placeholders gerados a partir dos mesmos
  ícones do game-icons.net (CC BY 3.0) só para demonstrar o pipeline —
  substituir pela arte real de cada item.
