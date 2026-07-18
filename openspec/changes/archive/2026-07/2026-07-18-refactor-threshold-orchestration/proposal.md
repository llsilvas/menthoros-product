# Proposal: refactor-threshold-orchestration

**Tamanho:** S · **Trilha:** Fast (backend-only, um repo, sem contrato de API/DB, sem mudança de
comportamento observável — refactor interno)

## Why

`TsbServiceImpl` é débito conhecido: `apps/menthoros-backend/CLAUDE.md` já o lista como classe que
"não deve crescer" no teto de ~640 linhas — hoje está em 748. O crescimento veio da change
`infer-threshold-from-race-result` (arquivada em `2026-07/2026-07-17-infer-threshold-from-race-result`),
que embutiu a orquestração de inferência de limiar (staleness → busca de treinos/provas →
precedência prova-vs-quintil → mutação de `PlanoMetaDados` → log de outlier) dentro de métodos
**privados** de `TsbServiceImpl`.

Duas consequências concretas, achadas numa revisão de arquitetura (`/improve-codebase-architecture`)
sobre o cluster de limiar/TSB:

1. **Sem seam público:** `TsbServiceImplAtualizarLimiaresTest` (9 cenários) só alcança
   `atualizarLimiareInferidos` via `Method.setAccessible(true)` + reflection — sinal direto de que
   essa lógica não tem onde morar como colaborador testável.
2. **Predicado de staleness duplicado 3x:** a mesma expressão
   (`ChronoUnit.DAYS.between(...) > DIAS_LIMIAR_DESATUALIZACAO`) está reimplementada em
   `TsbServiceImpl`, `CoachAthleteProfileServiceImpl.resolverLimiareisInferidos` e
   `ThresholdConstraintFormatter` — com uma variação de semântica de null não intencional entre elas
   (só `ThresholdConstraintFormatter` faz guard de `atleta == null`).

`ThresholdInferenceService` (o motor de cálculo puro — Riegel, quintil, filtro de distância de prova)
já é bem testado e dependency-free; o problema não é ele, é a orquestração ao redor.

**Métrica de sucesso:** não há métrica de rotina do treinador aqui — é um refactor sem mudança de
comportamento observável. A métrica é estrutural: `TsbServiceImpl` sai de 748 para ~650 linhas
(volta a respeitar o teto do CLAUDE.md) e os 9 cenários de limiar passam a rodar sem reflection.

## What Changes

- **Novo colaborador `AthleteThresholdUpdater`** (`services/helper/`), injeta
  `TreinoRealizadoRepository`, `ProvaRepository`, `ThresholdInferenceService`. Um método público —
  `atualizarLimiares(Atleta, PlanoMetaDados, LocalDate)` — absorve os atuais métodos privados
  `atualizarLimiareInferidos` + `atualizarPaceLimiarInferido` + `logSinalizacaoOutlierPace` de
  `TsbServiceImpl` (staleness, busca de treinos/provas dos últimos 30 dias, precedência
  prova-vs-quintil, mutação em memória de `PlanoMetaDados`, log de outlier) e a constante
  `LIMIAR_OUTLIER_SEC_KM`. Mesma semântica de hoje: **side effects: NONE** (só muta `metaDados` em
  memória; quem persiste continua sendo o `save()` já existente em
  `TsbServiceImpl.atualizarMetaDados`).
- **`TsbServiceImpl`** perde `ProvaRepository` do construtor (única leitora era o bloco extraído) e
  passa a chamar `athleteThresholdUpdater.atualizarLimiares(...)` em vez do método privado. `TsbService`
  (interface pública) não muda — o método extraído já era privado.
- **`ThresholdInferenceService`** ganha dois métodos novos, puros (continua 0-dep):
  `isFcLimiarDesatualizado(Atleta, LocalDate)` e `isPaceLimiarDesatualizado(Atleta, LocalDate)`, com
  guard defensivo (`atleta == null → false`) — unifica a semântica mais estrita já existente em
  `ThresholdConstraintFormatter`.
- **`CoachAthleteProfileServiceImpl.resolverLimiareisInferidos`** e **`ThresholdConstraintFormatter`**
  trocam a expressão inline duplicada pelos dois métodos novos de `ThresholdInferenceService`.
- **Testes:** `TsbServiceImplAtualizarLimiaresTest.java` (reflection) é deletado; os 9 cenários
  (staleness FC/pace, precedência prova-vs-quintil, CA5 — não sobrescrever limiar oficial do atleta,
  outlier WARN/INFO) são portados para `AthleteThresholdUpdaterTest`, chamando o método público
  direto. `ThresholdInferenceServiceTest` ganha cobertura dos dois métodos de staleness novos
  (incluindo `atleta == null`).

**Fora de escopo:** a divergência já documentada em `CoachAthleteProfileServiceImpl` (lê
`fonteLimiarPace` persistido sem recomputar a fonte atual — comentário `design.md D6` da change
original) é um risco pré-existente, não tratado aqui.

## Capabilities

### Modified Capabilities

- `threshold-inference-from-race`: nenhum requisito/cenário muda — reorganização interna da
  implementação (localização do código, não do comportamento). Nenhum arquivo em
  `openspec/specs/` precisa de delta.

## Impact

**Entidades e banco:** nenhuma alteração de schema.

**APIs:** nenhuma alteração de endpoint ou contrato.

**Backend — arquivos tocados:**
- Novo: `services/helper/AthleteThresholdUpdater.java`, `test/.../AthleteThresholdUpdaterTest.java`.
- Modificados: `services/impl/TsbServiceImpl.java` (remove ~94 linhas + `ProvaRepository`),
  `services/helper/ThresholdInferenceService.java` (+2 métodos),
  `services/impl/CoachAthleteProfileServiceImpl.java`, `services/prompt/ThresholdConstraintFormatter.java`.
- Removido: `test/.../TsbServiceImplAtualizarLimiaresTest.java`.

**Blast radius:** só o caminho `TsbServiceImpl.atualizarMetaDados` (chamado por
`TsbServiceImpl.atualizarTsbDia`/`recalcularHistoricoCompleto`) e os dois consumidores de leitura de
staleness. Nenhum outro `*ServiceImpl` referencia os métodos privados extraídos.

**Risco principal:** regressão de comportamento por erro de porte dos 9 cenários de teste — mitigado
por serem os mesmos asserts, só trocando a forma de invocação (reflection → chamada direta), e por
`./mvnw clean test` verde como gate final.

## Critérios de Aceite

**CA1 — Comportamento idêntico ao atual:**
- Given: os mesmos 9 cenários hoje cobertos por `TsbServiceImplAtualizarLimiaresTest`
- When: portados para `AthleteThresholdUpdaterTest` chamando `atualizarLimiares(...)` diretamente
- Then: os mesmos asserts passam sem alteração de expectativa (staleness, precedência prova-vs-quintil,
  CA5 do change original, outlier WARN/INFO)

**CA2 — `TsbServiceImpl` sem reflection e sem `ProvaRepository`:**
- Given: o construtor de `TsbServiceImpl`
- When: o refactor é aplicado
- Then: `ProvaRepository` não é mais injetado; nenhum teste de `TsbServiceImpl` usa
  `Method.setAccessible`

**CA3 — Staleness sem duplicação:**
- Given: `CoachAthleteProfileServiceImpl.resolverLimiareisInferidos` e `ThresholdConstraintFormatter`
- When: o refactor é aplicado
- Then: ambos chamam `ThresholdInferenceService.isFcLimiarDesatualizado`/`isPaceLimiarDesatualizado`
  em vez de reimplementar a expressão `ChronoUnit.DAYS.between(...)`

**CA4 — Persistência inalterada:**
- Given: `TsbServiceImpl.atualizarMetaDados`
- When: chama `athleteThresholdUpdater.atualizarLimiares(...)`
- Then: continua havendo um único `planoMetaDadosRepository.save(metaDados)` no final do método —
  `AthleteThresholdUpdater` não persiste

**CA5 — Suite completa verde:**
- Given: o refactor completo
- When: `./mvnw clean test`
- Then: passa sem falhas, sem testes desabilitados/ignorados

## Open Questions & Assumptions

**Premissas:**
- O comportamento observável (valores calculados, condições de disparo, mensagens de log) não muda —
  é puramente uma realocação de código e unificação de uma expressão duplicada.
- `Atleta` continua sendo passado como entidade JPA para `ThresholdInferenceService` (não é um
  `skills.*`, então a regra de "skills não recebem entidade JPA" do CLAUDE.md não se aplica aqui —
  já é o padrão hoje, ex. `inferirPaceLimiarDeProva(Prova)`).

**Em aberto:** nenhum — todas as decisões de shape foram fechadas via `/grilling` antes desta proposta
(novo colaborador dedicado vs. expandir `ThresholdInferenceService`, forma do predicado de staleness,
responsabilidade de persistência, migração de testes, nome da classe).
