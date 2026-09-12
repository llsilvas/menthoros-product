# Design — cold-start durante calibração

**Estado:** decisões propostas para revisão; não autorizam implementação nem ativação operacional. Requisitos de aceitação estão no proposal e na spec delta.

## 1. Contexto e evidência

O fluxo local atual é:

`ContextLoader → prompt → IA → normalização/retry → quality warnings → Persister → onboarding/baseline → planner shadow → revisão/calibração → save`

O contexto explícito de onboarding chega quando o plano já foi gerado. `montarContexto` também persiste snapshot, portanto não pode simplesmente ser movido para uma transação marcada como somente leitura. Na calibração semanal, `CalibrationServiceImpl.avaliarSemana` chama novamente o baseline; é necessário rastrear essa segunda entrada para não recriar trabalho removido na primeira.

O trace de produção e o probe demonstram retry estrutural seguido de aceitação de inconsistência. Não demonstram que o aviso de rebuild represente 398 dias de trabalho; no trace de produção sobram 151 ms após esse aviso. Ver [investigation.md](investigation.md).

## 2. Coortes e classificação do histórico

| Estado observado no tenant | Tratamento proposto |
|---|---|
| CALIBRATION, zero treinos e zero métricas | Baseline estimado direto; nenhum rebuild nem série diária sintética. |
| Primeiro plano, mas existem atividades importadas/manuais | Não é histórico vazio; respeitar baseline híbrido/medido vigente. |
| Atividade na primeira semana, semanasObservadas=0 | Não inferir ausência a partir de semanas completas iguais a zero. |
| Sem treinos, mas com métricas antigas | Estado a reconciliar; não aplicar atalho nem descartar métricas em silêncio. |
| Atleta em calibração com dados reais acumulados | Re-baseline e confiança atuais; preservar transições de estágio e saída. |
| Demais atletas, inclusive histórico de 398 dias | Preservar caminho vigente; sem truncamento global nesta change. |

Ausência de plano anterior, de Strava conectado, de check-in ou de métrica na janela recente não prova ausência total. As consultas devem estar vinculadas ao tenant antes de qualquer leitura/escrita. Reutilizar informações já carregadas quando suficientes; não trazer a coleção histórica inteira só para testar existência.

## 3. Baseline sem reconstrução no vazio

Com zero histórico, a fórmula atual dá proporção heurística 1; CTL/ATL finais dependem somente da tabela por nível e origem ESTIMATED. A change preserva essa fórmula e seus valores vigentes; não recalibra fisiologia.

Separar a necessidade de manter métricas da necessidade de consumir um baseline. No caso realmente vazio:

1. Confirmar ausência de treinos e métricas no tenant.
2. Obter baseline estimado, confiança e política existentes.
3. Manter a inicialização/consistência de metadados e invalidação de cache que hoje ocorre no ramo vazio de `TsbServiceImpl`, sem invocar uma reconstrução histórica.
4. Persistir apenas o snapshot de onboarding pertinente. Não preencher dias fictícios nem marcar estimativa como medida.

A mesma regra vale para a entrada semanal de calibração. Re-baseline significa reavaliar com os dados disponíveis; não exige reconstruir toda a série a cada chamada. Evitar recomputar duas vezes a mesma decisão no ciclo, preservando efeitos necessários da avaliação semanal.

Para histórico existente, atualização incremental desde o primeiro dado alterado (`recalcularDesde`, já usado pela ingestão) e reaproveitamento de métricas válidas são direções posteriores, condicionadas à consistência. Não implementar aqui corte de dias nem seed zero arbitrário: CTL/ATL dependem do estado anterior, e alterações retroativas/remoções mudam o intervalo afetado. Caso se descubra dependência indispensável de uma reformulação ampla, registrar split antes de ampliar o escopo.

## 4. Snapshot anterior à IA e fronteiras transacionais

Fluxo proposto:

`carregar dados + resolver onboarding em transações curtas → snapshot de calibração → restrições determinísticas → prompt → IA/validação/retry limitado → transformações finais → check final → persistir para revisão`

- O snapshot deve carregar somente os valores necessários: referência temporal, identificação vinculada ao tenant, origem do baseline, confiança/política, fase/estágio e restrições. Reutilizar records de domínio adequados; não enviar entidades JPA ao núcleo do planner.
- Resolver data de referência e semana uma vez. Prompt, elegibilidade, checks e persistência não devem divergir ao cruzar meia-noite.
- O mesmo snapshot governa a requisição; não recalcular silenciosamente outra política depois da IA.
- Operações de onboarding que escrevem usam transação curta de escrita, fora da chamada externa. Não transformar `ContextLoader` inteiro em transação longa nem fazer HTTP segurando locks.
- O snapshot válido de onboarding pode continuar existindo se a IA falhar: ele não é um plano gerado. Não publicar aprovação/exportação, salvar plano parcial ou consumir revisão semanal de plano que não foi salvo.
- Preservar a rechecagem de plano ativo na persistência e a restrição única vigente. Se houver alteração concorrente relevante para elegibilidade/restrições, definir uma verificação de validade do snapshot no limite de escrita e falhar de forma consistente, sem novo ciclo oculto de IA. A solução concreta depende dos mecanismos de versão já disponíveis; não propor migration por hipótese.

## 5. Calibração como restrição efetiva

Reutilizar as regras de confiança, progressão e estágio já existentes. O cenário C usa revisão bloqueante e progressão zero; não confundir ausência de progressão com proibição de qualquer volume inicial estimado.

Reutilizar o planner/checkers e seus valores determinísticos para governar a geração da coorte, com renderização das restrições no prompt e validação de saída. Não criar outra tabela de limites, outro algoritmo de distribuição nem gerador universal de intervalados nesta change.

O estado CALIBRATION não implica, por si só, que qualquer intervalado seja proibido. Tipos/intensidades elegíveis devem vir da política de produto aprovada para fase, estágio e dados disponíveis. Falta de readiness não pode ser convertida em readiness positiva nem medida inexistente em limiar conhecido. Lacunas de regra precisam ser resolvidas na revisão, sem inventar prescrição.

## 6. Invariantes, fonte de verdade e normalização

Separar regras obrigatórias de recomendações. O mínimo recomendado de distância de um contínuo, por exemplo, não se torna erro universal só por aparecer em WARN.

| Dimensão | Contrato proposto |
|---|---|
| Unidades e valores | Duração e distância válidas para o tipo, positivas quando exigidas, finitas e em unidades explícitas; não aceitar parse inválido como zero silencioso. |
| Etapas | Tipos, ordem e repetições coerentes com a prescrição; expansão não duplica repetições já expandidas. |
| Totais | Derivar/verificar duração e distância a partir das etapas canônicas após normalização; nenhuma alteração posterior pode deixar o resumo desatualizado. |
| Pace contínuo/longo | Validar relação entre ritmo da sessão, distância e tempo conforme semântica e tolerância aprovadas. |
| Pace intervalado | Distinguir pace do esforço de média global incluindo recuperação/aquecimento; validar etapas e agregado apropriado. |
| Regras de calibração | Plano final obedece às restrições obrigatórias da política do snapshot. |

Tarefa 1.3 documenta a matriz por tipo (campo autoritativo, arredondamento, tolerância, ausência permitida, recomendação versus bloqueio). Não copiar os 20% do logger como tolerância universal. Testes devem cobrir os limites aprovados e vizinhos, mais null/zero/negativo/não finito quando representáveis.

Aplicar reparos determinísticos existentes quando houver interpretação inequívoca e sem alterar a intenção do treino. Repetir a normalização deve ser idempotente. Ambiguidade residual obrigatória reprova a resposta; não inventar outro treino silenciosamente.

Dois pontos de verificação:

1. **Antes da redistribuição**, dentro do callback de validação da resiliência: normalizar, validar estrutura e política aplicável; falha recuperável usa a tentativa restante.
2. **Após todas as transformações finais**, sobre o plano que será salvo: rever invariantes afetadas (etapas/totais/dias/restrições). Falha terminal sem retry ou persistência parcial. Esse check precisa ver o resultado de redistribuição e inclusão de prova, quando aplicáveis, e não apenas o DTO original.

## 7. Retry, orçamento e erro terminal

Reutilizar `PlanoResilienceService`, com uma geração inicial e no máximo uma nova geração. Não adicionar retry paralelo em checker, persister ou fallback legado.

O código atual tem `DEADLINE_TOTAL=100s`, checado **antes de iniciar a segunda tentativa**. Isso não é cancelamento de chamada em voo nem teto garantido de 100 s para a requisição. Preservar a proteção e descrevê-la corretamente; timeout efetivo global depende de decisão separada, não é solução presumida para o trace de 70,6 s.

| Resultado | Ação para invariantes obrigatórias da coorte |
|---|---|
| Primeira resposta válida | Prosseguir ao check final. |
| Primeira inválida e retry permitido pelo orçamento | Uma nova geração com feedback objetivo e sanitizado. |
| Orçamento esgotado ou segunda resposta inválida | `DomainRuleViolationException`, HTTP 422, sem plano. |
| Transformação final introduz violação | 422 sem retry nem plano parcial. |
| Erro de transporte/provedor | Preservar tratamento de infraestrutura; não fingir falha de prescrição. |

As duas tentativas contam gerações lógicas no orquestrador. Retentativas HTTP internas do cliente/provedor não foram auditadas; observabilidade deve distingui-las quando disponíveis. Não afirmar que o teto limita todo tráfego de rede subjacente.

## 8. Compatibilidade com changes relacionadas

| Tema | Change relacionada | Resolução proposta nesta change |
|---|---|---|
| Skeleton antes do LLM e compliance | `planner-engine-enforcement` | Um ponto de integração e mesmos colaboradores; decidir propriedade/sequência na tarefa 1.2. |
| Fail-open salva FAILED | `planner-engine-enforcement` | Invariantes obrigatórias da calibração falham fechado; aprovação manual não torna estrutura inválida aceitável. Precedência depende de revisão conjunta. |
| Retry esgotado chama legado inteiro | `planner-engine-enforcement` | Nenhum novo ciclo de geração para esta coorte após duas tentativas. Conflito explícito a reconciliar. |
| Flag off preserva legado byte a byte | CA9 de `planner-engine-enforcement` | A proteção cold-start muda comportamento da coorte; fechar matriz de ativação sem prometer equivalência byte a byte nessa combinação. |
| Decomposição sem mudar comportamento | `refactor-iaservice-decomposition` | Usar colaboradores extraídos se disponíveis; não misturar correção comportamental com movimento mecânico. |

Não modificar automaticamente a outra change, não ligar flags e não contornar seus gates de rollout. A aprovação da integração deve registrar o que cada change entrega. O caminho vazio do baseline pode ser implementado de forma isolada após revisão; a integração de enforcement depende das decisões abaixo.

### Decisões de precedência e sequência (2026-09-08, fecham a Open Question 3 e a tarefa 1.2)

Fechadas com o dono do produto após o DoR (spec-reviewer + Codex), que marcaram estas como blockers:

1. **Precedência — fail-closed sempre nas invariantes obrigatórias.** Quando um plano cold-start viola
   uma invariante **obrigatória** (estrutura, aritmética de etapas/totais, semântica de pace) após os
   reparos, o sistema **falha fechado (422) e não persiste**, **independente** do `planner-engine.fail-open`
   estar ligado. Aprovação manual não torna estrutura inválida aceitável; plano estruturalmente quebrado
   não vale revisão. Consequência: o cenário "Stage 2 fails with fail-open on → persiste FAILED" do
   `planner-engine-enforcement` **não se aplica** às invariantes obrigatórias desta coorte — só a
   violações *não-obrigatórias* (soft). A fronteira obrigatória × soft sai da matriz da tarefa 1.3 (CA5).
2. **Sequência/propriedade — `planner-engine-enforcement` primeiro.** Ele é o **dono** do gate de
   compliance, do flag e do orçamento de gerações; entra antes. Esta change **assenta sobre** esse gate,
   adicionando as invariantes obrigatórias que falham fechado, e **reusa o orçamento único** dele (não
   cria um segundo contador). Enquanto o enforcement não estiver mergeado em `develop`, as seções de
   código desta change (2+) ficam **bloqueadas**; só o caminho de baseline vazio (seção independente)
   poderia ser adiantado, se desejado.
3. **Orçamento único (deriva de 2).** O contador/relógio de "no máximo 2 gerações lógicas por
   requisição" pertence ao gate do enforcement; esta change **consome** desse orçamento (tentativa
   debitada **antes** da chamada à IA, não depois da resposta), sem reiniciá-lo. Detalhe operacional a
   fechar junto com a implementação do enforcement.

## 9. API, revisão, persistência e segurança

- Manter sucesso da rota `POST /api/v1/planos/atletas/{atletaId}/gerar` e DTOs públicos existentes.
- A falha terminal usa o contrato atual do handler: status HTTP 422 e corpo com `status`, `error`, `message`. Não migrar para outro envelope incidentalmente.
- Planos válidos de baixa confiança ficam `AGUARDANDO_REVISAO`; consulta de aprovados continua excluindo-os e não há autoaprovação/exportação decorrente da geração.
- Autorização, escopo de tenant, duplicidade de plano ativo e contrato de conflito existentes são preservados.
- Não editar migrations aplicadas. Nenhuma migration está prevista; se necessária, revisar escopo e criar nova migration.

## 10. Observabilidade e validação de desempenho

Instrumentar duração e resultado das etapas: contexto, baseline, geração por tentativa, validação prévia, transformações/check final e persistência. Distinguir requisição de geração, tentativa e reconstrução; correlacionar com trace sem colocar IDs pessoais em labels de métricas.

Registrar coorte, motivo categorizado do retry/rejeição, quantidade de tentativas e intervalo/dias realmente reconstruídos. No vazio, registrar caminho vazio e zero dias; emitir aviso de rebuild custoso apenas quando existir intervalo real. Não registrar prompt, dados de saúde ou payload integral nos logs.

Métrica de qualidade: zero violações obrigatórias aceitas no corpus aprovado. Métrica de experiência: taxa de edição por defeito de consistência, latência p50/p95 e retry, acompanhadas de sucesso e 422 para não apresentar aumento de rejeições como melhora de qualidade. Baseline e meta operacional pendentes na tarefa 1.5.

## 11. Riscos e pré-mortem inicial

| Falha prevista | Mitigação/validação |
|---|---|
| Remover rebuild e anunciar solução para 70,6 s | Medir etapas; trace mostra atraso anterior ao rebuild. |
| Tornar todo WARN bloqueante e aumentar retries | Matriz de obrigatoriedade por tipo; medir retry e 422 junto com sucesso. |
| Rejeitar intervalado válido pelo pace do tiro | Teste de sessão com ritmos diferentes e agregado ponderado apropriado. |
| Atividade de ontem cair em histórico vazio | Teste com semanasObservadas=0 e lista não vazia. |
| Snapshot e política divergirem após chamada longa | Mesma data/contexto e checagem concorrente antes da escrita. |
| Rebuild reaparecer pela avaliação semanal | Verificar todos os callers do baseline e contagem por ciclo. |
| Novo fluxo ignorar revisão, tenant ou duplicidade | Testes negativos de tenant, visibilidade, eventos e concorrência. |
| Fail-open/retry de outra change anular proteção | Matriz conjunta aprovada antes da integração. |

Esta análise inicial não substitui o pré-mortem e as revisões de qualidade previstos pela trilha Full. A evidência dessa etapa permanece pendente nas tasks.

## 12. Estratégia de entrega

1. Revisar investigação, regras e sobreposições; registrar decisões pendentes.
2. Implementar e testar o caminho vazio de baseline, preservando os demais estados.
3. Integrar snapshot/restrições e validação em dois pontos com resiliência limitada.
4. Cobrir contratos, persistência, tenant e regressões; executar os gates Maven.
5. Validar em ambiente de teste com dados sintéticos, medir coortes e registrar plano de ativação/reversão. Reversão não deve disponibilizar planos inválidos já rejeitados nem alterar o gate do coach.

Não reparar dados de produção automaticamente. Eventual identificação/reparo de planos existentes requer escopo próprio, com inventário e revisão do treinador.

## 13. Matriz de invariantes por tipo de treino — RASCUNHO (fecha a tarefa 1.3 / CA5)

> Rascunho ancorado no código real (`IaServiceImpl.validarENormalizarPlanoGerado` e colaboradores;
> paths e linhas confirmados por exploração 2026-09-08). **Requer aprovação de produto** nos pontos
> marcados ⚠️ antes de virar oráculo de teste.
>
> **Relação com `planner-engine-enforcement` (dona do gate, entra ANTES):** o **baseline obrigatório**
> (estrutura de etapas por tipo, repetições=1 — o que já lança `LLMException` hoje) é definido e
> aplicado **lá**. Esta §13 é a **EXTENSÃO**: promove a obrigatório checks que hoje são só WARN
> (triângulo pace×distância×duração, soma-etapas×distância) — é aqui que mora o "novo", e é o que
> precisa das decisões ⚠️ de produto. Sem circularidade: o enforcement não depende deste rascunho.

### 13.1 Fontes de verdade e unidades (do código, não negociável)

- **Duração do treino** = **soma das durações das etapas** (override do LLM em `IaServiceImpl:487-498`,
  `somarDuracoesMin`). Entidade persiste `duracaoMin` como `Duration`; DTO LLM manda String "mm:ss".
- **Distância do treino** = **reconciliada com a soma das etapas** quando desvio > **10%**
  (`reconciliarDistanciaComEtapas:686`, substitui `distanciaKm` pela soma).
- **Pace (`ritmoAlvo`)** = **min/km** (mm:ss/km), intervalo "5:00-5:30/km" (`PaceValidator` regex :27).
  Pace da **etapa/tiro** (`EtapaTreinoLlmDto.ritmoAlvo`) é distinto do pace **da sessão**
  (`TreinoPlanejadoLlmDto.ritmoAlvo`) — CA5 exige não confundir os dois.
- **TSS** vem do LLM/`fatorImpacto` do `TipoTreino`, **não** é derivado das etapas (não incluir no
  invariante aritmético de etapas nesta change).
- Enum real: `TipoTreino` = REGENERATIVO, INTERVALADO, CONTINUO, LONGO, TIRO, FARTLEK, TEMPO_RUN,
  FACIL, SUBIDA, PROVA, DESCANSO. Etapas: AQUECIMENTO, PRINCIPAL, INTERVALADO, RECUPERACAO,
  DESAQUECIMENTO. (TEMPO → `TEMPO_RUN`; "tiro" é etapa `INTERVALADO`, não etapa própria.)

### 13.2 Matriz — hoje (bloqueante × warning) e proposta cold-start

| Tipo | Estrutura de etapas | Hoje | Proposto cold-start (obrigatória=fail-closed) |
|---|---|---|---|
| INTERVALADO / TIRO | ≥ **6** etapas; inicia AQUECIMENTO, termina DESAQUECIMENTO; \|tiros−recuperações\|≤1; recuperação só após tiro; tiro 0,3–10 min | **bloqueante** (`validarTreinoIntervalado:1196`) | **obrigatória** (manter). ⚠️ Corrigir o bug 6/8: gate real é `<6` (`:1209`), mas log diz "mínimo 8" e exceção diz "mínimo 6". **Padronizar em 6** (implementado) e alinhar textos; subir para 8 é decisão de produto à parte. |
| REGENERATIVO / CONTINUO / TEMPO_RUN / LONGO | **3** etapas AQUEC→PRINCIPAL→DESAQUEC (LONGO: só conta 3, sem exigir ordem) | **bloqueante** (`validarEstrutura3Etapas:1407`) | **obrigatória** (manter) |
| FARTLEK / FACIL / SUBIDA / PROVA / DESCANSO | sem validação estrutural | nenhuma (`default → empty`) | **manter sem estrutura obrigatória** (⚠️ confirmar que PROVA/SUBIDA não precisam de piso) |
| Todos | `repeticoes == 1` por etapa (repetição vai em `blocoRepeticoes`) | **bloqueante** (`validarRepeticoes:1440`) | **obrigatória** (manter) |

### 13.3 Invariantes aritméticos/pace — a mudança central (hoje WARN → propor OBRIGATÓRIA)

O plano quebrado de 70,6 s passou porque estes são **apenas warning** hoje:

| Invariante | Regra/tolerância no código | Hoje | Proposto cold-start |
|---|---|---|---|
| Triângulo pace×distância×duração | `duracaoEsperada = paceMedia × distanciaKm` vs `duracaoMin`; desvio > **20%** (`validarTrianguloPaceDuracaoDistancia:1486`) — é o "~71%" do incidente (valor de runtime, não constante) | **WARN** (não corrige) | ⚠️ **OBRIGATÓRIA** após reparos, com tolerância a fechar por tipo (20% é o default atual; propor 15% p/ contínuos, mais folga p/ intervalado por causa da mistura de paces) |
| Soma das etapas × distância planejada | tolerância **0,5 km** (intervalado `:1339`); reconciliação global a **10%** (`:705`) | WARN + reconciliação silenciosa | ⚠️ obrigatória **após** a reconciliação (a reconciliação é a fonte de verdade; o que sobra fora da tolerância é violação) |
| Pace do tiro dentro do teto/piso por tipo | `PaceValidator.validar` corrige deslocando o intervalo; piso absoluto 0:30/km | corrige silenciosamente | manter correção; ⚠️ obrigatória só se a correção não conseguir trazer para a faixa |
| Distribuição de carga (duros em dias consecutivos) | `validarDistribuicaoCargaSemanal:1599` | WARN | **manter soft** (é recomendação de qualidade, não estrutura) |
| `PlanQualityChecker` (INTERVALADO_PROIBIDO, PACE_TETO, DIAS_PERMITIDOS, MAX_CONSECUTIVOS) | gera `ViolacaoQualidade` + métrica, **não** dispara retry | soft/offline | **manter soft** (revisão do coach), exceto onde coincidir com invariante obrigatória acima |

### 13.4 Pontos que exigem decisão de produto (⚠️) antes de codificar 4.x

1. Tolerância do triângulo por tipo (default 20% vira quanto para cada `TipoTreino`?).
2. Padronizar o gate de etapas do intervalado em **6** (implementado) vs subir para 8.
3. PROVA/SUBIDA/FARTLEK/FACIL seguem sem estrutura obrigatória? (hoje seguem.)
4. Quais WARNINGS de 13.3 sobem para **obrigatória (fail-closed)** — a lista proposta é o mínimo para
   fechar o incidente; ampliar é opcional.

Fechados 1–4, a task 1.3 fica pronta e as regressões 4.1–4.2 ganham oráculo (fixtures válidas/inválidas
nos limites de cada tolerância).

## 14. Modelo de carga do cold-start e RECOVERY (grilling 2026-09-12, evidência de piloto) — ADR-0012

Fecha as decisões que o piloto local (`enabled=true`, atletas zerados) expôs no `LoadTargetResolver`.
Números canônicos e justificativa no **ADR-0012**; aqui o contrato para as tasks. Tudo atrás do flag
`planner-engine.enabled`; carga/distribuição já são **soft** (estágio 2) por `planner-engine-enforcement`.

**14.1 Regime cold-start (ativo enquanto o atleta está EM calibração — stage até graduar).**
- CTL usado = o do `BaselineCalculator` (blend real+heurística), **capado a ≤ 40** até graduar.
- Rampa por `CalibrationStage`: `OBSERVATION 0,60 · CALIBRATION 0,75 · STABILIZATION 0,90`.
- `targetTss = min(ctlBaseline, 40) × 7 × rampa(stage) × (RECOVERY|POST_RACE ? 0,5 : 1)`.
- Piso 120 TSS/sem **só em fase progressiva** (não em contenção).
- Banda **±25%** no cold-start (vs ±10%), soft.
- Saída: graduou → `LoadTargetResolver` normal (PMC `ctlAtual`, ±10%, sem rampa/cap).
- Gatilho do regime = **estar em calibração** (não "sem PMC"): durante a calibração usa o baseline
  blendado (PMC imaturo suavizado pela heurística), direção conservadora. Ver ADR-0012, opção (b).

**14.2 Redução de RECOVERY/POST_RACE (transversal, qualquer causa).** Fator **×0,5** no
`LoadTargetResolver` para essas fases — reduz, não só capa no baseline. Distinto do `TaperStrategy`
(taper por `diasParaProva`); multiplicativo com a rampa. Sem piso em contenção.

**14.3 Ordenação no `PROXIMA_SEMANA`.** Com `enabled=true`, a redistribuição/`SessionDayAllocator`
roda em **ambos** os modos (hoje só `SEMANA_ATUAL`), aplicando a ordem prescrita (longão ancorado,
duras não-adjacentes, leve pós-dura) via `diasAlvoPorTipo` do skeleton. `enabled=false` mantém os dias
do LLM (preserva CA9).

**14.4 Plumbing.** Threadar `CalibrationStage` + o CTL de calibração (baseline capado) ao
`OnboardingContext`/`PlannerInputSnapshot`, resolvidos antes do prompt (§4). O `ctlFallback` já
introduzido (commit `463b0c8`, branch de calibração) vira este "CTL de calibração", ajustado para o
baseline capado em vez do onboarding puro.

**14.5 Interação com o enforcement.** Após 14.1–14.3, o cold-start com plano coerente vira `PASSED`;
divergência residual continua `FAILED` + `requiresCoachReview` (soft), nunca 422. Calibração fina dos
números (rampa, cap, ×0,5, banda) é dirigida pelas métricas do shadow na porta 1 do rollout (ADR-0012,
plano de revisão).
