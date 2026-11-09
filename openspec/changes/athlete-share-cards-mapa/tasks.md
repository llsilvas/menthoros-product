# Tasks — athlete-share-cards-mapa

## 0. Gates

- [x] 0.1 As três dependências estão em `develop` e `main` (#227, #210, #228/#212; promoções #229/#213 em 2026-11-09)
- [x] 0.2 product-reviewer: Refine (escopo decidido pelo founder: Rota + Stickers, cor única). spec-reviewer: READY COM AJUSTES. Codex: NOT READY — gate antes da captura, `cacheBust` com `blob:`, normalização da foto (EXIF, memória), extensão zero, `pointercancel`; todos incorporados no design
- [x] 0.3 Q1: equirretangular com `cos(lat)` e extensão zero tratada (D1). Q2: pointer events nativos com `pointercancel` e `touch-action` (D2). Zonas de FC fora da v1 (D3)

## 1. Trajeto

- [x] 1.1 Adapter `buildRouteFromGpsTrace` (puro): decodifica a polyline, projeta, normaliza com margem, trata extensão zero; `null` com < 2 pontos
- [x] 1.2 Componente `RouteTrace` (SVG): cor única com brilho, início e fim marcados
- [x] 1.3 Testes: proporção (1%), primeiro/último ponto, extensão zero sem `NaN`, < 2 pontos
- [x] 1.4 Validação: `npm run lint && npm run build && npm run test:run`

## 2. Modelos

- [x] 2.1 `RouteCard` (story): trajeto, km em destaque, três métricas, assinatura, atribuição
- [x] 2.2 `PhotoStickersCard` (story): seleção de foto local, adesivos arrastáveis por ponteiro e teclado (distância com atribuição Garmin dentro, trajeto em círculo, assinatura); aderência fora (D5)
- [x] 2.3 Registrar os dois modelos no `ShareModelPicker`, condicionados a `gpsTrace != null` (CA2)
- [x] 2.4 Gate LGPD (D4): sem consentimento não gera blob; clique no destino abre o aviso; "Usar modelo sem mapa" troca o modelo
- [x] 2.4a `useShareImage`: `podeCapturar()` consultado antes do `toBlob`, geração vigente checada antes da captura, `cacheBust: false` (D4, D5)
- [x] 2.4b Normalização da foto: `createImageBitmap` com orientação EXIF, lado maior ≤ 2160 px, data URL JPEG (CA7)
- [x] 2.5 Testes de componente: CA1–CA7
- [x] 2.6 Validação: `npm run lint && npm run build && npm run test:run`

## 3. E2E

- [x] 3.1 Treino com GPS → Rota → Salvar abre o aviso → confirmar → Salvar baixa PNG 1080×1920; treino sem GPS não lista Rota/Stickers; Stickers com foto de fixture baixa PNG
- [x] 3.2 Validação: `npm run test:e2e`

## 4. Execução (2026-11-09)

- Front `bbecf68` (trajeto), `f1b50b8` (Rota, Foto, gate), `71983c7` (E2E), `2f7e4cb` (QA). Só front.
- Treino com GPS abre na Rota (primeiro modelo disponível sem planejado vinculado).
- Validação: lint e build passaram; `test:run` 304 arquivos / 2982 testes. E2E: 182 de 183 na suíte completa; a falha foi `coach/plano-zonas-editor.spec.ts`, fora desta change, que passa 14/14 isolado (instável sob carga paralela). Os 9 E2E de compartilhamento passaram depois do QA.
- PNGs reais em 1080×1920 conferidos (Rota e Foto) em `test-results/`.
- QA: frontend-reviewer não encontrou caminho que gere PNG com mapa sem consentimento. Corrigido: imagem regerada só ao soltar o adesivo; consentimento carregando ou com erro não abre o aviso; fundo antes do JPEG; ordem de duas fotos. Também corrigido: `limitar` do adesivo dividia por zero com o pai sem tamanho.
- [ ] 4.1 Verificação manual em iPhone e Android reais: share sheet, foto grande de câmera (EXIF e memória), arrastar com o dedo. Conferir também se o contorno de foco do adesivo (teclado) aparece no PNG
- [ ] 4.2 Follow-ups não bloqueantes: extrair `useShareGate`/`buildShareImageVersion` da `ShareWorkoutView` (clean-code); `role="slider"` com `aria-valuetext` nos adesivos; revogação em outro aparelho não invalida blob já gerado até recarregar; avisos de `act` em `mapCards.test.tsx`

