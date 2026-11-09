# Tasks — athlete-share-cards-esteira

## 0. Gates

- [x] 0.1 DoR (2026-11-09): Codex → NOT READY. Incorporado: CA1 passa a exigir a escolha de "Esteira"
  (o modelo inicial é `availableModels[0]`, `ShareWorkoutView.tsx:38`); gate com coorte, ação
  contável (Salvar/Compartilhar, não a prévia) e tratamento de não respondentes (task 2.4).
  Conferido contra o código: `tssCalculado`, `fcMedia`, `distanciaKm`, `deviceName` existem em
  `TreinoRealizadoDto`; "Mostrar FC" já existe e é ligado por modelo na `versao` da imagem.
- [ ] 0.2 `add-activity-treadmill-flag` mergeada e em produção

## 1. Dados e card

- [ ] 1.1 `esteira?: boolean` em `TreinoRealizadoDto`; `buildShareCardData` adiciona o modelo
  `esteira` na ordem do escopo, com o view model do card (destaque, pace, blocos)
  verify: testes de disponibilidade (CA1) e de dados ausentes (CA2) no adapter
- [ ] 1.2 `TreadmillCard` (v2 I) com tokens do tema e SVG inline do ícone; `ShareModel`,
  `SHARE_MODEL_DEFAULT_FORMAT` (story) e rótulo "Esteira"
  verify: testes de componente de CA1, CA3 e CA4
- [ ] 1.3 `ShareWorkoutView`: render do modelo; "Mostrar FC" entra na versão da imagem para `esteira`
  verify: alternar FC regenera a imagem nesse modelo
- [ ] 1.4 Validação: `npm run lint && npm run build && npm run test:run`

## 2. E2E e verificação

- [ ] 2.1 `tests/e2e/athlete/share-workout-esteira.spec.ts` (CA5)
  verify: `npm run test:e2e` com o spec visitando o modelo
- [ ] 2.2 Verificação visual do PNG contra o artboard (fontes, corte)
- [ ] 2.3 Registrar a data do deploy em produção para o gate de 4 semanas
- [ ] 2.4 Gate (4 semanas após 2.3): SQL da coorte (`esteira = true`, fonte GARMIN, por atleta),
  pergunta única do founder a cada atleta, tabela atleta → sim/não/sem resposta e % final aqui.
  **Depende do founder**
