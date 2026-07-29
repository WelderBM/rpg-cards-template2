# Memória do projeto

Histórico de decisões e contexto que não é óbvio só de ler o código. Ordem cronológica.

## Frame / arte aprovada

- O frame final (`assets/frame/frame-right.png` / `frame-left.png`) foi gerado com IA (Canva) a partir de um prompt detalhado com proporções percentuais medidas na carta de referência (`assets/inspiration/exemplo-carta-pronta.jpg`, a carta "Adaga" do Tormenta20).
- Existem **dois frames**, espelhados horizontalmente: `frame-right.png` (moeda de preço no canto superior direito, o layout "original") e `frame-left.png` (moeda no canto superior esquerdo). A escolha de qual usar é feita em runtime via `pnpm build -- left|right`.
- A caixa de arte (`SLOTS.art`) **não é centralizada** no card — ela fica deslocada pra longe da moeda, mantendo ~1mm de folga. Isso importa pro espelhamento: espelhar só o preço e deixar a arte no lugar colide a arte com a moeda no frame esquerdo. `getSlotsForSide()` espelha todos os slots por causa disso.
- `assets/frame/frame.png` (sem sufixo) e `final-template*.png` são cópias/originais legados, mantidos por segurança, mas não são lidos pelo pipeline de renderização (que usa `FRAME_PATHS.left`/`.right`).

## Tamanho da carta

- Considerou-se mudar pra tamanho "Magic" (2,5×3,5pol = 750×1050px @300dpi), mas a decisão final foi **manter A7** (74×105mm = 874×1240px), porque o layout A7 girado 90° já ocupa 99,97% de uma folha A4 em 8-up (2 colunas × 4 linhas) — não haveria ganho real em trocar o tamanho, só risco de quebrar a calibração toda (SLOTS, fontes) sem benefício.
- Se um dia quiserem mesmo mudar de tamanho: todo o `SLOTS` (em mm) precisaria ser reescalado proporcionalmente (fator diferente pra X e Y, já que a proporção 74:105 não é idêntica a 63,5:88,9), e os tamanhos mín/máx de fonte em `FONTS` também, senão o autofit vai estourar em cartas com texto mais longo.

## Rodapé

- O rodapé mostra só ícone + valor, **sem rótulo** (ex: "⚔ 1d8", não "Dano: 1d8") — decisão explícita do usuário, o ícone já comunica o que é o atributo.
- Ordem semântica por tipo: `arma` = [Dano, Crítico, Peso], `pocao` = [Efeito, Duração, Peso]. O 3º atributo é sempre Peso — não Custo, porque o preço já tem a moeda dedicada, repetir seria redundante. `item` ainda usa [Peso, Raridade, Custo] (não foi revisado, ninguém pediu).
- `data/cards.json` só precisa fornecer `valor` em cada posição do array `atributos` — ícone e rótulo vêm de `TYPE_FOOTER_DEFAULTS` por posição/tipo.

## Repetição de cartas na impressão

- `data/cards-to-reapeat.json` (nome com o typo mesmo, é o arquivo que o usuário criou) lista `{ id, "times-to-repeat" }`. O número é o **total** de cópias a imprimir daquela carta (não é "+1 além do padrão").
- Ids que não batem com nenhuma carta real geram um aviso no terminal e são ignorados (não quebram o build) — proteção contra erro de digitação.

## Dados

- `data/cards.json` tem hoje 37 armas reais do Tormenta20 (não é mais só 1-2 cartas de exemplo). A maioria não tem `assets/art/{id}.png` ainda — falta gerar/adicionar a arte de cada item.
