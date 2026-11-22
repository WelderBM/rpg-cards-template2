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
- Ordem semântica por tipo: `arma` = [Dano, Crítico, Peso], `pocao` = [Duração, Alvo/Área, Resistência] (aprovado em 22/11/2026, ver "Poções"). `item` ainda usa [Peso, Raridade, Custo] e continua sem revisão.
- `data/cards.json` só precisa fornecer `valor` em cada posição do array `atributos` — ícone e rótulo vêm de `TYPE_FOOTER_DEFAULTS` por posição/tipo. Uma carta pode sobrescrever `icone`/`rotulo` por posição (`"icone": ""` = sem ícone); `"valor": ""` mostra "–" naquele compartimento, sem ícone (decisão do dono em 22/11/2026: "no espaço vazio coloque '-'"; constante `FOOTER_EMPTY_VALUE`).
- (22/11/2026) **Os dois divisores do rodapé são pintados na arte da moldura.** As células eram terços iguais de um slot que passava por baixo dos rolos, então nenhum valor ficava centrado entre os divisores e valores longos invadiam o rolo direito. Agora cada valor é centrado no seu compartimento pintado, medido nos pixels de cada moldura (`FOOTER_CELLS_MM` em `config.ts`). As molduras não são espelhadas no rodapé: divisores em 28,4/49,9 mm na `frame-right` e 26,2/48,5 mm na `frame-left`; rolos em ~10–62,5 mm nas duas. O 3º compartimento é o mais estreito (12,7 mm na direita).
- (22/11/2026) Os 3 valores do rodapé saem no mesmo tamanho de fonte (o menor dos três após o autofit). Antes cada um encolhia sozinho ("Poção" grande ao lado de "Instantâneo" pequeno). Respiro interno de 14 px por lado em cada compartimento (`FOOTER_CELL_PADDING_PX`).
- (22/11/2026) Valor com espaço que fica apertado em 1 linha quebra em até **2 linhas centradas**, desde que isso dê uma fonte pelo menos 15% maior (`fitFooterValue` em `render.ts`). Em 2 linhas, a fonte fica limitada a 80% do máximo, para deixar respiro na faixa. Motivo: "Vontade parcial" no 3º compartimento não cabe em 1 linha na moldura direita, e na esquerda só cabe no mínimo de 18 px, o que derrubava o rodapé inteiro para 18 px. O texto nunca é cortado nem abreviado; se nem 2 linhas couberem, o build para com `TextOverflowError`.
- Limite prático da 3ª célula: "Esfera de 6m de raio" não cabia nem no mínimo de 18 px em 1 linha (medido antes do fallback de 2 linhas; reconferir). "Esfera 6m" cabe.

## Arte das cartas — direção (22/11/2026)

- O dono decidiu que a arte de item será **gerada por IA, de forma automatizada**, no estilo da referência aprovada (`assets/inspiration/exemplo-carta-pronta.jpg`: item pintado, realista, luz quente, sobre o pergaminho). Os ícones atuais (`pocao-cura.png`, `espada-longa.png`) são provisórios.
- Ainda em aberto: o provedor de IA, o escopo (só poções ou todas as cartas) e se a geração roda como script do repo ou dentro da sessão. Nada foi implementado ainda.

## Arte ausente

- (22/11/2026, decisão provisória — confirmar com o dono) Se `imagem` aponta para um arquivo que não existe, a janela da arte fica só com o pergaminho, e o build/teste avisa uma vez, listando todas as cartas sem arte. Antes saía o ícone de imagem quebrada do Chromium com borda cinza, inclusive nos PDFs. Alternativas não adotadas: falhar o build; ícone provisório por tipo.

## Repetição de cartas na impressão

- `data/cards-to-reapeat.json` (nome com o typo mesmo, é o arquivo que o usuário criou) lista `{ id, "times-to-repeat" }`. O número é o **total** de cópias a imprimir daquela carta (não é "+1 além do padrão").
- Ids que não batem com nenhuma carta real geram um aviso no terminal e são ignorados (não quebram o build) — proteção contra erro de digitação.

## Regra de fonte: o livro sempre prevalece (22/11/2026)

- Decisão do dono: quando o doc da mesa (`D:\Downloads\Cartas Rpg.md`) ou o texto da mestre diverge do livro Tormenta20, **vale o livro**: números (dano, crítico, carga, preço), duração e notação.
- **Valor duplo no livro (ex.: "1d10/1d12") = dois valores possíveis (uma mão / duas mãos, ou as duas pontas de arma dupla): a carta mostra só o MAIOR.** Decisão do dono, 22/11/2026. Ao conferir contra o livro, comparar com o maior dos dois.
- Aplicado em 22/11/2026 (`data/cards.json`): Chicote crítico 20x3→20x2; Katana crítico 20x2→19x2 e dano 1d10/1d8→1d10 (maior do livro, 1d8/1d10); Espada Bastarda dano 1d12 (maior do livro, 1d10/1d12: igual ao que já estava); Gadanho T$20→T$18; Lança Montada carga 1→2; Besta Pesada crítico 12x2→19x2 (corrigida antes pela outra sessão); Bordão 1d6 e Corrente de Espinhos 2d4 (o livro repete o mesmo dado nas duas pontas); Curar Ferimentos I duração Instantâneo→Instantânea. Conferido: 40/40 armas iguais ao livro, e nenhum valor com "/" no catálogo.
- Referência usada (tabelas do livro em formato de validação): `C:\Users\welde\Documents\Claude\respostas\2026-11-22-t20-referencia-armas-pocoes.json`, extraída da skill `t20` do projeto ficha-web.
- Limite: a skill `t20` tem 7 magias com o efeito truncado em "(...)". O texto dessas poções continua vindo da mestre, porque não há texto completo do livro para comparar. Nunca completar um texto truncado por conta própria.

## Dados

- `data/cards.json` tem 37 armas reais do Tormenta20, 1 poção (`curar-ferimentos-i`) e 4 munições (22/11/2026). Só `espada-longa` e `curar-ferimentos-i` têm arte em `assets/art/` — falta a arte das outras 40.

## Poções — layout APROVADO pela Jhulie em 22/11/2026

Histórico: a decisão dela de 29–30/07/2026 previa rodapé [Tipo, Duração, Alvo/Área] com Resistência no fim da descrição, e foi implementada assim de manhã. **O layout aprovado em 22/11/2026 substitui essa decisão:**

- **Subtítulo** = tipo da poção, campo `subtitulo`: `Poção`, `Óleo` ou `Granada`. É obrigatório; outro valor é erro de validação.
- **Rodapé** = [Duração, Alvo/Área, Resistência]. Poção não tem peso/carga. Resistência fica em `atributos[2].valor`; `""` mostra "–" sem ícone (13 das 17 poções de 1º círculo). A sprint pedia a célula limpa, sem traço; depois o dono decidiu colocar "-" no espaço vazio. O campo antigo `resistencia` virou erro de validação, com mensagem dizendo para onde ele foi. A descrição não recebe mais a resistência.
- Selo do círculo (campo `circulo`) e preço na moeda continuam como estavam. O design do selo foi mantido.
- `rotulo` em `atributos` serve só para documentação e conferência: se não bater com a ordem Duração / Alvo/Área / Resistência, o build avisa e continua. `_fonte` é documentação, nunca é renderizado.
- **Fonte dos dados:** `data/pocoes-1-circulo.json` (17 poções de 1º círculo, textos literais da mestre). O build lê `data/cards.json` mais todo `data/pocoes-*.json` (`src/catalog.ts`), em vez de mesclar tudo num arquivo só. Assim o arquivo da mestre fica intacto, os próximos círculos entram como arquivos novos, e não existe segunda cópia para desatualizar. Id repetido entre arquivos é erro. **Em 22/11/2026 esse arquivo ainda não estava no repositório** (nem em Downloads/Documents); só o layout foi implementado.
- `sono` continua como fixture de teste em `scripts/test.ts`. Quando `pocoes-1-circulo.json` chegar, `curar-ferimentos-i` (hoje em `cards.json`) e `sono` devem vir de lá; remover as cópias para não duplicar id.
- `circulo` é obrigatório para `tipo: "pocao"` e aceita somente 1 a 5. `pm` também é obrigatório e representa o custo total em PM da versão da magia. `circulo` e `pm` em carta que não é poção são erro (protege contra poção salva com o tipo errado).
- O círculo nunca é deduzido do preço: aprimoramentos podem elevar PM sem alterar o círculo base.
- O build compara o preço com `T$ 30 × pm²`. Divergência ou preço ilegível gera aviso no terminal e não interrompe o build; círculo ou PM estruturalmente inválidos continuam sendo erro.
- **Selo de círculo (aprovado em 22/11/2026):** selo de cera vermelho de 11 mm com "1º"…"5º", **logo abaixo da moeda, no mesmo eixo vertical**: canto superior direito no `frame-right`, esquerdo no `frame-left` (segue o ajuste fino de espelhamento da moeda). A ideia original dela era o canto superior direito; a moeda ocupa o canto, e o selo fica logo abaixo dela. Uma primeira versão (8 mm no trilho oposto à moeda) foi descartada: esse trilho tem só ~11 mm até a janela da arte, incluindo a borda rasgada, então o selo ficava pequeno e encostado na borda.
- O rodapé usa `hourglass.svg` para Duração. Não há ícone adequado para Alvo/Área nem para Resistência em `assets/icons`; essas células ficam sem ícone até a mesa fornecer ou aprovar um.
- Texto de poção vem literalmente da fonte entregue pela mestre. Não usar `.claude/skills/t20` como texto de carta, porque as magias dessa base estão truncadas com `(...)`. Onde o livro tiver o dado completo e divergir da mestre, vale o livro (ver "Regra de fonte").
- Arte da carta aprovada: `assets/art/pocao-cura.png`.

## Munições — sprint executada em 22/11/2026 (aguardando aprovação do rodapé)

- Quatro cartas `item` em `data/cards.json`, com texto literal da mestre e preços conferidos com o cap. 3: `balas` (T$20), `flechas` (T$1), `pedras` (T$0,5), `virotes` (T$2). Todas com subtítulo "Munição" e sem arte ainda.
- **Proposta de rodapé de munição (não aplicada aos outros itens):** [Qtd, Carga, –] = `×20` (sem ícone: não há ícone de quantidade em `assets/icons`; o "×" comunica a quantidade) | `weight.svg` `1` (mesmo ícone do Peso das armas, que no livro também é espaço/carga) | "–" no 3º compartimento. Implementada com sobrescrita por carta em `atributos`; `TYPE_FOOTER_DEFAULTS.item` continua [Peso, Raridade, Custo] até o dono aprovar. Alternativa para a 3ª célula, se quiserem preenchê-la: a ação de recarga tirada da descrição (Padrão / Livre / Movimento / Mov. ou Padrão).
- `data/cards-to-reapeat.json`: `id-exemplo` trocado pelas quatro munições com `times-to-repeat: 2` (duas pessoas da mesa usam flechas).
- `pnpm test -- flechas` renderizou os dois lados. `pnpm build -- right --ids=balas,flechas,pedras,virotes` gerou `output/cards/{balas,flechas,pedras,virotes}.png` e uma única folha `output/print/sheet-1.pdf` com as 8 cópias. Lado direito escolhido por ser o layout original; a sprint não especificava o lado.
- Ferramentas novas desta sprint: `pnpm build -- <lado> --ids=a,b` (build parcial; o catálogo inteiro continua validado; aceita vírgula ou espaço, porque sem aspas o PowerShell entrega a lista separada por espaço); `pnpm test -- <id> [<id>…]` (qualquer carta do catálogo; sem ids, as duas amostras de poção). Todo build apaga as `sheet-*.pdf` anteriores antes de gerar as novas: um build menor deixava as folhas do lote anterior misturadas na pasta.
