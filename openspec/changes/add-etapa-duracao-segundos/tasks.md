# Tasks — add-etapa-duracao-segundos

Depende de `coach-etapa-calculos-auxiliares` mergeada. Backend primeiro (deploy antes do front:
ver risco de compatibilidade no `design.md`). Validação por bloco: backend `./mvnw clean verify`;
front `npm run lint && npm run build && npm run test:run`; E2E onde indicado.

## 1. Backend — contrato e persistência (`apps/menthoros-backend`)

- [ ] 1.1 Migration `V11x__add_duracao_seg_etapa_treino.sql`: `ADD COLUMN IF NOT EXISTS duracao_seg
      INTEGER NULL`, com rollback no comentário. `EtapaTreino.duracaoSeg`. verify: `./mvnw flyway:info`
      local + contexto sobe.
- [ ] 1.2 `EtapaInputDto.duracaoSeg` (`@Positive`) e `EtapaTreinoDto.duracaoSeg`; `TreinoMapper`.
      Confirmar que o DTO tolera propriedade desconhecida (compatibilidade front novo × backend
      antigo) e registrar aqui o resultado. verify: `./mvnw clean test -Dtest=*Mapper*,*EtapaInput*`.
- [ ] 1.3 `TreinoPlanejadoServiceImpl.buildEtapaSimples`: deriva `duracaoMin = round(seg/60)` quando
      `duracaoSeg` presente; sem ele, comportamento atual. `comRepeticoes` transporta `duracaoSeg`.
      Testes CA1 e CA2 (incoerente; etapa criada via `construirEtapasParaAdicao`; sub-etapa de
      bloco expandido mantém o segundo). verify: `./mvnw clean test -Dtest=TreinoPlanejadoServiceImplTest`.
- [ ] 1.4 Confirmar que não há caminho entidade → `EtapaTreinoLlmDto` → entidade que perderia o
      segundo; se houver, excluir `duracaoSeg` explicitamente do schema em `LlmJsonSchemaBuilder`.
      Teste que afirma a ausência do campo no schema gerado. verify: `./mvnw clean test -Dtest=LlmJsonSchemaBuilderTest`.
- [ ] 1.5 Suite completa: `./mvnw clean verify` — CA4 (nenhum teste dos leitores de `duracaoMin`
      alterado).

## 2. Backend — intervals.icu

- [ ] 2.1 `IntervalsIcuWorkoutConverter`: duração do step de etapa usa `duracaoSeg ?? duracaoMin×60`;
      comparação de etapas iguais inclui `duracaoSeg`. Testes CA3 (segundos; só minutos; dois tiros
      4:10 e 4:40 não viram a mesma etapa). verify: `./mvnw clean test -Dtest=IntervalsIcuWorkoutConverterTest`.
- [ ] 2.2 `/qa` backend → `/pr add-etapa-duracao-segundos` (backend). Deploy em develop antes do front.

## 3. Frontend — contrato e editor (`apps/menthoros-front`)

- [ ] 3.1 `types/PlanoReview.ts`: `duracaoSeg?: number` em `EtapaInputPayload` e `EtapaTreinoDto`.
      Grep de `duracaoMin: '` em fixtures de teste e estimativa do ajuste; registrar aqui.
      verify: `npm run build`.
- [ ] 3.2 `etapaItem.ts`: `StepRow.duracao` em `m:ss` (+ `duracaoAuto`); `parseDuracao` (`m`,
      `m:ss`, `h:mm:ss`), `normalizarDuracao`, `formatarDuracao`; serialização envia `duracaoSeg` e
      `duracaoMin` derivado e **omite medida marcada `*Auto`**; hidratação `duracaoSeg ??
      duracaoMin×60` e recálculo do campo vazio como derivado; `totaisDeItens` em segundos;
      `VOCABULARIO_EDITOR.assinatura` inclui `duracaoSeg`. Testes CA5, CA8, derivado fora do payload
      e 4:10 ≠ 4:20 na inferência de série. verify: `npx vitest run src/features/coach/components/etapas/etapaItem.test.ts`.
- [ ] 3.3 `recalcularMedidas(antes, depois, campoEditado)` substitui `recalcularDistancia` com a
      tabela D5; testes CA6 e CA7 (duração derivada, distância derivada, pace com um derivado, pace
      sem derivado, digitar duração sobre distância digitada não muda a distância, pace incompleto).
      verify: vitest do arquivo.
- [ ] 3.4 `EtapasEditor`/`BlocoCard`: campo "Duração" texto `m:ss` com normalização no blur;
      inválido mostra erro e **bloqueia o salvar** nos dois dialogs; campo derivado com indicação
      visual ("calculado de pace × duração"); digitar distância ou duração chama o recálculo com o
      campo editado. Ajustar `workout/profile/input.ts` (`fromEtapaTreino`, `fromEtapaTreinoDto`,
      `minutosDe` → segundos), `selectWorkoutProfile.ts:249` e os totais dos dialogs
      (`formatDuration`). verify: lint + build + testes do editor e do perfil.
- [ ] 3.5 E2E `tests/e2e/coach/plano-zonas-editor.spec.ts`: `1` km + Z5 preenche a duração; digitar
      `4:10` leva `duracaoSeg: 250` no PATCH; etapa carregada com `duracaoSeg` abre em `4:10`.
      verify: `npx playwright test plano-zonas-editor plan-review-edicao`.
- [ ] 3.6 Suite completa do front + `/qa` → `/pr add-etapa-duracao-segundos` (front).

## 4. Fechamento

- [ ] 4.1 Spec `coach-workout-step-editing` promovida a `openspec/specs/`; tasks marcadas; `/done`.
