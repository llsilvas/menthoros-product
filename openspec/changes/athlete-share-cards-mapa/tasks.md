# Tasks — athlete-share-cards-mapa

## 0. Gates

- [x] 0.1 As três dependências estão em `develop` e `main` (#227, #210, #228/#212; promoções #229/#213 em 2026-11-09)
- [x] 0.2 product-reviewer: Refine (escopo decidido pelo founder: Rota + Stickers, cor única). spec-reviewer: READY COM AJUSTES. Codex: NOT READY — gate antes da captura, `cacheBust` com `blob:`, normalização da foto (EXIF, memória), extensão zero, `pointercancel`; todos incorporados no design
- [x] 0.3 Q1: equirretangular com `cos(lat)` e extensão zero tratada (D1). Q2: pointer events nativos com `pointercancel` e `touch-action` (D2). Zonas de FC fora da v1 (D3)

## 1. Trajeto

- [ ] 1.1 Adapter `buildRouteFromGpsTrace` (puro): decodifica a polyline, projeta, normaliza com margem, trata extensão zero; `null` com < 2 pontos
- [ ] 1.2 Componente `RouteTrace` (SVG): cor única com brilho, início e fim marcados
- [ ] 1.3 Testes: proporção (1%), primeiro/último ponto, extensão zero sem `NaN`, < 2 pontos
- [ ] 1.4 Validação: `npm run lint && npm run build && npm run test:run`

## 2. Modelos

- [ ] 2.1 `RouteCard` (story): trajeto, km em destaque, três métricas, assinatura, atribuição
- [ ] 2.2 `PhotoStickersCard` (story): seleção de foto local, adesivos arrastáveis por ponteiro e teclado (distância com atribuição Garmin dentro, trajeto em círculo, assinatura); aderência fora (D5)
- [ ] 2.3 Registrar os dois modelos no `ShareModelPicker`, condicionados a `gpsTrace != null` (CA2)
- [ ] 2.4 Gate LGPD (D4): sem consentimento não gera blob; clique no destino abre o aviso; "Usar modelo sem mapa" troca o modelo
- [ ] 2.4a `useShareImage`: `podeCapturar()` consultado antes do `toBlob`, geração vigente checada antes da captura, `cacheBust: false` (D4, D5)
- [ ] 2.4b Normalização da foto: `createImageBitmap` com orientação EXIF, lado maior ≤ 2160 px, data URL JPEG (CA7)
- [ ] 2.5 Testes de componente: CA1–CA7
- [ ] 2.6 Validação: `npm run lint && npm run build && npm run test:run`

## 3. E2E

- [ ] 3.1 Treino com GPS → Rota → Salvar abre o aviso → confirmar → Salvar baixa PNG 1080×1920; treino sem GPS não lista Rota/Stickers; Stickers com foto de fixture baixa PNG
- [ ] 3.2 Validação: `npm run test:e2e`
