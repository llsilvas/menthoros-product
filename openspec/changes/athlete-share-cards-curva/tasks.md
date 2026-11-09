# Tasks — athlete-share-cards-curva

## 0. Gates

- [ ] 0.1 Gate de adoção de `athlete-share-cards-esteira` aprovado
- [ ] 0.2 `add-activity-time-series` mergeada e em produção
- [ ] 0.3 DoR: pre-mortem Codex e critérios testáveis (Fast track, em `/implement init`)

## 1. Dados

- [ ] 1.1 Tipos: `temSerie?` em `TreinoRealizadoDto`; `TimeSeries` (`v, n, baldeSeg, duracaoSeg,
  tSeg, velMs, fc`); `buscarSerie` no serviço curado
  verify: `npm run build`
- [ ] 1.2 Adapter puro `adapters/buildPaceHrCurve.ts`: pace de `velMs` (≥ 0,5 m/s), escala por
  percentis 5–95, mais rápido no alto, caminhos SVG com buraco em `null`, resumo para o `aria-label`
  verify: testes de CA2 e CA3
- [ ] 1.3 `buildShareCardData` com `serie?`: modelo `curva` na ordem do escopo; `useShareWorkout`
  busca a série quando `temSerie`, falha → `null`
  verify: testes de disponibilidade e de CA5

## 2. Card

- [ ] 2.1 `PaceHrCurveCard` (v2 J) com tokens do tema; `ShareModel`, formato padrão story, rótulo "Curva"
  verify: testes de componente de CA1 e CA4
- [ ] 2.2 `ShareWorkoutView`: render; "Mostrar FC" entra na versão da imagem para `curva`
  verify: alternar FC regenera a imagem
- [ ] 2.3 Validação: `npm run lint && npm run build && npm run test:run`

## 3. E2E e verificação

- [ ] 3.1 `tests/e2e/athlete/share-workout-curva.spec.ts` (CA6)
- [ ] 3.2 Verificação visual do PNG contra o artboard
