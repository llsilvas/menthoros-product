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
- [x] 1.5 Suite completa: `./mvnw clean verify` — 6475 testes, 1 falha fora da change
      (`GarminClientImplTest.erro400SemSegredos`, 404 em vez de 400 após 10 s; isolado passa
      45/45, flaky de rede). CA4: nenhum teste dos leitores de `duracaoMin` alterado. Uma primeira
      rodada quebrou com `NoClassDefFoundError` por `./mvnw test` concorrente no mesmo `target/`
      — erro de operação, não da change.

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

- [x] 3.1 `types/PlanoReview.ts`: `duracaoSeg?: number` em `EtapaInputPayload` e `EtapaTreinoDto`
      (e em `TreinoPlanejado.EtapaTreino`, que o perfil lê). Grep de `duracaoMin: '` em fixtures:
      24 arquivos, mas quase todos são o ISO do treino; só `etapaItem.test.ts` (7) e `input.test.ts`
      (7) montavam `StepRow` — trocados para `duracao: 'm:00'`. verify: `npm run build` ok.
- [x] 3.2 `etapaItem.ts`: `StepRow.duracao` em `m:ss` (+ `duracaoAuto`); `parseDuracao` (`m`,
      `m:ss`, `h:mm:ss`), `normalizarDuracao`, `formatarDuracao`; serialização envia `duracaoSeg` e
      `duracaoMin` derivado e **omite medida marcada `*Auto`**; hidratação `duracaoSeg ??
      duracaoMin×60` e recálculo do campo vazio como derivado; `totaisDeItens` em segundos;
      `VOCABULARIO_EDITOR.assinatura` inclui `duracaoSeg`. Testes CA5, CA8, derivado fora do payload
      e 4:10 ≠ 4:20 na inferência de série. verify: `npx vitest run src/features/coach/components/etapas/etapaItem.test.ts`.
- [x] 3.3 `recalcularMedidas(antes, depois, campoEditado)` substitui `recalcularDistancia` com a
      tabela D5; testes CA6 e CA7 (duração derivada, distância derivada, pace com um derivado, pace
      sem derivado, digitar duração sobre distância digitada não muda a distância, pace incompleto).
      verify: vitest do arquivo.
- [x] 3.4 `EtapasEditor`/`BlocoCard`: campo "Duração" texto `m:ss` com normalização no blur;
      inválido mostra erro e **bloqueia o salvar** nos dois dialogs; campo derivado com indicação
      visual ("calculado de pace × duração"); digitar distância ou duração chama o recálculo com o
      campo editado. Ajustar `workout/profile/input.ts` (`fromEtapaTreino`, `fromEtapaTreinoDto`,
      `minutosDe` → segundos), `selectWorkoutProfile.ts:249` e os totais dos dialogs
      (`formatDuration`). verify: lint + build + testes do editor e do perfil.
      **Feito** (commit `d49c9e1`): rótulo "Duração (m:ss)"; `itensInvalidos` desabilita o salvar nos
      dois dialogs; totais em segundos exibidos por `formatDuration` (65 min vira `1h05`);
      `resumoSerie` do card lê `m:ss`. 2833 testes verdes.
- [x] 3.5 E2E `tests/e2e/coach/plano-zonas-editor.spec.ts`: `1` km + Z5 preenche a duração e o
      PATCH leva `distanciaKm: 1` sem duração (derivada fora do payload); digitar `4:10` leva
      `duracaoSeg: 250` e `duracaoMin: 4`; `0:10` leva `duracaoSeg: 10` sem `duracaoMin`; etapa
      carregada com `duracaoSeg` abre em `4:10`.
      verify: `npx playwright test plano-zonas-editor plan-review-edicao` — 12 verdes (commit `f7684f1`:
      três specs novos: m:ss/0:10/reabre em 4:10; inválido bloqueia; distância + Z5 deriva 4:38 e fica
      fora do PATCH). `plan-review-edicao` só trocou o rótulo.
- [~] 3.6 Suite completa do front: lint, build, 2833 unit e 155 E2E verdes. `/qa` (2026-11-06):
      frontend-reviewer e clean-code-reviewer sem Critical; Important corrigidos no commit de QA —
      `toEditorTreino` descartava `duracaoSeg` (PlanosDialog reabria 4:10 como 4:00 e regravava
      240 s), `0:00` passa a inválido, cabeçalho da série em `m:ss` quando há segundos
      (`duracaoLegivel`, compartilhada com o card). Codex REQUEST_CHANGES com 2 Important: o do
      `toEditorTreino` converge com o frontend-reviewer; o outro era real — texto inválido na duração
      ("4:") contava como derivável e mudar distância/pace o sobrescrevia, levantando o bloqueio.
      Corrigido: derivável é só vazio ou já derivado. Minor convergente (totais arredondavam para o
      minuto): dialogs passam a `duracaoLegivel`. → `/pr` (front).

## 4. Fechamento

- [ ] 4.1 Spec `coach-workout-step-editing` promovida a `openspec/specs/`; tasks marcadas; `/done`.
