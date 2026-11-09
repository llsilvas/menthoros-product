# Tasks — athlete-share-cards-mapa

## 0. Gates

- [x] 0.1 As três dependências estão em `develop` e `main` (#227, #210, #228/#212; promoções #229/#213 em 2026-11-09)
- [ ] 0.2 Rodar `product-reviewer` e o pre-mortem (`/codex:adversarial-review`); incorporar
- [x] 0.3 Q1: equirretangular com `cos(lat)` (D1). Q2: pointer events nativos, sem dependência (D2). Achado: atleta sem limites de zona de FC → endpoint `/atletas/me/zonas/fc` (D3); tamanho S → M

## 1. Backend — zonas de FC do atleta (D3)

- [ ] 1.0a `GET /api/v1/atletas/me/zonas/fc` (ATLETA): só faixas de FC efetivas, do mesmo serviço do coach
- [ ] 1.0b Testes: unit do mapeamento, `@WebMvcTest`, auth (ATLETA 200, TECNICO 403)
- [ ] 1.0c Validação: `./mvnw clean verify`

## 1b. Trajeto

- [ ] 1.1 Adapter `buildRouteFromGpsTrace` (puro, testado): decodifica a polyline, projeta (equirretangular com `cos(lat)`), normaliza para o viewBox com margem, agrupa segmentos por zona de FC
- [ ] 1.2 Componente `RouteTrace` (SVG): segmentos por `zone-*`, brilho, `role="img"` com `aria-label` descrevendo as zonas
- [ ] 1.3 Testes: proporção preservada, primeiro/último ponto, ponto sem FC em `text-secondary`
- [ ] 1.4 Validação: `npm run lint && npm run build && npm run test:run`

## 2. Modelos

- [ ] 2.1 `RouteCard` (story): trajeto em tela cheia, km em destaque, três métricas em vidro, legenda com rótulos Z1–Z5, assinatura, atribuição
- [ ] 2.2 `PhotoStickersCard` (story): seleção de foto local, adesivos arrastáveis por ponteiro e teclado (distância com atribuição Garmin dentro, trajeto em círculo, assinatura); aderência fora (D5)
- [ ] 2.3 Registrar os dois modelos no `ShareModelPicker`, condicionados a `gpsTrace != null` (CA2)
- [ ] 2.4 Gate LGPD (D4): sem consentimento não gera blob; clique no destino abre o aviso; "Usar modelo sem mapa" troca o modelo
- [ ] 2.5 Testes de componente: CA1–CA4
- [ ] 2.6 Validação: `npm run lint && npm run build && npm run test:run`

## 3. E2E

- [ ] 3.1 Treino com GPS → Rota → aviso LGPD → confirmar → Salvar gera PNG; treino sem GPS não lista Rota/Stickers
- [ ] 3.2 Validação: `npm run test:e2e`
