# Design — deterministic-planner-engine (parte 1/2: motor em shadow + nucleo de dominio)

## Contexto

Hoje a periodizacao, progressao de carga e prevencao de lesoes estao implicitas no prompt do LLM (GPT-4o via `IaServiceImpl`). Esta change externaliza essas decisoes para um servico deterministico puro (`PlannerEngine`) que produz um `WeekPlanSkeleton` — **nesta parte, calculado e auditado em shadow mode, sem alterar o pipeline**. O enforcement (skeleton no prompt + compliance com retry) e a parte 2, `planner-engine-enforcement`.

Referencias (estado atual):
- `services/impl/IaServiceImpl.java` — prompt builder, chamada ao LLM, structured output (NAO tocado por esta change)
- `services/impl/PlanoServiceImpl.java` — orquestrador da geracao; ponto de integracao do shadow
- `dto/input/DadosPlanoDto.java` — record com `atleta`, `dataInicio`, `planoAnterior`, `ultimosTreinos`, `metaDados`
- `services/TsbService.java` — calculadora de TSS/CTL/ATL/TSB (reusada pelo motor)

## Decisao 1 — PlannerEngine como servico de dominio puro em `domain/planner`

```
@Service  // registrado no Spring, mas puro: sem IO, sem JPA, sem LLM
public class PlannerEngine {
    private final PeriodizationPlanner periodizationPlanner;
    private final LoadTargetResolver loadTargetResolver;
    private final TaperStrategy taperStrategy;
    private final InjuryRiskEvaluator injuryRiskEvaluator;
    private final ConstraintValidator constraintValidator;

    public WeekPlanSkeleton planWeek(PlannerInputSnapshot snapshot) { ... }
}
```

Sem I/O de rede, sem chamada a LLM, sem `LocalDate.now()` — testavel com JUnit puro, golden-set-avel.

## Decisao 2 — OnboardingContext como objeto separado (composicao)

`DadosPlanoDto` permanece intocado. O `OnboardingContext` e enriquecimento opcional. Atletas legados (pre-onboarding) continuam elegiveis ao planner em modo `LEGACY_CONTEXT`, usando `DadosPlanoDto`, `DecisaoProgressao`, `Atleta`, `PlanoMetaDados` e provas atuais.

```
public record OnboardingContext(
    AthleteBaseline baseline,
    double confidenceScore,
    PlanningPolicy planningPolicy,
    AthleteConstraints constraints
) {}
```

**`AthleteBaseline` e `PlanningPolicy` — contrato minimo, reservado para `athlete-onboarding-baseline`.** Esse change-irmao declara dependencia hard nesta (`athlete-onboarding-baseline/proposal.md:3,52,55`). Como e ele quem vai popular esses dados (Confidence Scorer, Calibration Phase), esta change define so a forma minima que o planner le, seguindo o padrao de "skill input record minimo" do `CLAUDE.md` do backend:

```
public record AthleteBaseline(
    Double ctlEstimado,       // CTL inicial estimado no onboarding, quando disponivel
    LocalDate dataEstimativa
) {}

public record PlanningPolicy(
    ReviewMode reviewMode,             // EXCEPTION_ONLY / MANDATORY_NON_BLOCKING / MANDATORY_BLOCKING
    Double maxProgressionAllowed,
    boolean explanationRequired
) {}
```

`TrainingPhase.CALIBRATION` entra no enum como fase **reservada**: nenhuma logica desta change a emite; `athlete-onboarding-baseline` decide quando reporta-la. Sem reservar agora, a change-irma nao estenderia `TrainingPhase` sem editar esta depois.

## Decisao 3 — Nucleo `domain/` com fronteira fiscalizada (fundacao arquitetural)

A auditoria de codigo (2026-07-14) mostrou o padrao atual: o backend ja calcula quase toda a inteligencia de treino (zonas, TSS-alvo, fase, elegibilidade), mas espalhada por `services/prompt` (formatters que calculam E renderizam markdown), `services/helper` (misturada com persistencia) e `skills/` (unico pacote com contrato limpo — e onde mora codigo orfao como `WeeklyDistributionSkill`). Decisao: consolidar a inteligencia deterministica num nucleo com endereco fixo e regra de dependencia dura.

```
br.com.menthoros.backend.domain/
  planner/       PlannerEngine, PeriodizationPlanner, LoadTargetResolver,
                 TaperStrategy, InjuryRiskEvaluator, ConstraintValidator,
                 TrainingPhase, WeekPlanSkeleton, WeeklyLoadTarget, SessionSlot,
                 OnboardingContext, PlannerInputSnapshot, ...
  compliance/    SkeletonComplianceChecker, PlannerViolation, PlannerComplianceStatus
```

Regra unica: **`domain/..` nao importa `entity/..`, `repository/..`, `org.springframework.web`, `org.springframework.ai`** (nem `jakarta.persistence`). Records in/out; a camada de service mapeia entity -> record antes de chamar (padrao ja mandatorio para skills no `CLAUDE.md`). Fiscalizacao: `DomainBoundaryArchTest` com **ArchUnit** (dependencia nova, escopo `test`, aprovada no replanejamento 2026-07-14).

Migracao do legado: **sem big-bang** — logica deterministica nova nasce em `domain/`; codigo velho migra quando tocado (`refactor-iaservice-decomposition` deposita validadores; `migrate-plan-prompt-to-skills` transforma formatters em renderers). Esta change so cria o nucleo e seus dois primeiros pacotes.

## Decisao 4 — SkeletonComplianceChecker: logica de dominio aqui, wiring de enforcement na parte 2

O checker nasce completo em `domain/compliance`, com os dois metodos e politica documentada:

- `checkPreRedistribution(plano, skeleton)` — fase, sessionCount, TSS total +-10%, teto de longo, sessoes intensas, sessao pesada 48-72h antes de prova (na posicao gerada), constraints duras;
- `checkPostRedistribution(treinosRedistribuidos, skeleton)` — dias permitidos, sessao pesada perto de prova apos reposicionamento, taper/race-week preservados.

Retorna `List<PlannerViolation>` (record proprio `key` + `mensagem`, mesma forma de `ViolacaoQualidade` para consistencia de log/metrica — **sem estender** `PlanQualityChecker`/`ConstraintKey`, que e um switch fechado de 4 checks sem chaves para fase/TSS/longao/prova/taper).

**Nesta change o checker so roda em shadow**: compliance hipotetico sobre o plano legado ja gerado, alimentando `planner.compliance.hypothetical_failure.count`. O wiring real — estagio 1 dentro da funcao `validar` de `PlanoResilienceService.gerarComResiliencia` (retry) e estagio 2 terminal pos-redistribuicao — e escopo de `planner-engine-enforcement` (ver design.md de la, Decisao 1). Ground truth que motivou os dois estagios: `PlanoResilienceService` (`services/helper/PlanoResilienceService.java:42-71`) retenta apenas a geracao do LLM, ANTES da redistribuicao (`PlanoServiceImpl.persistirPlanoCompleto` -> `redistribuicaoHelper`), que nao tem retry proprio.

## Decisao 5 — Motor consome executado, nao planejado

`LoadTargetResolver` e `InjuryRiskEvaluator` leem `TreinoRealizado` (executado), nao `TreinoPlanejado`. Se o atleta fez 280 TSS com plano de 400, a rampa da semana seguinte usa 280.

## Decisao 6 — `ProgressaoTreinoService` e input, nao substituido

`progressao-treinos` ja esta mergeada. O `PlannerEngine` nao recalcula a direcao de progressao; consome `DecisaoProgressao` e resolve o alvo final combinando fase, taper, risco e constraints.

Hierarquia P0:
1. constraints duras e lesao ativa;
2. risco fisiologico (`InjuryRiskEvaluator`);
3. prova na semana / taper / pos-prova;
4. `DecisaoProgressao`;
5. preferencias do atleta/coach.

Consequencia: `DecisaoProgressao.REDUZIR` nunca vira aumento porque a fase e BUILD/PEAK; `MANTER` nao usa automaticamente todo o teto fisiologico.

## Decisao 7 — Selecao de prova propria; prova-alvo explicita vence

**Ground truth:** `PlanoServiceImpl.buscarProximaProva` (575-593) e `CoachAthleteProfileServiceImpl.getProximaProva` (130-136) ordenam **apenas por data** quando nao ha `provaAlvo`. A decisao de produto (CPO 2026-07-13) de desempatar por distancia mais longa nao existe em nenhum dos dois e nao deve ser adicionada a eles (mudaria comportamento usado por outros fluxos).

O `PeriodizationPlanner` implementa selecao **propria** sobre a lista de `Prova`:
1. `isProvaAlvo() == true` entre as futuras -> vence, sempre;
2. senao, futuras nao-canceladas: mais proxima por data; empate (mesma semana) -> maior distancia;
3. prova preparatoria dentro da semana vira constraint estrutural (mini-taper, substitui treino-chave em conflito) sem alterar a fase macro;
4. semana imediatamente apos prova -> `POST_RACE`/recuperacao, nao volta direto para BUILD.

## Decisao 8 — Historico insuficiente nao bloqueia geracao

`ProgressaoTreinoService` ja retorna `MANTER` com motivo "historico insuficiente". O planner respeita: com pouco historico, skeleton conservador. Nao usar `DadosInsuficientesException` como padrao para atletas legados.

## Decisao 9 — Auditoria minima persistida no plano semanal (ja em shadow)

Como `PlanoMetaDados` e por-atleta e mutavel, a auditoria e snapshot por plano em `tb_plano_semanal`. Migration `V54__Add_planner_metadata_to_plano_semanal.sql` (ultima existente: `V53` — confirmar antes de criar):

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

**Em shadow, a auditoria ja e persistida** com `planner_enabled=false` e `planner_compliance_status` hipotetico — a segmentacao (fase, review, violacao) funciona antes de qualquer enforcement, que e exatamente o dado de calibracao que a parte 2 precisa. `planner_metadata_json` guarda resumo compacto do skeleton, sem prompt nem dado sensivel; `planner_skeleton_hash` correlaciona logs sem payload grande. Campos tecnicos nao sao expostos ao atleta.

## Decisao 10 — Shadow: integracao, isolamento de erro e batch

Integracao em `PlanoServiceImpl`, apos a geracao legada retornar (nao dentro de `IaServiceImpl` — o prompt e o retry nao sabem que o planner existe):

1. pipeline legado gera e valida o plano normalmente;
2. se `planner-engine.shadow=true`: montar `PlannerInputSnapshot` -> `planWeek(...)` -> compliance hipotetico (`checkPreRedistribution` sobre o DTO do LLM; `checkPostRedistribution` sobre os treinos redistribuidos) -> metricas + auditoria V54;
3. **qualquer excecao no passo 2 e engolida**: log estruturado (`atletaId`, `tenantId`, `plannerVersion`) + `planner.shadow.error.count`. A geracao nunca falha por causa do shadow.

Batch (`coach-batch-plan-generation`): o shadow roda por atleta dentro do fluxo existente de virtual threads, com o mesmo isolamento — erro de shadow nao vira erro individual do job (diferente do enforcement na parte 2, onde falha de compliance vira erro individual). Metricas com tag `batch=true/false`. Nao ha segunda chamada ao LLM em nenhum caso.

## Decisao 11 — Observabilidade

Metricas:
- `planner.generated.count{phase,plannerVersion,batch}`;
- `planner.requires_coach_review.count{reason,phase}`;
- `planner.compliance.hypothetical_failure.count{reason,phase,stage}`;
- `planner.shadow.error.count{reason}`;
- `planner.phase.divergence.count{plannerPhase,formatterPhase}`.

Logs estruturados sempre com `atletaId`, `tenantId`, `plannerVersion`, `phase`, `skeletonHash`, `batchJobId` quando existir. Flags `planner-engine.enabled`/`fail-open` NAO existem nesta change — nascem na parte 2; aqui so `planner-engine.shadow` (default `false`) e `planner-engine.injury.recent-window-days` (default 30).

## Decisao 12 — Duplicacao temporaria com `PeriodizacaoPromptFormatter` + metrica de divergencia

Shadow nao pode alterar o prompt, entao `PeriodizacaoPromptFormatter` **nao e tocado**: o `PeriodizationPlanner` implementa a logica de fase de forma independente (informada pelas mesmas regras). A duplicacao e temporaria e deliberada — e virou instrumento: o shadow compara a fase do planner com a do formatter e mede divergencia (`planner.phase.divergence.count`). Divergencia alta = regra transcrita errado em um dos lados; investigar antes do enforcement. A unificacao (formatter vira renderer da saida do planner) acontece em `planner-engine-enforcement` (Decisao 5 de la), que tambem remove a metrica.

## Decisao 13 — Escopo v1 running-first

Para atletas/marcadores multisport: TSS agregado segue como guardrail conservador de fadiga geral; sem CTL/ATL por esporte; sem distribuicao de sessoes por modalidade; metadata registra `plannerScope=RUNNING_FIRST` quando modalidade nao-running for detectada. Triathlon/Ironman completo requer change futura.

## Decisao 14 — Lesao ativa, lesao recente e retorno gradual

Campos atuais de `Atleta`:
- `temLesao=true` -> `RECOVERY` + `requiresCoachReview=true`;
- `temLesao=false` e `dataUltimaLesao` dentro de janela configuravel (default 30 dias) -> `RETURN_TO_TRAINING` com teto reduzido;
- `descricaoLesao` preenchida sem flag/data -> sem NLP; `requiresCoachReview=true` com motivo `INJURY_DESCRIPTION_UNSTRUCTURED`;
- sem dados de lesao -> fluxo normal.

Propriedade `planner-engine.injury.recent-window-days=30`.

## Decisao 15 — InjuryRiskEvaluator usa TSB/CTL/ATL existente, nao ACWR/AthleteLoadHistory

**Ground truth:** nao existe `AthleteLoadHistory`, `InjuryRiskEvaluator` ou ACWR no backend. `ProgressaoHistoricoResumo` ja carrega `tsbAtual/ctlAtual/atlAtual` (calculados por `TsbService`, modelo Banister/PMC em producao). Nao existe janela de 28d de TSS diario; o mais proximo e `TreinoRealizado.tssCalculado` via `findByAtletaIdAndDataTreinoBetween` (janela 42d em `PlanoServiceImpl.getPreparaDadosPlano`).

Introduzir ACWR criaria um segundo modelo de carga concorrente com o TSB canonico (ADR-2), exigindo entidade/query nova sem justificativa — o TSB negativo cumpre a mesma funcao (fadiga acumulada/risco).

**Decisao:** risco primario por `ProgressaoHistoricoResumo.tsbAtual`:
- TSB > -10 -> zona segura;
- -10 a -30 -> WARNING;
- < -30 -> HIGH_RISK -> `requiresCoachReview = true`.

Monotonia como sinal secundario, calculada localmente (janela 7d de `tssCalculado` agregado por dia, em memoria): media/desvio-padrao > 2.0 -> WARNING. `lesaoAtiva` forca RECOVERY independente do TSB.

## Decisao 16 — Sequenciamento com changes ativas (atualizado no split)

Sobreposicoes reais verificadas (nenhuma das changes se referencia mutuamente hoje):
- `PeriodizacaoPromptFormatter`: logica de fase duplicada temporariamente por esta change (Decisao 12); `migrate-plan-prompt-to-skills` planeja retira-lo; a unificacao ocorre em `planner-engine-enforcement` ANTES da migracao de formatters.
- `IaServiceImpl.geraPlanoSemanalAvancado`: **esta change nao toca** (era o conflito da versao monolitica). Quem insere o estagio-1 do compliance la (ou em `PlanoLlmValidator`) e `planner-engine-enforcement`, apos `refactor-iaservice-decomposition`.

Ordem recomendada (alinhada ao SPRINTS):
1. **esta change** (sprint 17-18) — sem dependencia de change ativa;
2. **`athlete-onboarding-baseline`** (19-22) — consome `PlannerEngine`/`OnboardingContext`/`CALIBRATION`;
3. **`refactor-iaservice-decomposition`** (24) — deixa `PlanoLlmValidator` pronto;
4. **`planner-engine-enforcement`** — wiring de compliance/retry + skeleton no prompt + unificacao do formatter;
5. **`migrate-plan-prompt-to-skills`** — quando alcancar a periodizacao, a decisao ja estara no dominio; o skill consome `WeekPlanSkeleton`.

## Decisao 17 — Data de referencia da semana: o planner recebe, nao recalcula

**Ground truth:** ha pelo menos 4 chamadas independentes de `LocalDate.now()` para "a semana atual"/"hoje" (`IaServiceImpl` 313/315/321; `PlanoServiceImpl.calcularSemanaInicio` via linha 165; `Prova.diasFaltando()` 118; `PlanoServiceImpl.obterTreinosParaPlano` 274 passando `now()` a `redistribuirTreinos`), mais `DadosPlanoDto.dataInicio` (so usado para `planoAnterior`). O descompasso pre-existente pode divergir em job que atravessa meia-noite — corrigi-lo por completo esta fora de escopo.

**Decisao, escopada ao planner:** `PlannerEngine.planWeek(...)` recebe `referenceDate` explicito (o `semanaInicio` que `PlanoServiceImpl` ja calcula) — nunca chama `LocalDate.now()`. "Dias para a prova" via `ChronoUnit.DAYS.between(referenceDate, prova.getDataProva())`, sem `Prova.diasFaltando()`. Garante determinismo do golden set. O risco do call site `obterTreinosParaPlano:274` (que alimenta o pos-redistribuicao) fica registrado para a parte 2, que consome esse resultado no estagio 2.

## Fora de escopo

- **Enforcement** — skeleton no prompt, compliance com retry, estagio 2 terminal, flags `enabled`/`fail-open`, `SessionSlot` prescritivo (dia/TSS por sessao/zonas): tudo em `planner-engine-enforcement`
- "Prescription stamping" (campos que o LLM copia/inventa) — change candidata separada, apos `refactor-iaservice-decomposition`
- Gerador deterministico de estrutura de treino (hoje o codigo repara; gerar e v2)
- Recalibracao automatica apos `SugestaoCoach.REJECTED` (v2)
- Migracao de atletas existentes (coberta por `athlete-onboarding-baseline`)
- UI de configuracao de regras para o treinador
- Multiplas metodologias de periodizacao (Lydiard, Daniels)
- Unificar as chamadas de `LocalDate.now()` em `IaServiceImpl`/`PlanoServiceImpl`/`Prova` (Decisao 17) — risco conhecido, pre-existente
- Corrigir `buscarProximaProva`/`getProximaProva` para considerar distancia (Decisao 7)
