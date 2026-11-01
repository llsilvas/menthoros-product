# Tasks — alinhar-icones-marca-front

Repo: `apps/menthoros-front`. Validação padrão: `npm run lint && npm run build && npm run test:run`.
Branch (criada no `/implement init`): `chore/alinhar-icones-marca-front`.

## 0. Gate

- [ ] 0.1 Confirmar com quem criou os ícones (ou com o founder) se os 7 arquivos atuais já saíram do
  logo oficial. **Se sim, fechar a change sem mudar arquivo** e registrar a conferência aqui.
  *verify:* resposta registrada em "Notas".

## 1. Geração dos ícones

- [ ] 1.1 Extrair o rinoceronte do logo oficial (x 87–590, y 0–245 do PNG 680×456) preservando o alfa,
  e conferir o canal alfa do resultado. **Sem adicionar dependência ao `package.json`.**
  *verify:* o recorte tem 504×246 e fundo transparente.
- [ ] 1.2 Gerar `menthoros_favicon.png` (222×222) e ver em 32×32 sobre fundo escuro. **Gate CA3:** se o
  contorno não for reconhecível, **parar** e pedir mark compacto ao designer (A2); não seguir.
  *verify:* print do favicon em 32×32 anexado em "Notas".
- [ ] 1.3 Gerar os demais: `menthoros_mark.png` (222×174), `menthoros_navbar.png` (130×130),
  `public/icons/apple-touch-icon-180.png` (180×180), `icon-192.png`, `icon-512.png` e
  `icon-512-maskable.png` (512×512), mantendo caminho, nome e dimensão. Touch icon e maskable: manter o
  fundo atual (A4). Maskable: conteúdo dentro do círculo de 410 px (CA4).
  *verify:* dimensões conferidas com `sips -g pixelWidth -g pixelHeight`; alfa do maskable medido.

## 2. Teste e validação

- [ ] 2.1 Teste Vitest `src/assets/icons/iconesMarca.test.ts`: lê o IHDR (largura e altura) dos 7 PNGs e
  compara com a tabela do `proposal.md` (CA1). Escrever **antes** da 1.3 (vermelho com os arquivos atuais
  se alguma dimensão divergir; verde depois). *verify:* `npm run test:run -- iconesMarca`.
- [ ] 2.2 Conferência visual lado a lado (ícone antigo × novo × recorte do logo) para o founder
  aprovar (CA2): login, navbar, sidebar do coach, aba do navegador, e o PWA instalado.
  *verify:* aprovação do founder registrada em "Notas".
- [ ] 2.3 `npm run lint && npm run build && npm run test:run` e o spec E2E do PWA
  (`npx playwright test tests/e2e/pwa`) verdes (CA5).
  *verify:* saída dos comandos.

## Notas

- Hard refresh no teste manual: `public/` não tem hash de build, o navegador pode mostrar o favicon
  antigo.
