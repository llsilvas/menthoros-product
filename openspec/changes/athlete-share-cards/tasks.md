# Tasks — athlete-share-cards (núcleo)

## 0. Gates

- [x] 0.1 DoR: spec-reviewer (READY COM AJUSTES) + Codex (NOT READY na versão L); recorte em 4 changes, Q1/Q3/Q4 decididas, `design.md` escrito
- [ ] 0.2 Confirmar a fonte do nome do treinador para o atleta (`AthleteCoachPage`); se não houver no contrato atual, registrar no `proposal.md` que "Treinado por" vai para `extra`
  verify: nota no proposal com `arquivo:linha` da fonte, ou a decisão de adiar

## 1. Fundação

- [ ] 1.1 Tipos: `etapasRealizadas` e `tempoEmZonas` em `TreinoRealizadoDto`; trazer `GpsTrace`/`temTrajeto`/`getTrajeto` (já preparados em `develop` sem commit) para a branch
  verify: `tsc -b`
- [ ] 1.2 Adapter puro `buildShareCardData` (+ `availableModels`, `garminAttributionFor`, sigla) com testes
  verify: `*.test.ts` cobre CA2, CA4, CA5 e sigla
- [ ] 1.3 Hook `useShareWorkout(treinoId)`: lista recente + plano da semana + usuário; `loading`/`error`/`notFound`
  verify: teste do hook com service mockado
- [ ] 1.4 Rota `ATHLETE_SHARE_WORKOUT` e `AthleteShareWorkoutPage` com estados (CA8)
  verify: teste com `createHashRouter` (não `MemoryRouter`)
- [ ] 1.5 Validação: `npm run lint && npm run build && npm run test:run`

## 2. Componentes compartilhados

- [ ] 2.1 Barlow Condensed no `index.html` + token `displayShare`
- [ ] 2.2 `ShareCardFrame` (fundo, brilho lime, vidro por tokens, tamanhos 9:16/4:5/1:1, `data-export`) e `GarminAttribution`
- [ ] 2.3 `ShareSignature` (sigla, nome, "Treinado por" condicional, modos)
- [ ] 2.4 Controles: `ShareModelPicker` (radiogroup), `ShareFormatPicker`, `ShareOptionSwitch`; alvos ≥ 44 px (CA9)
- [ ] 2.5 Testes de componente: CA3, CA4, CA9
- [ ] 2.6 Validação: `npm run lint && npm run build && npm run test:run`

## 3. Modelos

- [ ] 3.1 `PlanVsActualCard`
- [ ] 3.2 `SplitsCard`
- [ ] 3.3 `WeekCard` (atribuição agregada, CA5)
- [ ] 3.4 Testes por modelo com fixtures reais; nenhum `MOCK_*`
- [ ] 3.5 Validação: `npm run lint && npm run build && npm run test:run`

## 4. Exportação e destinos

- [ ] 4.1 Adicionar `html-to-image`; `useShareImage`: nó oculto em 1080 px, `document.fonts.ready`, blob pré-gerado, regeração ao mudar opção
- [ ] 4.2 Destinos Compartilhar (canShare/share, AbortError silencioso, erro com mensagem) e Salvar (download) — CA6, CA7
- [ ] 4.3 Testes de componente dos destinos com `navigator.share` mockado
- [ ] 4.4 Validação: `npm run lint && npm run build && npm run test:run`

## 5. Entradas e E2E

- [ ] 5.1 Botão "Compartilhar" no `WorkoutDetailDrawer` (dia com realizado) e no `TodayCompletedCard`
- [ ] 5.2 E2E Playwright: realizado de hoje → Compartilhar → trocar modelo/formato → alternar assinatura → Salvar baixa PNG com as dimensões do formato; treino manual sem atribuição Garmin
- [ ] 5.3 Verificação manual em iOS Safari, Android Chrome e desktop (PNG real, fontes, share sheet); registrar resultado aqui
- [ ] 5.4 Validação: `npm run lint && npm run build && npm run test:run && npm run test:e2e`
