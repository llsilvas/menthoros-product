# Tasks — athlete-share-cards (núcleo)

## 0. Gates

- [x] 0.1 DoR: spec-reviewer (READY COM AJUSTES) + Codex (NOT READY na versão L); recorte em 4 changes, Q1/Q3/Q4 decididas, `design.md` escrito
- [x] 0.2 Nome do treinador: **não chega ao atleta**. `AthleteCoachPage` é placeholder (mensageria inexistente, `AthleteCoachPage.tsx:7-9`); nenhum DTO do backend expõe nome de treinador; `Atleta` não tem vínculo de treinador. "Treinado por" sai desta change → `athlete-share-data` (contrato) e `athlete-share-cards-extra` (UI). Nesta change a assinatura é só da assessoria; a chave "Mostrar treinador" não existe ainda.

## 1. Fundação

- [x] 1.1 Tipos: `etapasRealizadas: EtapaRealizadaDetalhe[]` e `tempoEmZonas` em `TreinoRealizadoDto`; cliente do trajeto trazido do `develop` (`a64306d`)
  verify: `tsc -b`
- [x] 1.2 Adapter puro `buildShareCardData` (+ `availableModels`, `garminAttributionFor`, `siglaDe`) com 13 testes. **Desvio do canvas:** o card Plano × realizado não mostra "N de M tiros no alvo" — as voltas do `.fit` não trazem tipo de etapa nem há faixa-alvo parseável por repetição; mostra o perfil planejado e distância/duração/pace realizados. Parciais = voltas (≥ 2 com pace)
  verify: `buildShareCardData.test.ts` cobre CA2, CA4, CA5 e sigla
- [x] 1.3 Hook `useShareWorkout(treinoId)`: `getMe` + `listarRecentes(30)` em paralelo; planejado procurado em todos os planos por `treinoRealizadoId` (404 = sem planejado); `loading`/`error`/`notFound`
  verify: `useShareWorkout.test.ts` (5)
- [x] 1.4 Rota `/athlete/share/:treinoId` (`athleteShareWorkoutRoute`) e `AthleteShareWorkoutPage` com skeleton, erro com "Tentar de novo" e "Treino não encontrado" (CA8); conteúdo provisório até a seção 2
  verify: `AthleteShareWorkoutPage.test.tsx` com `createHashRouter` (4)
- [x] 1.5 Validação: lint e build verdes; `test:run` 296 arquivos / 2912 testes, 0 erros (a 1ª rodada teve 6 erros não tratados do meu teste da página — atribuir `location.hash` fazia routers antigos navegarem; corrigido com `history.replaceState` + `router.dispose()`)

## 2. Componentes compartilhados

- [x] 2.1 Barlow Condensed (ital 700/800) no `index.html` + `font.displayShare` em `theme.premium.ts`
- [x] 2.2 `ShareCardFrame` (fundo navy + brilho lime por `alpha(primary[500])`, marca, rodapé, `role="img"` com `aria-label`) e `GarminAttribution`. **Ajuste do D5:** cards autorados em 360 px (alturas 640/450/360) e exportados com `pixelRatio: 3` → 1080 px; uma árvore só serve de prévia e de fonte da imagem, sem nó oculto duplicado. Sem `backdrop-filter` e sem grão já na moldura, então não há "modo de exportação"
- [x] 2.3 `ShareSignature` (sigla + nome; sem "Treinado por", ver 0.2)
- [x] 2.4 Controles `ShareModelPicker`/`ShareFormatPicker` (radiogroup, alvos ≥ 44 px) e `ShareOptionSwitch` (switch com rótulo); `ShareWorkoutView` com estado de modelo, formato (default por modelo), FC e assessoria
- [x] 2.5 `shareComponents.test.tsx` (10): CA3, CA4, CA5, CA9
- [x] 2.6 Validação: lint e build verdes; `test:run` 297 arquivos / 2921 testes, 0 erros

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
