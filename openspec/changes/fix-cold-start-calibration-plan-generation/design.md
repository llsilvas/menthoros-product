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
