# Tasks — athlete-share-cards-mapa

## 0. Gates

- [ ] 0.1 Confirmar `add-activity-gps-trace`, `athlete-share-cards` e `lgpd-trajeto-cards-compartilhamento` mergeadas em `develop`
- [ ] 0.2 Rodar `product-reviewer` e o pre-mortem (`/codex:adversarial-review`); incorporar
- [ ] 0.3 Decidir Q1 (projeção) e Q2 (drag no mobile)

## 1. Trajeto

- [ ] 1.1 Adapter `buildRoutePathFromGpsTrace` (puro, testado): decodifica a polyline, projeta (equirretangular com `cos(lat)`), normaliza para o viewBox com margem, agrupa segmentos por zona de FC
- [ ] 1.2 Componente `RouteTrace` (SVG): segmentos por `zone-*`, brilho, `role="img"` com `aria-label` descrevendo as zonas
- [ ] 1.3 Testes: proporção preservada, primeiro/último ponto, ponto sem FC em `text-secondary`
- [ ] 1.4 Validação: `npm run lint && npm run build && npm run test:run`

## 2. Modelos

- [ ] 2.1 `RouteCard` (story): trajeto em tela cheia, km em destaque, três métricas em vidro, legenda com rótulos Z1–Z5, assinatura, atribuição
- [ ] 2.2 `PhotoStickersCard` (story): seleção de foto (input `capture`), adesivos arrastáveis (distância, aderência, trajeto em círculo, assinatura), atribuição dentro do adesivo de dados
- [ ] 2.3 Registrar os dois modelos no `ShareModelPicker`, condicionados a `gpsTrace != null` (CA2)
- [ ] 2.4 Gate LGPD: chamar o aviso da change legal antes de gerar imagem com mapa (CA3)
- [ ] 2.5 Testes de componente: CA1–CA4
- [ ] 2.6 Validação: `npm run lint && npm run build && npm run test:run`

## 3. E2E

- [ ] 3.1 Treino com GPS → Rota → aviso LGPD → confirmar → Salvar gera PNG; treino sem GPS não lista Rota/Stickers
- [ ] 3.2 Validação: `npm run test:e2e`
