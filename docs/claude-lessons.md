# Lições aprendidas — rpg-cards-renderer

Cada lição: título curto, o que aconteceu (com PR/issue), e o **Padrão** a seguir.
Lição que vale para qualquer projeto → também devolver ao ecossistema
(skill `devolver-licao`).

<!-- Exemplo:
### Título da lição
O que aconteceu, com o número do PR. **Padrão:** o que fazer daqui para frente.
-->

### CI com Playwright: runner fixo, nunca `ubuntu-latest`
No PR #1 o primeiro run do CI quebrou em `playwright install --with-deps chromium`:
o `ubuntu-latest` já era Ubuntu 26.04 e o Playwright 1.56.1 não instala Chromium
nele ("Playwright does not support chromium on ubuntu26.04-x64"). **Padrão:** o job
roda em `ubuntu-24.04`; só trocar o runner no mesmo PR que atualizar o Playwright
no `package.json`, conferindo que o `pnpm test` continua renderizando igual.
