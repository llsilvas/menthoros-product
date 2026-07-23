# athlete-onboarding Specification

> Cenarios Given/When/Then para os criterios de aceite CA1-CA13 do proposal.md. Consome o
> contrato reservado por `deterministic-planner-engine` (`PlannerEngine`, `TrainingPhase.CALIBRATION`,
> `OnboardingContext`/`PlanningPolicy`/`AthleteConstraints`), ja mergeado em `develop`. O record
> `AthleteBaseline` (2 campos, `ctlEstimado`/`dataEstimativa`) tambem ja existe como contrato minimo
> de leitura — **corrigido pre-mortem rodada 2:** o estado completo (CTL/ATL/TSB + flags + score)
> e persistido por esta change numa entidade nova, `AthleteBaselineSnapshot` (design.md Decisao 6,
> tasks.md 0.2.1/2.3), mapeada para o record na borda do `OnboardingContext` — o record em si nao
> muda.

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
- **And** o plano SHALL NOT ficar visivel ao atleta (`buscarPlanoPorAtleta(atletaId, apenasAprovados=true)` nao o retorna) ate o coach aprovar via `PlanoReviewServiceImpl.aprovarPlano`

### Requirement: Auto-aprovacao para Cenario A (CA5)

O sistema SHALL pular a fila de revisao manual do coach quando o atleta tem confianca alta **E** o
proprio ciclo de planejamento nao exigir revisao (corrigido pre-mortem cross-model rodada 2:
confianca historica alta nao anula um risco pontual do ciclo atual).

#### Scenario: Atleta Cenario A gera um plano sem risco no ciclo
- **Given** um atleta com score >= 75 (Cenario A, `PlanningPolicy.reviewMode = EXCEPTION_ONLY`)
- **And** `WeekPlanSkeleton.requiresCoachReview = false` e `injuryRisk.level != HIGH_RISK` para o ciclo gerado
- **When** um `PlanoSemanal` e gerado para esse atleta
- **Then** `reviewStatus` e setado para `APROVADO` diretamente (sem passar por `AGUARDANDO_REVISAO` na fila do coach)
- **And** `PlanoAprovadoEvent` e publicado (mesmo efeito colateral do fluxo manual de aprovacao — dispara sync com intervals.icu quando aplicavel)

#### Scenario: Atleta Cenario A mas com risco no ciclo atual — NAO auto-aprova
- **Given** um atleta com score >= 75 (Cenario A)
- **And** `WeekPlanSkeleton.requiresCoachReview = true` OU `injuryRisk.level = HIGH_RISK` para o ciclo gerado
- **When** um `PlanoSemanal` e gerado para esse atleta
- **Then** `reviewStatus` permanece `AGUARDANDO_REVISAO` (mesmo caminho do Cenario B/C) — a confianca historica alta nao anula o risco calculado pelo planner neste ciclo especifico

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
- **And** ambas tem o mesmo `dataTreino` e caem em +-5% de duracao/distancia (janela degradada de +-10min de horario para "mesmo dia" — schema atual nao tem precisao de horario, design.md Decisao 2)
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

### Requirement: Acesso a dado de saude restrito ao atleta e a TECNICO/ADMIN do tenant (CA12)

O sistema SHALL restringir a leitura de campos de saude (lesao, dor, fadiga, sono, recuperacao)
ao atleta dono do dado e a usuarios TECNICO/ADMIN do MESMO tenant. **Corrigido pre-mortem cross-model
rodada 2:** o modelo atual (`Atleta.assessoria`/`Atleta.usuario`) nao tem um vinculo de "coach
responsavel" designado por atleta — o controle real e por tenant + papel, mesmo padrao ja usado no
resto do produto.

#### Scenario: Usuario de outro tenant tenta ler o dado
- **Given** um atleta com dados de saude preenchidos no onboarding
- **And** um usuario TECNICO/ADMIN de um tenant DIFERENTE
- **When** esse usuario tenta acessar esses campos
- **Then** o acesso SHALL ser negado (403/404, sem vazar existencia do dado)

### Requirement: `dataProva` do onboarding cria uma `Prova` real (CA13)

O sistema SHALL criar (ou atualizar) uma `Prova` marcada como alvo a partir do `dataProva` do
onboarding (campo **obrigatorio**, nao opcional — corrigido pre-mortem rodada 2), reaproveitando o
CRUD de `Prova` existente, e desmarcando qualquer outra `Prova` do atleta que estivesse marcada
como alvo.

#### Scenario: Atleta conclui o onboarding
- **Given** um atleta concluindo o onboarding (com `dataProva`, campo obrigatorio)
- **When** o onboarding e submetido
- **Then** uma `Prova` e criada (ou atualizada, se ja existir uma equivalente) com `provaAlvo = true`
- **And** qualquer outra `Prova` do mesmo atleta com `provaAlvo = true` e desmarcada na mesma transacao (no maximo uma prova-alvo ativa por atleta)
- **And** essa `Prova` e a mesma que o `PeriodizationPlanner` (`deterministic-planner-engine`) usa para resolver a fase

### Requirement: Canal de integracao e dispositivo do atleta (CA14)

O sistema SHALL coletar, no onboarding, o canal de integracao de treinos (`canalIntegracao`:
`INTERVALS_ICU`/`MANUAL`) e o dispositivo do atleta (`dispositivoMarca`: `GARMIN`/`COROS`/`POLAR`/
`SUUNTO`/`APPLE`/`OUTRO`, obrigatorio; `dispositivoModelo`: texto livre, opcional) — ambos campos
obrigatorios (exceto o modelo). `STRAVA` NAO SHALL ser oferecido como opcao de canal para atletas
novos (descontinuacao anunciada, ADR-0003 — atletas ja conectados via Strava continuam funcionando
pelo pipeline existente). `dispositivoMarca` alimenta o `ConfidenceScorer` como prior do criterio
"Fonte confiavel" (mesmo peso, 15 pontos, placeholder) antes de qualquer atividade real existir;
assim que houver atividade real, o dado real sempre substitui o prior.

#### Scenario: Onboarding nao oferece Strava como opcao de canal
- **Given** um atleta novo preenchendo o formulario de onboarding
- **When** o formulario apresenta as opcoes de `canalIntegracao`
- **Then** apenas `INTERVALS_ICU` e `MANUAL` sao oferecidos
- **And** `STRAVA` nao aparece como opcao

#### Scenario: Score de confianca usa a marca do dispositivo como prior antes de atividade real
- **Given** um atleta recem-onboarded com `dispositivoMarca = GARMIN`, sem nenhuma atividade real ainda
- **When** o `ConfidenceScorer` calcula o score
- **Then** o criterio "Fonte confiavel" pontua os 15 pontos (prior de alta prioridade), como se houvesse atividade de fonte confiavel

#### Scenario: Atividade real substitui o prior de dispositivo
- **Given** um atleta com `dispositivoMarca = GARMIN` que ja possui atividades reais de outra fonte (ex.: Strava)
- **When** o `ConfidenceScorer` calcula o score
- **Then** o criterio "Fonte confiavel" usa a fonte real das atividades (`FontePriority`), ignorando o prior declarado no onboarding
