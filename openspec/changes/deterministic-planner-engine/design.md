# Design — deterministic-planner-engine

## Contexto

Hoje a periodizacao, progressao de carga e prevencao de lesoes estao implicitas no prompt do LLM (GPT-4o via `IaServiceImpl`). Esta change externaliza essas decisoes para um servico deterministico puro (`PlannerEngine`), que produz um `WeekPlanSkeleton` consumido como contrato rigido pelo LLM Prompt Builder.

Referencias (estado atual):
- `services/impl/IaServiceImpl.java` — prompt builder, chamada ao LLM, structured output
- `services/impl/PlanoServiceImpl.java` — orquestrador da geracao de plano, monta `DadosPlanoDto`
- `dto/input/DadosPlanoDto.java` — record com `atleta`, `dataInicio`, `planoAnterior`, `ultimosTreinos`, `metaDados`
- `services/TsbService.java` — calculadora de TSS/CTL/ATL/TSB (ja existe, reusada pelo motor)

## Decisao 1 — PlannerEngine como servico de dominio puro

```
@Service
public class PlannerEngine {
    private final PeriodizationPlanner periodizationPlanner;
    private final LoadTargetResolver loadTargetResolver;
    private final TaperStrategy taperStrategy;
    private final InjuryRiskEvaluator injuryRiskEvaluator;
    private final ConstraintValidator constraintValidator;

    public WeekPlanSkeleton planWeek(DadosPlanoDto dados, DecisaoProgressao decisaoProgressao, Optional<OnboardingContext> ctx) { ... }
}
```

Sem I/O de rede, sem chamada a LLM — testavel com JUnit puro.

## Decisao 2 — OnboardingContext como objeto separado (composicao)

`DadosPlanoDto` permanece intocado. O `OnboardingContext` e enriquecimento opcional. Atletas legados (pre-ONBOARD) continuam elegiveis ao planner em modo `LEGACY_CONTEXT`, usando `DadosPlanoDto`, `DecisaoProgressao`, `Atleta`, `PlanoMetaDados` e provas atuais. Se faltar dado essencial, a feature flag permite fallback para o pipeline antigo sem bloquear a geracao.

```
public record OnboardingContext(
    AthleteBaseline baseline,
    double confidenceScore,
    PlanningPolicy planningPolicy,
    AthleteConstraints constraints
) {}
```

## Decisao 3 — SkeletonComplianceChecker pos-LLM

O LLM recebe o `WeekPlanSkeleton` como contrato no prompt, mas nao ha garantia de que o JSON gerado respeita o contrato. O `SkeletonComplianceChecker` valida estrutura e contexto dinamico, nao apenas soma:
- `phase` da semana gerada == `skeleton.phase()`;
- `sessionCount` gerado == `skeleton.sessionCount()`;
- TSS total dentro de +-10% do `skeleton.loadTarget().targetTss()`;
- todos os treinos em dias permitidos pelo atleta;
- longao dentro do teto de duracao/distancia do skeleton;
- numero de sessoes intensas <= teto do skeleton;
- nenhuma sessao pesada nas 48-72h antes de prova na semana;
- taper/race-week respeitados;
- constraints duras (`lesaoAtiva`, equipamento, disponibilidade) nao violadas.

O checker deve reutilizar o padrao do `PlanQualityChecker`: retornar violacoes tipadas (`ViolacaoQualidade` ou tipo equivalente), alimentar metricas Micrometer e integrar com `PlanoResilienceService` para retry com feedback estruturado. Evitar um segundo mecanismo de resiliencia.

## Decisao 4 — Feature flag planner-engine.enabled

Propriedade `planner-engine.enabled` (default `false`). Quando `true`:
1. `PlanoServiceImpl` chama `PlannerEngine.planWeek()` antes do LLM
2. `WeekPlanSkeleton` e injetado no prompt
3. Pos-geracao, `SkeletonComplianceChecker` valida

Quando `false`: pipeline atual inalterado, zero codigo novo executado.

## Decisao 5 — Motor consome executado, nao planejado

`LoadProgressionCalculator` e `InjuryRiskEvaluator` leem `TreinoRealizado` (executado), nao `TreinoPlanejado` (planejado). Se o atleta fez 280 TSS com plano de 400, a rampa da semana seguinte usa 280. Isso evita progressao sobre carga que nunca aconteceu.


## Decisao 6 — `ProgressaoTreinoService` e input, nao substituido

`progressao-treinos` ja esta mergeada. O `PlannerEngine` nao recalcula a direcao de progressao; ele consome `DecisaoProgressao` como input direcional e resolve o alvo final combinando fase, taper, risco e constraints.

Hierarquia P0:
1. constraints duras e lesao ativa;
2. risco fisiologico (`InjuryRiskEvaluator`);
3. prova na semana / taper / pos-prova;
4. `DecisaoProgressao`;
5. preferencias do atleta/coach.

Consequencia: `DecisaoProgressao.REDUZIR` nunca pode virar aumento porque a fase e BUILD/PEAK; `MANTER` nao usa automaticamente todo o teto fisiologico disponivel.

## Decisao 7 — Periodizacao reaproveita prova-alvo explicita e evento competitivo semanal

O codigo atual ja prioriza `Prova.isProvaAlvo()` em `PlanoServiceImpl.buscarProximaProva` e `PeriodizacaoPromptFormatter` ja trata evento competitivo dentro da semana. O `PeriodizationPlanner` deve extrair essa logica para dominio deterministico:
- prova marcada como alvo vence sobre heuristicas de proximidade/distancia;
- prova preparatoria dentro da semana vira constraint estrutural (mini-taper, substitui treino-chave se houver conflito);
- semana imediatamente apos prova deve produzir `POST_RACE`/recuperacao, nao voltar direto para BUILD.

## Decisao 8 — Historico insuficiente nao bloqueia geracao

`ProgressaoTreinoService` ja retorna `MANTER` com motivo "historico insuficiente". O planner deve respeitar esse comportamento: com pouco historico, gerar skeleton conservador ou cair no pipeline antigo por feature flag. Nao usar `DadosInsuficientesException` como comportamento padrao para atletas legados.


## Decisao 9 — Auditoria minima persistida no plano semanal

A metrica de sucesso depende de saber quais planos foram gerados com planner, em qual versao/fase e com qual resultado de compliance. Como `PlanoMetaDados` e por-atleta e mutavel, a auditoria deve ser snapshot por plano em `tb_plano_semanal`.

Migration adiciona colunas nullable:

```sql
ALTER TABLE tb_plano_semanal
  ADD COLUMN planner_enabled BOOLEAN,
  ADD COLUMN planner_version VARCHAR(20),
  ADD COLUMN planner_phase VARCHAR(30),
  ADD COLUMN planner_requires_coach_review BOOLEAN,
  ADD COLUMN planner_skeleton_hash VARCHAR(64),
  ADD COLUMN planner_compliance_status VARCHAR(30),
  ADD COLUMN planner_metadata_json JSONB;
```

`planner_metadata_json` guarda resumo compacto do skeleton (load target, constraints aplicadas, motivos de review) sem armazenar prompt completo nem dados sensiveis desnecessarios. `planner_skeleton_hash` permite correlacionar logs sem payload grande.

## Decisao 10 — Batch generation: falha isolada por atleta

`coach-batch-plan-generation` ja processa cada atleta isoladamente em virtual threads e registra erro individual no `BatchPlanJob`. O planner deve seguir esse contrato:
- violacao irrecuperavel de skeleton apos retry vira erro individual do atleta;
- nao aborta o lote;
- motivo retornado ao job deve ser sanitizado (ex.: "Plano violou restricoes de seguranca"), com detalhe tecnico apenas no log estruturado;
- metricas do planner devem incluir contexto `batch=true/false`.

## Decisao 11 — Observabilidade e rollback operacional

Feature flags:
- `planner-engine.enabled=false` default;
- `planner-engine.fail-open=true` default inicial: se o planner falhar antes do LLM, cai no pipeline legado e incrementa `planner.fallback_legacy.count`;
- compliance failure apos LLM usa retry; se ainda falhar e `fail-open=true`, fallback legado e auditoria `compliance_status=FALLBACK`; se `fail-open=false`, erro de dominio.

Metricas:
- `planner.generated.count{phase,plannerVersion,batch}`;
- `planner.requires_coach_review.count{reason,phase}`;
- `planner.compliance.failure.count{reason,phase}`;
- `planner.fallback_legacy.count{reason}`;
- `planner.retry.count{reason}`.

Logs estruturados sempre incluem `atletaId`, `tenantId`, `plannerVersion`, `phase`, `skeletonHash`, `batchJobId` quando existir.


## Decisao 12 — Shadow mode antes de enforcement

Adicionar `planner-engine.shadow` (default `false`). Quando `shadow=true` e `enabled=false`, o sistema calcula `WeekPlanSkeleton`, compliance hipotetico e metricas, mas nao injeta o skeleton no prompt, nao altera o plano gerado e nao bloqueia persistencia. Serve para calibrar:
- distribuicao de `TrainingPhase`;
- frequencia de `requiresCoachReview`;
- taxa de planos legados que violariam skeleton;
- razoes de fallback por atleta/tenant.

Shadow mode deve persistir apenas logs/metricas e, se seguro, metadata diagnostica sem afetar a experiencia do coach/atleta. Nao deve chamar o LLM duas vezes.

## Decisao 13 — Escopo v1 running-first

Embora o produto possa receber atividades de cycling/swimming/triathlon via .fit, o planner v1 e running-first. Para atletas/marcadores multisport:
- TSS agregado segue como guardrail conservador de fadiga geral;
- nao calcular CTL/ATL separado por esporte nesta change;
- nao prometer distribuicao de sessoes por modalidade;
- metadata deve registrar `plannerScope=RUNNING_FIRST` quando modalidade nao-running for detectada.

Triathlon/Ironman completo requer change futura com carga por esporte, constraints de equipamento e conflito entre sessoes de modalidades diferentes.

## Decisao 14 — Lesao ativa, lesao recente e retorno gradual

Usar campos atuais de `Atleta`:
- `temLesao=true` -> `RECOVERY` + `requiresCoachReview=true`;
- `temLesao=false` e `dataUltimaLesao` dentro de janela configuravel (default 30 dias) -> `RETURN_TO_TRAINING` com teto reduzido;
- `descricaoLesao` preenchida sem flag/data -> nao interpretar via NLP; sinalizar `requiresCoachReview=true` com motivo `INJURY_DESCRIPTION_UNSTRUCTURED`;
- sem dados de lesao -> fluxo normal.

Valores default devem ficar em propriedades (`planner-engine.injury.recent-window-days=30`) para ajuste sem redeploy quando houver feedback de design partners.

## Decisao 15 — Compliance final roda apos redistribuicao

`PlanoServiceImpl` pode redistribuir treinos apos o LLM (`obterTreinosParaPlano`, `redistribuicaoHelper`, `inferirDiaPrioritarioLongo`). O compliance relevante e o do plano efetivamente persistivel. Fluxo final:

1. LLM gera `PlanoSemanalLlmDto`.
2. Validacao/retry estrutural inicial contra skeleton.
3. Redistribuicao conforme modo de geracao e dias do atleta.
4. Compliance final sobre treinos redistribuidos.
5. Persistencia + auditoria.

Se a redistribuicao corrigir uma violacao, o compliance final passa. Se criar violacao (ex.: mover treino intenso para vespera de prova), falha/retry/fallback conforme flags.

## Fora de escopo

- Recalibracao automatica apos `WeekSuggestion.REJECTED` (v2)
- Migracao de atletas existentes (coberta pelo `athlete-onboarding-baseline`)
- UI de configuracao de regras para o treinador
- Suporte a multiplas metodologias de periodizacao (Lydiard, Daniels)
