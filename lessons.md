# Lições aprendidas

Armadilhas reais que já morderam durante o desenvolvimento deste projeto, e como evitá-las. Não é changelog — é o "porquê" por trás de decisões não óbvias no código.

## Nunca meça calibração em cima do PNG bruto do frame

`assets/frame/*.png` são gerados numa resolução nativa (~1054×1492) bem maior que o canvas de render (874×1240px). O Chromium escala via CSS `width/height:100%`. Uma vez sobrepus uma grade de medição direto no arquivo bruto e "descobri" que a moeda estava 130px fora do lugar — na real, eu tinha comparado pixels de dois espaços de coordenada diferentes. A régua era inválida, não a calibração.

**Regra**: sempre medir em cima de um screenshot já renderizado (`output/template-blank.png` ou uma carta), nunca no arquivo-fonte. Ou usar porcentagem da imagem (independe de resolução).

## `isMain` check quebra no Windows com string concat

```ts
// QUEBRADO no Windows: file:// + backslash não bate com import.meta.url (forward slash, ///)
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

// CORRETO, cross-platform:
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
```

Esse bug faz o `main()` do script nunca rodar quando chamado diretamente (`pnpm exec tsx scripts/x.ts`) — sem erro nenhum, só silenciosamente não faz nada. Apareceu em `generate-placeholder-frame.ts` e `build.ts`; corrigido nos dois. Checar sempre que criar um script novo com esse padrão.

## Caixa de auto-fit com altura "shrink-to-fit" quebra a própria medição

Se o elemento pai usado como referência de medição (`measureFit` em `render.ts` mede `el.parentElement`) não tem altura fixa — e em vez disso encolhe pro tamanho do próprio conteúdo (`display:flex` sem `height` explícita) — a medição vira circular: a "altura disponível" sempre vai ser quase igual à altura do texto, porque o pai é DEFINIDO pelo texto. Isso quebrou o subtítulo ao adicionar `line-height:1` (o box encolheu junto com a linha, e um pixel de overshoot da fonte bastou pra falhar a validação em todo tamanho de fonte).

**Regra**: elementos medidos por `fitSingleLine`/`fitMultiLine` precisam de um pai com altura (e largura, se for medir largura) **fixa** — vinda de `SLOTS.*` via `boxToPx`, não de `display:flex` sem `height` setada.

## Caixa larga + centralizar = "centralizado" que não parece centralizado

O rodapé tinha bug onde ícone+valor pareciam grudados à esquerda da célula. Causa: o valor ficava dentro de uma caixa de largura fixa (usada só como teto pro auto-fit medir), com o texto alinhado à esquerda *dentro* dela — sobrava espaço vazio à direita que ninguém via, mas que empurrava visualmente o conjunto ícone+texto pra esquerda quando a CÉLULA inteira era centralizada (porque centralizar a caixa larga não é o mesmo que centralizar o texto real).

**Solução**: separar "orçamento de medição" (quanto o auto-fit pode usar antes de estourar) de "layout visual" (o elemento deve encolher pro tamanho real do conteúdo). Implementado via atributo `data-max-width-px` no próprio elemento, lido por `measureFit` como override em vez de depender do `clientWidth` do pai.

## Espelhar só o preço não é suficiente pro frame com moeda à esquerda

`SLOTS.art` não é centralizado (fica deslocado pra longe da moeda, ~1mm de folga proposital). Espelhar só `SLOTS.price` pro frame esquerdo e deixar a arte no lugar colide a arte com a moeda. A correção foi espelhar **todos** os slots (`getSlotsForSide`), não só o preço — espelhar uma caixa já simétrica (título, descrição, rodapé) não muda nada, então é seguro aplicar em todos de qualquer forma.

## A7 girado 90° já é ~ótimo pra A4 — nem sempre "aumentar o tamanho" é a resposta

Antes de mudar o tamanho da carta pro padrão Magic (2,5×3,5pol), vale checar se o tamanho atual já não está perto do limite físico da folha. Nesse caso, 74×105mm girado já ocupa 210×296mm de uma folha 210×297mm (99,97%) — trocar de tamanho não aumentaria a quantidade por folha nem melhoraria nada, só criaria trabalho de recalibração (todo `SLOTS` teria que ser reescalado, com fatores DIFERENTES pra X e Y já que a proporção do cartão muda).

## `pnpm` moderno bloqueia scripts de instalação (`onlyBuiltDependencies`)

Esse projeto depende de `esbuild` (via `tsx`), que tem um postinstall script. Versões recentes do pnpm bloqueiam scripts de build por padrão (política de supply-chain) e exigem allowlist explícita — não em `package.json` (`pnpm.onlyBuiltDependencies` é ignorado, gera warning), e sim em `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  esbuild: true
```

Sem isso, `pnpm install`/`pnpm build` falha com `[ERR_PNPM_IGNORED_BUILDS]`.
