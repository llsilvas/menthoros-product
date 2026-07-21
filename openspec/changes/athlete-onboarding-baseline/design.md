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

**Correcao durante a implementacao (2026-07-20):** `TreinoRealizado`/`TreinoBase` nao tem nenhum
campo com precisao de horario do dia — so `dataTreino` (`LocalDate`). Nenhum conector existente
(Strava, .fit, intervals.icu) grava horario preciso de inicio hoje. A janela "+-10min" tal como
descrita acima **nao e implementavel** com o schema atual sem retrofit dos 3 pipelines de ingestao
ja em producao — fora de escopo desta change (decisao do founder). **Fix v1:** a janela degrada
para "mesmo `dataTreino`" (em vez de +-10min de horario) + a mesma similaridade de duracao/distancia
(+-5%) ja descrita. E mais grosseiro (mais chance de falso positivo/negativo dentro do mesmo dia),
mas e uma extensao do mesmo limite ja aceito abaixo, nao um novo residual — "duas atividades
legitimas proximas no tempo" ja cobria esse tipo de imprecisao antes desta correcao.

**Escopo do dedup: leitura no calculo do baseline, nao ingestao (correcao durante a
implementacao, 2026-07-20).** `ActivityDedupService` NAO roda no momento em que uma atividade chega
de um conector — nao altera `StravaActivityServiceImpl`, `FitTreinoPersister` nem
`IntervalsIcuActivityIngestionServiceImpl` (os 3 pipelines de ingestao ja em producao, fora de
escopo). Ele roda dentro do `OnboardingService` (Decisao/Secao 5), como uma funcao de leitura:
recebe o historico ja normalizado (`List<NormalizedActivity>`, produzido pelo `ActivityNormalizer` a
partir dos `TreinoRealizado` ja persistidos por qualquer fonte) e devolve uma lista deduplicada para
o `BaselineCalculator` consumir — **nenhum `TreinoRealizado` e criado, alterado ou apagado** por
este servico. Para cada duplicata descartada, grava um registro em
`tb_atividade_proveniencia_descartada` (FK para o `TreinoRealizado` vencedor). Como nao ha insert de
"registro ativo" novo (as duas atividades duplicadas ja foram persistidas independentemente por seus
respectivos pipelines de ingestao antes do calculo do baseline rodar), a race de "2 fontes inserindo
a mesma atividade ao mesmo tempo" nao se aplica aqui — o residual real e bem mais estreito (2
calculos de baseline do MESMO atleta rodando ao mesmo tempo, ambos escrevendo auditoria para o mesmo
par duplicado); `@Transactional` no metodo que escreve a auditoria e suficiente, sem lock pessimista
dedicado.

Ordem de prioridade: Garmin/FIT > Coros/Polar/TrainingPeaks > Strava > Planilha > Manual > Declarado.

**Proveniencia (corrige contradicao com proposal.md "Open Questions"):** o registro ativo da atividade grava so a coluna simples `proveniencia` (a fonte vencedora, `SourcedValue<T>` genérico foi dropado para v1 — decisao CPO 2026-07-13). O valor descartado no merge **nao fica no registro ativo**: vai para uma tabela de auditoria append-only separada (`tb_atividade_proveniencia_descartada` ou equivalente — nome final na implementacao), com FK para a atividade ativa. Isso preserva "nunca apagar" sem reintroduzir o tipo genatico `SourcedValue<T>` que foi explicitamente rejeitado.

**Limites conhecidos do v1** (achado do pre-mortem, aceito como escopo): a janela +-10min/+-5% nao cobre drift de timezone, treadmill sem distancia, ou duas atividades legitimas proximas no tempo. Falsos positivos/negativos de dedup sao esperados no v1; refinamento fica para follow-up com dado real de producao.

**Invariante transacional (achado do pre-mortem cross-model rodada 2, 2026-07-20):** a constraint hoje existente `(tenant_id, fonte_dados, external_id)` (V29) previne duplicata **dentro da mesma fonte**, nao duplicata semantica **entre fontes diferentes** processando a mesma atividade concorrentemente (ex.: Strava e intervals.icu importando a mesma corrida ao mesmo tempo). **Fix:** `ActivityDedupService` (tasks.md 1.4) deve (a) adquirir um lock por `(atletaId, janela de tempo)` antes de decidir merge vs. insert novo — mesmo padrao de lock otimista/pessimista ja usado em outros pontos do dominio de treino; (b) o insert do registro ativo + o insert na tabela de auditoria (`tb_atividade_proveniencia_descartada`, migration V60) devem acontecer na **mesma transacao** — nunca um sem o outro. Sem isso, processamento concorrente pode deixar a auditoria orfa (sem o registro ativo correspondente) ou inserir duas atividades ativas para o mesmo evento fisico.

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

**Criterio de saida da calibracao (CA11):** `score >= 45` E sem `HIGH_RISK` (`InjuryRiskLevel.HIGH_RISK`, ja existente no `PlannerEngine`) E `percentualRealizacao` `>= 70%` na semana mais recente de calibracao. O numero 70% e hipotese v1, a mesma logica de `planner-rules.yml` (deterministic-planner-engine): threshold hardcoded documentado, calibravel com dado real, nao bloqueante para implementar.

**Correcao (pre-mortem cross-model rodada 2, 2026-07-20):** `MetricasAdesaoService.getAdesaoSemanal(atletaId)` hoje **sempre** calcula a partir de `LocalDate.now()` (`MetricasAdesaoService.java:46`) — nao aceita uma data de referencia, entao nao da para pedir diretamente "a semana mais recente de calibracao" se ela nao for a semana corrente (ex.: job de encerramento avaliando D+1). O metodo privado `calcularSemana(Atleta, LocalDate)` (`MetricasAdesaoService.java:252`) ja aceita a data — so falta expor. **Fix:** adicionar um novo metodo publico `getAdesaoSemana(String atletaId, LocalDate dataReferencia)` que delega para `calcularSemana`, sem alterar `getAdesaoSemanal(atletaId)` existente (aditivo, nao quebra nenhum consumidor atual). `CalibrationService` chama esse novo metodo com a data do fim da semana de calibracao que esta avaliando.

**Aviso ao coach ao sair da calibracao (achado do pre-mortem):** a duracao real varia por cenario (1/2/2-4 semanas) e por reclassificacao bidirecional — o coach precisa ser notificado quando um atleta sai de `CALIBRATION`, nao pode descobrir so olhando o plano seguinte. Reaproveita o canal de notificacao/banner ja previsto para o "Indicador de calibracao" (frontend, secao Backend/Frontend do proposal.md) — sem canal novo.

## Decisao 6 — Migracao de atletas existentes

Atletas pre-ONBOARD: na primeira geracao de plano pos-deploy, o sistema:
1. Detecta ausencia de `AthleteBaseline` no perfil
2. Calcula baseline do historico real existente (Cenario B)
3. Calcula score de confianca com os dados disponiveis
4. Armazena `AthleteBaseline` + score para uso futuro

Sem UI de onboarding para esses atletas — os dados obrigatorios faltantes (objetivo, diasDisponiveis, etc.) usam defaults conservadores ate que o coach preencha.

## Decisao 7 — Visibilidade do plano via `PlanoReviewStatus` (mecanismo existente, nao novo)

**Ground truth (achado ao investigar o mecanismo a reaproveitar):** `PlanoSemanal.reviewStatus` (`PlanoReviewStatus`: `AGUARDANDO_REVISAO`/`APROVADO`/`REJEITADO`) ja existe. `PlanoServiceImpl.criarPlanoEntity` (linha ~443) hoje seta `AGUARDANDO_REVISAO` incondicionalmente para **todo** plano gerado, sem excecao por cenario de confianca. Nao existe nenhum caminho de auto-aprovacao no codigo atual — a unica transicao para `APROVADO` e a acao explicita do coach em `PlanoReviewServiceImpl.aprovarPlano`. `buscarPlanoPorAtleta(atletaId, apenasAprovados=true)` (o endpoint atleta-facing) so retorna planos `APROVADO`.

Consequencia direta para esta change:
- **CA4 (Cenario C, `MANDATORY_BLOCKING`)** — zero trabalho novo. E o comportamento padrao de hoje; a change so precisa garantir que o auto-approve do CA5 **nunca** se aplica a este cenario.
- **CA5 (Cenario A, `EXCEPTION_ONLY`)** — trabalho novo real, **corrigido pos pre-mortem cross-model rodada 2 (2026-07-20)**, 2 achados criticos:
  1. **Nao basta `setReviewStatus(APROVADO)` direto** (versao original desta secao) — `PlanoReviewServiceImpl.aprovarPlano` (fluxo manual do coach) tambem seta `reviewComment=null`, chama `inicializarAssociacoes` e **publica `PlanoAprovadoEvent`**
     (`PlanoReviewServiceImpl.java:70-75`), que o listener `IntervalsIcuPushListener` consome via
     `@TransactionalEventListener(AFTER_COMMIT)` para empurrar o treino ao relogio do atleta. Sem esse
     evento, o auto-approve deixaria o plano "aprovado" no banco mas invisivel para qualquer
     integracao que reaja a aprovacao. **Fix:** extrair de `aprovarPlano` um metodo interno
     reutilizavel (ex.: `aprovarTransicao(PlanoSemanal, tenantId)`) com os mesmos 4 efeitos
     (status + comment + save + publish), chamado tanto pelo fluxo manual quanto pelo auto-approve.
  2. **CA5 auto-aprovava so por `score >= 75`, ignorando o proprio risco calculado pelo planner
     nesse ciclo especifico** — um atleta Cenario A (score alto, historico) pode ainda assim ter
     `WeekPlanSkeleton.requiresCoachReview()=true` ou `injuryRisk.level()==InjuryRiskLevel.HIGH_RISK`
     no ciclo corrente (TSB ruim, lesao recente). **Fix:** o auto-approve so dispara se **as tres**
     condicoes forem verdadeiras: `reviewMode == EXCEPTION_ONLY` **E**
     `!weekPlanSkeleton.requiresCoachReview()` **E** `injuryRisk.level() != InjuryRiskLevel.HIGH_RISK`
     (checagem redundante com a anterior por design — `HIGH_RISK` ja deveria forcar
     `requiresCoachReview=true`, mas a dupla checagem e defesa em profundidade contra a invariante
     quebrar num refactor futuro). Se qualquer uma falhar, cai para `AGUARDANDO_REVISAO` (mesmo
     caminho do Cenario B/C).
- **Cenario B (`MANDATORY_NON_BLOCKING`)** — mantem `AGUARDANDO_REVISAO` (nao auto-aprova), mas a tela de revisao do coach (`listarPlanosPendentes`) ganha um badge/indicador de "baixa confianca" para o item — reaproveita a UI/endpoint existente, sem tela nova.

## Decisao 8 — `dataProva` do onboarding cria/atualiza `Prova`

O formulario de onboarding coleta `dataProva` como campo obrigatorio (proposal.md, Frontend). Em vez de um campo solto em `AthleteOnboardingProfile` sem relacao com o dominio de provas, a conclusao do onboarding cria uma `Prova` (CRUD ja existente, ver `specs/prova-crud/spec.md`) com `provaAlvo=true`. Se o atleta ja tiver uma `Prova` com a mesma data/distancia marcada como `provaAlvo`, atualiza em vez de duplicar. Evita duas fontes de verdade (o `PeriodizationPlanner` do `deterministic-planner-engine` seleciona a prova-alvo a partir de `Prova`, nao de um campo de onboarding separado).

**Unicidade de prova-alvo (achado do pre-mortem cross-model rodada 2, 2026-07-20):**
`ProvaRepository.findByAtletaAndProvaAlvoTrue` retorna `List<Prova>` sem garantia de unicidade
(`ProvaRepository.java:52`), e `PeriodizationPlanner` seleciona `.filter(provaAlvo).findFirst()`
sem ordenacao garantida (`PeriodizationPlanner.java:62-67`) — se o onboarding criar uma nova `Prova`
com `provaAlvo=true` sem desmarcar uma ja existente, o planner pode escolher a prova errada (nao
necessariamente a que o onboarding acabou de criar), quebrando CA13 silenciosamente. **Fix:** ao
criar/atualizar a `Prova` do onboarding (task 5.6), **desmarcar `provaAlvo=false` de qualquer outra
`Prova` ativa do mesmo atleta na MESMA transacao** antes de marcar a nova como `provaAlvo=true` —
garante no maximo uma prova-alvo ativa por atleta em todo momento. Sem migration nesta change
(comportamento em codigo, nao constraint de banco); registrar como debito se uma constraint de
banco (indice parcial unico) for desejada no futuro.

## Decisao 9 — Acesso a dado de saude do onboarding

**Corrigido (achado do pre-mortem cross-model rodada 2, 2026-07-20):** a versao original desta
secao dizia "coach responsavel pelo atleta (vinculo de assessoria/coach designado)", sugerindo uma
relacao coach-atleta granular que **nao existe no modelo hoje** — `Atleta` so tem `assessoria` e
`usuario` (`Atleta.java:197-203`), sem campo de coach designado individual. Criar esse vinculo agora
seria escopo novo, fora do que esta change se propoe a resolver.

Campos de lesao/dor/fadiga/sono/recuperacao (onboarding + extensao do feedback pos-treino durante `CALIBRATION`) sao visiveis a: (1) o proprio atleta dono do dado; (2) **qualquer usuario TECNICO/ADMIN do mesmo tenant** — mesmo modelo de acesso ja aplicado ao resto do perfil do atleta no produto hoje (tenant-wide para papeis de coach), sem mecanismo de permissao granular novo. Isso e mais amplo do que "so o coach designado", mas e consistente com o padrao de autorizacao ja usado em todo o resto do produto (`@RequireTenant` + papel, nao vinculo individual coach-atleta) — introduzir um vinculo mais granular fica como debito registrado para change futura, se o founder decidir que e necessario.

## Decisao 10 — Perfil de onboarding NAO duplica campos que ja existem em `Atleta`

**Achado durante a implementacao (2026-07-20):** o design original desta secao (e a migration V61
planejada) assumia uma tabela nova `tb_perfil_onboarding_atleta` com os 11 campos obrigatorios do
formulario. Ao implementar, descobrimos que **7 desses 11 campos ja existem em `Atleta.java`**:
`objetivo` (linha 55), `nivelExperiencia` (59), `diasDisponiveis` (124), `historicoLesoes`/`temLesao`/
`descricaoLesao`/`dataUltimaLesao` (137-146), `volumeSemanalMax` (134, proxy de "volume atual").
Duplicar esses campos numa tabela separada criaria duas fontes de verdade — exatamente o padrao que
a Decisao 8 (`dataProva`/`Prova`) ja rejeitou de proposito nesta mesma change. Se o coach editar
`Atleta` diretamente depois (CRUD ja existente), o registro de onboarding ficaria dessincronizado
silenciosamente.

**Correcao (revisitada em 2026-07-21 — decisao final, substitui a versao anterior desta secao que
escrevia direto em `Atleta` a cada step):** os 7 campos que ja existem em `Atleta` ficam em
staging em `tb_perfil_onboarding_atleta` durante `RASCUNHO`, nao escritos em `Atleta` ate a
conclusao (ver ADR-0002, `apps/menthoros-backend/docs/adr/0002-*.md`). A versao anterior (escrita
direta a cada step) evitava dessincronia com edicoes do coach durante o rascunho, mas trocava por
um risco pior: rascunho abandonado deixa dado parcial permanente em `Atleta`, indistinguivel de
dado completo por qualquer outro fluxo que ja le `Atleta` direto.

**Mitigacao do risco simetrico (coach edita `Atleta` enquanto o atleta esta em rascunho):** na
conclusao do onboarding, comparar `Atleta.atualizadoEm` com o timestamp de inicio do rascunho
(`PerfilOnboardingAtleta.criadoEm`). Se `Atleta` foi modificada depois do inicio do rascunho,
**nao migrar silenciosamente** (last-write-wins errado) — bloquear a conclusao com
`DomainConflictException`, pedindo que o atleta/coach revise os campos antes de confirmar. Custo:
uma comparacao de timestamp, sem lock novo.

`tb_perfil_onboarding_atleta` (V61) encolhe para conter apenas:
- `status` (`RASCUNHO`/`COMPLETO` — o UNICO estado que realmente precisa de um lugar novo para
  existir, ja que "em qual step o atleta esta" nao e um conceito de `Atleta`)
- Os **5 campos genuinamente novos**, sem equivalente em `Atleta` hoje: `maiorTreinoRecente`,
  `duracaoDisponivel`, `restricoes`, `modalidade`, `percepcaoCondicionamento`
- `dataProva` **nao** vai nem para `Atleta` nem para esta tabela — vira uma `Prova` real (Decisao 8),
  mesma logica ja aplicada.
- `preenchido_por_coach` (bonus coach-como-proxy, Decisao 3)

`AthleteOnboardingProfile` (o tipo exposto ao frontend, proposal.md/tasks.md 6.2) passa a ser uma
**composicao** na borda da API: campos de `Atleta` + os 5 campos novos + `status` — nao um espelho
1:1 de uma tabela unica. O endpoint de conclusao (tasks.md 6.0.3) grava em `Atleta` E na tabela nova
na mesma transacao.

## Decisao 11 — Baseline Calculator: formula continua, nao 3 branches separados

**Achado durante a implementacao (2026-07-20):** os "3 cenarios" (A >= 8 semanas direto, B parcial
hibrido, C zero heuristica) sao modelados como uma UNICA formula de interpolacao linear, nao 3
branches de codigo distintos — mesmo padrao ja usado pelo Confidence Scorer (Decisao 3, criterio
"Historico >= 8 semanas... proporcional linear entre 0 semanas (0 pts) e 8 semanas (20 pts, teto)").

```
proporcaoHeuristica = clamp((8 - semanasObservadas) / 8, 0, 1)
ctlFinal = ctlReal * (1 - proporcaoHeuristica) + ctlHeuristico * proporcaoHeuristica
atlFinal = atlReal * (1 - proporcaoHeuristica) + atlHeuristico * proporcaoHeuristica
tsbFinal = ctlFinal - atlFinal
origem   = proporcaoHeuristica > 0 ? ESTIMATED : MEASURED
```

- `ctlReal`/`atlReal`: saida do `TsbService.recalcularHistoricoCompleto` + `MetricasDiariasRepository.findLatestByAtletaId`
  (0.0 se nao houver `MetricasDiarias`, ex.: atleta sem nenhum `TreinoRealizado`).
- `ctlHeuristico`: tabela por `NivelExperiencia` (INICIANTE=25, INTERMEDIARIO=40, AVANCADO=55,
  ELITE=70) — hipotese v1, mesma classe de threshold hardcoded documentado de `planner-rules.yml`,
  calibravel com dado real. `atlHeuristico = ctlHeuristico` (forma neutra, TSB=0 — sem sinal de
  fadiga recente para um atleta sem historico algum).
- `semanasObservadas`: dias entre a atividade mais antiga do historico deduplicado e hoje, /7.

Em `semanasObservadas >= 8`, `proporcaoHeuristica = 0` -> Cenario A (baseline 100% real, `MEASURED`).
Em `semanasObservadas = 0`, `proporcaoHeuristica = 1` -> Cenario C (100% heuristica, `ESTIMATED`).
Valores intermediarios sao o Cenario B (blend, `ESTIMATED`) — nao ha um "modo hibrido" especial
separado, e o mesmo calculo em todo o intervalo.

## Fora de escopo

- Diagnostico medico, recomendacao nutricional, analise biomecanica
- UI de configuracao de regras de onboarding para o treinador
- Importacao em lote de multiplos atletas (planilha)
