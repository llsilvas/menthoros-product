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

Mesma atividade em Garmin + Strava: identificada por janela de +-10 min de inicio + similaridade de duracao/distancia (+-5%). Merge preserva superset de metricas. `source` e `dataQuality` refletem a fonte de maior prioridade. Valor descartado retido no historico de proveniencia (nunca apagado).

Ordem de prioridade: Garmin/FIT > Coros/Polar/TrainingPeaks > Strava > Planilha > Manual > Declarado.

## Decisao 3 — Confidence Scorer com 8 criterios ponderados

| Criterio | Peso | Avaliacao |
|---|---|---|
| Historico > 8 semanas | 20 | proporcional (4 semanas -> 10 pts) |
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

## Decisao 6 — Migracao de atletas existentes

Atletas pre-ONBOARD: na primeira geracao de plano pos-deploy, o sistema:
1. Detecta ausencia de `AthleteBaseline` no perfil
2. Calcula baseline do historico real existente (Cenario B)
3. Calcula score de confianca com os dados disponiveis
4. Armazena `AthleteBaseline` + score para uso futuro

Sem UI de onboarding para esses atletas — os dados obrigatorios faltantes (objetivo, diasDisponiveis, etc.) usam defaults conservadores ate que o coach preencha.

## Fora de escopo

- Diagnostico medico, recomendacao nutricional, analise biomecanica
- UI de configuracao de regras de onboarding para o treinador
- Importacao em lote de multiplos atletas (planilha)
