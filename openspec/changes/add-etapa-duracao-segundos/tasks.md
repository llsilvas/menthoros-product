# Tasks — add-etapa-duracao-segundos

Depende de `coach-etapa-calculos-auxiliares` — mergeada (front #197) e arquivada em 2026-11-05.
Backend primeiro (deploy antes do front: ver risco de compatibilidade no `design.md`). Validação por
bloco: backend `./mvnw clean verify`; front `npm run lint && npm run build && npm run test:run`; E2E
onde indicado.

Branches `feat/add-etapa-duracao-segundos` nos dois repos, criadas em 2026-11-05 no `/implement init`:
- backend: worktree `.worktrees/backend-add-etapa-duracao-segundos`, base `e451e58`;
- front: worktree `.worktrees/front-add-etapa-duracao-segundos`, base `9b45273`.
Ordem: bloco 1 → 2 → PR backend; bloco 3 só depois do backend em `develop`; 4 depois dos dois merges.

## 1. Backend — contrato e persistência (`apps/menthoros-backend`)

- [x] 1.1 Migration `V112__add_duracao_seg_etapa_treino.sql` (V111 é a última em `develop`; conferir
      antes do merge que nenhuma outra branch tomou a V112): `ADD COLUMN IF NOT EXISTS duracao_seg
      INTEGER NULL`, com rollback no comentário. `EtapaTreino.duracaoSeg`. verify: `./mvnw flyway:info`
      local + contexto sobe.
- [x] 1.2 `EtapaInputDto.duracaoSeg` (`@Positive`) e `EtapaTreinoDto.duracaoSeg`; `TreinoMapper`.
      **Feito:** o campo entrou por último nos dois records, e as assinaturas antigas (9 e 10 args
      no input; 10 e 11 no output) viraram construtores secundários — nenhum dos 50 chamadores
      mudou. `safeGetEtapas` passa o segundo. Teste de compatibilidade em
      `CoachTreinoControllerTest.ignoraPropriedadeDesconhecida` (200 com campo extra).
      verify: `./mvnw clean test -Dtest=*Mapper*,*EtapaInput*,*TreinoPlanejadoController*`.
- [x] 1.3 `TreinoPlanejadoServiceImpl.buildEtapaSimples`: deriva `duracaoMin = round(seg/60)` sem
      piso quando `duracaoSeg` presente; sem ele, comportamento atual. `comRepeticoes` transporta
      `duracaoSeg`. Testes CA1 e CA2 (incoerente; `duracaoSeg: 10` grava `duracaoMin = 0`; etapa
      criada via `construirEtapasParaAdicao`; sub-etapa de bloco expandido mantém o segundo). verify: `./mvnw clean test -Dtest=TreinoPlanejadoServiceImplTest`.
- [x] 1.4 **Confirmado:** não há caminho entidade → `EtapaTreinoLlmDto` → entidade (os quatro
      usos fora da pipeline de geração — `PlanQualityChecker`, `Passo`, `NormalizacaoDeTreino`,
      `SessionResolver` — montam o DTO de entradas próprias). O campo não entrou no DTO; teste
      `LlmJsonSchemaBuilderTest.etapaSemDuracaoSeg` prende a ausência no schema.
      Confirmar que não há caminho entidade → `EtapaTreinoLlmDto` → entidade que perderia o
      segundo; se houver, excluir `duracaoSeg` explicitamente do schema em `LlmJsonSchemaBuilder`.
      Teste que afirma a ausência do campo no schema gerado. verify: `./mvnw clean test -Dtest=LlmJsonSchemaBuilderTest`.
- [ ] 1.5 Suite completa: `./mvnw clean verify` — CA4 (nenhum teste dos leitores de `duracaoMin`
      alterado).

## 2. Backend — intervals.icu

- [x] 2.1 `IntervalsIcuWorkoutConverter`: duração do step de etapa usa `duracaoSeg ?? duracaoMin×60`;
      comparação de etapas iguais inclui `duracaoSeg`. Testes CA3 (segundos; só minutos; dois tiros
      4:10 e 4:40 não viram a mesma etapa). verify: `./mvnw clean test -Dtest=IntervalsIcuWorkoutConverterTest`.
- [~] 2.2 `/qa` backend (2026-11-05): code-reviewer, security-reviewer e clean-code-reviewer sem
      Critical; DeepSeek no lugar do Codex (sem cota). Convergência corrigida no commit de QA:
      derivação do minuto movida para `EtapaMapper.derivarDuracaoMin` (`@AfterMapping`, ponto único
      de todo `toEntity`, arredondamento inteiro `(seg + 30) / 60`), `CoachAthleteProfileServiceImpl.
      safeGetEtapasResumo` passa o segundo, `@Max(86400)` em `duracaoSeg`, casos 10/29/30/89/90 s
      e 400 para `duracaoSeg` inválido. Rebatido: o achado do DeepSeek de que o bloco expandido
      pularia a derivação era falso (`expandirBloco` chama `buildEtapaSimples`), mas o mapper
      resolve de qualquer modo. Mantidos: `duracaoMin` sem `@Max` (pré-existente); sem `CHECK` no
      banco (validação no DTO). → `/pr add-etapa-duracao-segundos` (backend). Deploy em develop
      antes do front.

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
- [ ] 3.5 E2E `tests/e2e/coach/plano-zonas-editor.spec.ts`: `1` km + Z5 preenche a duração e o
      PATCH leva `distanciaKm: 1` sem duração (derivada fora do payload); digitar `4:10` leva
      `duracaoSeg: 250` e `duracaoMin: 4`; `0:10` leva `duracaoSeg: 10` sem `duracaoMin`; etapa
      carregada com `duracaoSeg` abre em `4:10`.
      verify: `npx playwright test plano-zonas-editor plan-review-edicao`.
- [ ] 3.6 Suite completa do front + `/qa` → `/pr add-etapa-duracao-segundos` (front).

## 4. Fechamento

- [ ] 4.1 Spec `coach-workout-step-editing` promovida a `openspec/specs/`; tasks marcadas; `/done`.
