# Design — athlete-onboarding-baseline

## Contexto

O onboarding atual do Menthoros e minimalista: cadastro de assessoria + convite de atleta. Nao ha coleta de dados de treino, baseline, score de confianca ou fase de calibracao. O primeiro plano e gerado diretamente pelo LLM sem lastro deterministico.

Esta change introduz o fluxo completo de onboarding, que alimenta o `OnboardingContext` consumido pelo `PlannerEngine` (`deterministic-planner-engine`).

Referencias (estado atual):
- `entity/Atleta.java` — entidade com campos basicos (nome, email, nivelExperiencia)
- `entity/TreinoRealizado.java` — atividades realizadas, com `etapasRealizadas`, `fonteDados`
- `services/TsbService.java` — calculadora TSS/CTL/ATL/TSB (reusada pelo Baseline Calculator)
- `dto/input/DadosPlanoDto.java` — record intocado (5 campos)

## Decisao 1 — Activity Normalizer com estrutura canonica

Toda atividade importada e convertida para estrutura canonica com os campos: activityId, athleteId, date, sport, durationMinutes, distanceKm, averageHeartRate, maxHeartRate, averagePace, averagePower, rpe, source, dataQuality.

Regras:
- `sport`: mapeamento por tabela de traducao do conector (ex: "Corrida" -> RUNNING)
- `averagePace`: sempre mm:ss/km
- `averagePower`: null (nunca 0)
- `rpe`: null se fonte nao fornece (nunca estimado de FC)
- `distanceKm`: 2 casas decimais

`dataQuality` = 0.5 * completude + 0.3 * confiabilidadeFonte + 0.2 * consistenciaInterna

## Decisao 2 — Deduplicacao entre fontes

Mesma atividade em Garmin + Strava: identificada por janela de +-10 min de inicio + similaridade de duracao/distancia (+-5%). Merge preserva superset de metricas. `source` e `dataQuality` refletem a fonte de maior prioridade.

Ordem de prioridade: Garmin/FIT > Coros/Polar/TrainingPeaks > Strava > Planilha > Manual > Declarado.

**Proveniencia (corrige contradicao com proposal.md "Open Questions"):** o registro ativo da atividade grava so a coluna simples `proveniencia` (a fonte vencedora, `SourcedValue<T>` genérico foi dropado para v1 — decisao CPO 2026-07-13). O valor descartado no merge **nao fica no registro ativo**: vai para uma tabela de auditoria append-only separada (`tb_atividade_proveniencia_descartada` ou equivalente — nome final na implementacao), com FK para a atividade ativa. Isso preserva "nunca apagar" sem reintroduzir o tipo genatico `SourcedValue<T>` que foi explicitamente rejeitado.

**Limites conhecidos do v1** (achado do pre-mortem, aceito como escopo): a janela +-10min/+-5% nao cobre drift de timezone, treadmill sem distancia, ou duas atividades legitimas proximas no tempo. Falsos positivos/negativos de dedup sao esperados no v1; refinamento fica para follow-up com dado real de producao.

## Decisao 3 — Confidence Scorer com 8 criterios ponderados

| Criterio | Peso | Avaliacao |
|---|---|---|
| Historico >= 8 semanas | 20 | proporcional linear entre 0 semanas (0 pts) e 8 semanas (20 pts, teto); ex.: 4 semanas -> 10 pts |
| Onboarding completo | 10 | binario (todos os campos obrigatorios) |
| FC valida | 10 | fcMaxima/fcRepouso declarados OU avgHR em >=70% das atividades |
| Ritmo ou potencia de limiar | 15 | ritmoLimiar ou ftp declarado |
| RPE registrado | 10 | proporcao de atividades com rpe nao-nulo |
| Consistencia semanal | 10 | regularidade, ausencia de lacunas grandes |
| Prova recente | 10 | provasRecentes preenchido |
| Fonte confiavel | 15 | proporcao do historico de fontes priority 1-2 |

Score classifica automaticamente: >= 75 -> A, 45-74 -> B, < 45 -> C.

Bonus de coach-como-proxy: se perfil preenchido pelo treinador, score sobe um tier (B -> A, C -> B). Nunca desce.

## Decisao 4 — PlanningPolicy derivada da confianca

| Faixa | reviewMode | maxProgressionAllowed | explanationRequired |
|---|---|---|---|
| >= 75 (A) | EXCEPTION_ONLY | normal (PLANNER-001 default) | true |
| 45-74 (B) | MANDATORY_NON_BLOCKING | reduzido (fracao do normal) | true |
| < 45 (C) | MANDATORY_BLOCKING | zero (carga fixa conservadora) | true |

## Decisao 5 — CalibrationStage como atributo interno

```java
public enum CalibrationStage {
    OBSERVATION,     // semana 1
    CALIBRATION,     // semana 2
    STABILIZATION    // semanas 3-4
}
```

`CalibrationStage` e atributo interno de `TrainingPhase.CALIBRATION`, nao um novo valor do enum de fase. O `PlannerEngine` reporta `phase = CALIBRATION` ao restante do sistema, mas usa o estagio internamente para decidir conservadorismo.

**Criterio de saida da calibracao (CA11):** `score >= 45` E sem `HIGH_RISK` (`InjuryRiskLevel.HIGH_RISK`, ja existente no `PlannerEngine`) E `percentualRealizacao` (`MetricasAdesaoService.getAdesaoSemanal`/`SemanaAdesaoDto`, ja existente) `>= 70%` na semana mais recente de calibracao. O numero 70% e hipotese v1, a mesma logica de `planner-rules.yml` (deterministic-planner-engine): threshold hardcoded documentado, calibravel com dado real, nao bloqueante para implementar.

**Aviso ao coach ao sair da calibracao (achado do pre-mortem):** a duracao real varia por cenario (1/2/2-4 semanas) e por reclassificacao bidirecional — o coach precisa ser notificado quando um atleta sai de `CALIBRATION`, nao pode descobrir so olhando o plano seguinte. Reaproveita o canal de notificacao/banner ja previsto para o "Indicador de calibracao" (frontend, secao Backend/Frontend do proposal.md) — sem canal novo.

## Decisao 6 — Migracao de atletas existentes

Atletas pre-ONBOARD: na primeira geracao de plano pos-deploy, o sistema:
1. Detecta ausencia de `AthleteBaseline` no perfil
2. Calcula baseline do historico real existente (Cenario B)
3. Calcula score de confianca com os dados disponiveis
4. Armazena `AthleteBaseline` + score para uso futuro

Sem UI de onboarding para esses atletas — os dados obrigatorios faltantes (objetivo, diasDisponiveis, etc.) usam defaults conservadores ate que o coach preencha.

## Decisao 7 — Visibilidade do plano via `PlanoReviewStatus` (mecanismo existente, nao novo)

**Ground truth (achado ao investigar o mecanismo a reaproveitar):** `PlanoSemanal.reviewStatus` (`PlanoReviewStatus`: `AGUARDANDO_REVISAO`/`APROVADO`/`REJEITADO`) ja existe. `PlanoServiceImpl.criarPlanoEntity` (linha ~443) hoje seta `AGUARDANDO_REVISAO` incondicionalmente para **todo** plano gerado, sem excecao por cenario de confianca. Nao existe nenhum caminho de auto-aprovacao no codigo atual — a unica transicao para `APROVADO` e a acao explicita do coach em `PlanoReviewServiceImpl.aprovar`. `buscarPlanoPorAtleta(atletaId, apenasAprovados=true)` (o endpoint atleta-facing) so retorna planos `APROVADO`.

Consequencia direta para esta change:
- **CA4 (Cenario C, `MANDATORY_BLOCKING`)** — zero trabalho novo. E o comportamento padrao de hoje; a change so precisa garantir que o auto-approve do CA5 **nunca** se aplica a este cenario.
- **CA5 (Cenario A, `EXCEPTION_ONLY`)** — trabalho novo real: apos `criarPlanoEntity`, se `PlanningPolicy.reviewMode == EXCEPTION_ONLY`, setar `reviewStatus = APROVADO` diretamente (pula a fila). Reaproveita a mesma entidade/coluna, sem novo status nem tabela.
- **Cenario B (`MANDATORY_NON_BLOCKING`)** — mantem `AGUARDANDO_REVISAO` (nao auto-aprova), mas a tela de revisao do coach (`listarPlanosPendentes`) ganha um badge/indicador de "baixa confianca" para o item — reaproveita a UI/endpoint existente, sem tela nova.

## Decisao 8 — `dataProva` do onboarding cria/atualiza `Prova`

O formulario de onboarding coleta `dataProva` como campo obrigatorio (proposal.md, Frontend). Em vez de um campo solto em `AthleteOnboardingProfile` sem relacao com o dominio de provas, a conclusao do onboarding cria uma `Prova` (CRUD ja existente, ver `specs/prova-crud/spec.md`) com `provaAlvo=true`. Se o atleta ja tiver uma `Prova` com a mesma data/distancia marcada como `provaAlvo`, atualiza em vez de duplicar. Evita duas fontes de verdade (o `PeriodizationPlanner` do `deterministic-planner-engine` seleciona a prova-alvo a partir de `Prova`, nao de um campo de onboarding separado).

## Decisao 9 — Acesso a dado de saude do onboarding

Campos de lesao/dor/fadiga/sono/recuperacao (onboarding + extensao do feedback pos-treino durante `CALIBRATION`) sao visiveis a: (1) o proprio atleta dono do dado; (2) o coach responsavel pelo atleta (vinculo de assessoria/coach designado). Nenhum outro coach do mesmo tenant ve por padrao — mesmo modelo de acesso ja aplicado ao resto do perfil do atleta no produto, sem mecanismo de permissao novo.

## Fora de escopo

- Diagnostico medico, recomendacao nutricional, analise biomecanica
- UI de configuracao de regras de onboarding para o treinador
- Importacao em lote de multiplos atletas (planilha)
