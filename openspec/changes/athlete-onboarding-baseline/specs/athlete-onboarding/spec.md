# athlete-onboarding Specification

> Cenarios Given/When/Then para os criterios de aceite CA1-CA13 do proposal.md. Consome o
> contrato reservado por `deterministic-planner-engine` (`PlannerEngine`, `TrainingPhase.CALIBRATION`,
> `OnboardingContext`/`AthleteBaseline`/`PlanningPolicy`/`AthleteConstraints`), ja mergeado em
> `develop`.

## New Requirements

### Requirement: Classificacao automatica de confianca (CA1)

O sistema SHALL classificar o atleta em Cenario A quando o historico e o score satisfazem os
limiares do Confidence Scorer.

#### Scenario: Atleta com historico completo e score alto
- **Given** um atleta com >= 8 semanas de historico de treino completo
- **And** o Confidence Scorer calcula score >= 75
- **When** o baseline e calculado
- **Then** o atleta e classificado como Cenario A

### Requirement: Baseline estimado no cold start (CA2)

O sistema SHALL marcar o baseline como ESTIMATED e forcar revisao do coach quando nao ha
historico de treino.

#### Scenario: Atleta sem nenhum historico
- **Given** um atleta sem nenhum `TreinoRealizado`
- **When** o Baseline Calculator roda (Cenario C)
- **Then** o `AthleteBaseline` e marcado ESTIMATED
- **And** a fase reportada e CALIBRATION
- **And** `requiresCoachReview` e `true`

### Requirement: Re-baseline ao longo da calibracao (CA3)

O sistema SHALL atualizar o baseline de ESTIMATED para MEASURED conforme dado real se acumula
durante CALIBRATION.

#### Scenario: Semana de calibracao concluida com dado real
- **Given** um atleta em CALIBRATION com baseline ESTIMATED
- **And** uma semana de treinos reais foi registrada
- **When** o re-baseline semanal roda
- **Then** o baseline e atualizado para MEASURED
- **And** o score de confianca e recalculado

### Requirement: Cenario C nao recebe auto-approve (CA4)

O sistema SHALL manter o plano de atletas de baixa confianca em `PlanoReviewStatus.AGUARDANDO_REVISAO`
— o mesmo comportamento padrao que ja existe hoje para todo plano gerado, sem excecao.

#### Scenario: Atleta Cenario C gera um plano
- **Given** um atleta com score < 45 (Cenario C, `PlanningPolicy.reviewMode = MANDATORY_BLOCKING`)
- **When** um `PlanoSemanal` e gerado para esse atleta
- **Then** `reviewStatus` permanece `AGUARDANDO_REVISAO`
- **And** o plano SHALL NOT ficar visivel ao atleta (`buscarPlanoPorAtleta(atletaId, apenasAprovados=true)` nao o retorna) ate o coach aprovar via `PlanoReviewServiceImpl.aprovar`

### Requirement: Auto-aprovacao para Cenario A (CA5)

O sistema SHALL pular a fila de revisao manual do coach quando o atleta tem confianca alta.

#### Scenario: Atleta Cenario A gera um plano
- **Given** um atleta com score >= 75 (Cenario A, `PlanningPolicy.reviewMode = EXCEPTION_ONLY`)
- **When** um `PlanoSemanal` e gerado para esse atleta
- **Then** `reviewStatus` e setado para `APROVADO` diretamente (sem passar por `AGUARDANDO_REVISAO` na fila do coach)

### Requirement: Score bidirecional (CA6)

O sistema SHALL permitir que o score de confianca suba OU desca durante a calibracao,
reclassificando o cenario automaticamente.

#### Scenario: Score cai durante a calibracao
- **Given** um atleta classificado como Cenario A
- **And** o re-baseline de uma semana revela dado real pior que o estimado
- **When** o score e recalculado
- **Then** o atleta pode ser reclassificado para Cenario B (nunca fica preso na classificacao antiga)

### Requirement: Coach como proxy aumenta a confianca (CA7)

O sistema SHALL aplicar um bonus de confianca quando o perfil e preenchido pelo coach, nunca
reduzindo o score.

#### Scenario: Coach preenche o perfil do atleta
- **Given** um cadastro com `filledByCoach = true`
- **When** o Confidence Scorer calcula o score
- **Then** o score sobe um tier (ex.: B -> A, C -> B)
- **And** o bonus SHALL NOT rebaixar o tier em nenhuma circunstancia

### Requirement: Onboarding retomavel (CA8)

O sistema SHALL persistir progresso parcial do onboarding como draft, retomavel pelo atleta.

#### Scenario: Atleta interrompe o onboarding no meio
- **Given** um atleta preenchendo o formulario de 11 campos obrigatorios
- **And** ele fecha o navegador apos preencher os primeiros campos
- **When** ele retorna ao onboarding
- **Then** o formulario retoma do ultimo campo preenchido, sem perder progresso

### Requirement: Deduplicacao entre fontes preserva o superset de metricas (CA9)

O sistema SHALL fazer merge de atividades duplicadas entre fontes, preservando o superset de
metricas disponiveis, sem duplicar a atividade.

#### Scenario: Mesma atividade em Garmin e Strava
- **Given** uma atividade importada tanto do Garmin quanto do Strava
- **And** ambas caem na janela de +-10min de inicio e +-5% de duracao/distancia
- **When** a deduplicacao roda
- **Then** as duas viram um unico registro ativo, com o superset de metricas das duas fontes
- **And** o valor descartado fica retido na tabela de auditoria de proveniencia (nunca apagado), nao no registro ativo

### Requirement: Migracao automatica de atletas legados (CA10)

O sistema SHALL calcular baseline e score para atletas pre-onboarding na primeira geracao de
plano pos-deploy, sem exigir UI de onboarding retroativa.

#### Scenario: Atleta legado gera o primeiro plano pos-deploy
- **Given** um atleta cadastrado antes desta change, sem `AthleteBaseline`
- **When** um novo `PlanoSemanal` e solicitado para esse atleta
- **Then** o sistema calcula baseline via Cenario B usando o historico real existente
- **And** classifica o atleta automaticamente, sem intervencao do coach

### Requirement: Saida de calibracao exige aderencia minima (CA11)

O sistema SHALL exigir score, ausencia de risco fisiologico alto e aderencia minima antes de
encerrar CALIBRATION.

#### Scenario: Atleta com score e risco ok mas aderencia baixa
- **Given** um atleta em CALIBRATION com score >= 45 e sem HIGH_RISK
- **And** `percentualRealizacao` da semana mais recente < 70%
- **When** o sistema avalia a saida da calibracao
- **Then** o atleta permanece em CALIBRATION

#### Scenario: Atleta satisfaz os tres criterios
- **Given** um atleta em CALIBRATION com score >= 45, sem HIGH_RISK, e `percentualRealizacao` >= 70%
- **When** o sistema avalia a saida da calibracao
- **Then** o atleta sai de CALIBRATION
- **And** o coach e notificado (banner/indicador) de que a fase mudou

### Requirement: Acesso a dado de saude restrito ao atleta e ao coach responsavel (CA12)

O sistema SHALL restringir a leitura de campos de saude (lesao, dor, fadiga, sono, recuperacao)
ao atleta dono do dado e ao coach responsavel por ele.

#### Scenario: Coach de outro atleta tenta ler o dado
- **Given** um atleta com dados de saude preenchidos no onboarding
- **And** um segundo coach do mesmo tenant, sem vinculo com esse atleta
- **When** o segundo coach tenta acessar esses campos
- **Then** o acesso SHALL ser negado (403/404, sem vazar existencia do dado)

### Requirement: `dataProva` do onboarding cria uma `Prova` real (CA13)

O sistema SHALL criar (ou atualizar) uma `Prova` marcada como alvo a partir do `dataProva` do
onboarding, reaproveitando o CRUD de `Prova` existente.

#### Scenario: Atleta conclui o onboarding com dataProva preenchido
- **Given** um atleta concluindo o onboarding com `dataProva` preenchido
- **When** o onboarding e submetido
- **Then** uma `Prova` e criada (ou atualizada, se ja existir uma equivalente) com `provaAlvo = true`
- **And** essa `Prova` e a mesma que o `PeriodizationPlanner` (`deterministic-planner-engine`) usa para resolver a fase
