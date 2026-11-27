# Feature Radar (CPO)

> Fila de candidatas a feature. **Não é roadmap**: o Radar oficial é `openspec/SPRINTS.md` e só o founder escreve nele.
> Pontuação: `ROI = impacto (1–5) × confiança (0–100%) ÷ esforço (1–5)`. Confiança sempre rastreável a evidência; sem evidência, o item é hipótese e a confiança cai para 30%.
> Baldes: Fazer agora / Fazer em seguida / Experimentar depois / Não fazer agora.
> Criado em 2026-11-21 (primeira execução do cron). Última atualização: 2026-11-27.

## Resumo (ordenado por ROI)

| Candidata | Balde | ROI | Status | Criada | Último reforço |
|---|---|:---:|:---:|:---:|:---:|
| Minutos de revisão por atleta (abertura → decisão) | Fazer agora | 3,40 | nova | 2026-11-27 | 2026-11-27 |
| Saúde da temporada por assessoria (rollup do macrociclo) | Experimentar depois | 1,30 | reforçada | 2026-11-21 | 2026-11-27 |
| Atleta sem canal de ingestão na fila de atenção | Fazer agora | 1,20 | nova | 2026-11-21 | 2026-11-21 |
| Relatório de aderência ao método do coach | Fazer em seguida | 1,05 | nova | 2026-11-27 | 2026-11-27 |
| Registro do delta de edição por etapa (o que o coach mudou) | Fazer em seguida | 0,93 | nova | 2026-11-21 | 2026-11-21 |
| Plano-modelo por coorte (replicar a semana aprovada) | Experimentar depois | 0,50 | nova | 2026-11-27 | 2026-11-27 |

---

## Fichas

### 1. Minutos de revisão por atleta (abertura → decisão)

**Problema.** A métrica do North Star — minutos de revisão por atleta por semana, ratificada em 2026-11-20 — não é medida. `SugestaoCoach` grava `reviewedAt` (quando o coach decidiu), nunca o instante em que ele abriu a sugestão. Sem o intervalo abertura → decisão, todo ganho de tempo que o produto promete é opinião: não se sabe se o coach gasta 40 segundos ou 4 minutos por atleta, nem se a fila de atenção está reduzindo ou aumentando esse tempo conforme cresce.

**Evidência.**
- `artifacts/cpo-weekly/2026-11-23.md` §8.1: proposta explícita, "a métrica foi ratificada em 20/11 mas segue não medida", ROI 5 × 80% ÷ 1 = 4,0; §5 registra "nenhuma change cobre a medição do próprio North Star".
- Código (`/workspace/apps/menthoros-backend`, `develop`, verificado 2026-11-27): `entity/SugestaoCoach.java:63-93` tem `createdAt`, `reviewedAt`, `reviewedBy`, `rejectionReason`, `summaryOriginal`, `editadoPeloCoach`, `editedAt`, `versao` — nenhum campo de abertura. `CoachSugestaoController` já expõe `GET /api/v1/coach/sugestoes/{id}` (`:66`), que é o call natural de "abrir a sugestão": o ponto de captura existe, falta a coluna.
- `knowledge/product/north-star.md:42-47` (proxy abertura → revisão já apontado no próprio documento, segundo a auditoria de 11-23).

**Eixo North Star.** Tempo do coach (critério 1) e qualidade das decisões (2). Compass: **Enabler** — mede o gate de todos os outros itens; sem ela, nenhuma candidata de "economiza tempo" pode ser provada.

**Métrica do momento.** É a própria métrica do North Star (minutos por atleta por semana), com o par de controle: aderência do atleta igual ou melhor. Mecanismo: instrumentar o intervalo abertura → decisão permite comparar semanas e medir o efeito de cada entrega da fila.

**ROI: 4 × 85% ÷ 1 = 3,40.**
- Impacto 4: não muda a vida do coach diretamente, mas é a condição para provar e ordenar todo ganho de tempo; efeito forte e direto na métrica primária.
- Confiança 85%: código verificado hoje (ausência do campo e presença do endpoint de detalhe) + documento do North Star + auditoria semanal convergindo na mesma lacuna.
- Esforço 1: uma coluna anulável, sem backfill, carimbada no `GET /{id}` que já existe; sem endpoint novo, sem tela nova.

**Porta.** Two-way (coluna anulável; desligar não perde dado histórico de decisão).

**Menor teste (≤3 dias).** Carimbar `openedAt` no `GET /{id}` em `develop` e conferir, na sessão de revisão de uma assessoria fundadora, se o intervalo medido bate com o que o coach relata. Caveat a fechar no teste: se o coach decide pela lista sem abrir o detalhe, o intervalo fica nulo e a instrumentação precisa carimbar também na listagem.

**Critério de morte.** Em 2 semanas de uso real, mais de 60% das decisões sem `openedAt` (o coach decide pela lista) e o intervalo não reproduz o relato dele: a instrumentação mede o clique, não a revisão. Voltar à prancheta antes de expor a métrica.

**Balde.** Fazer agora.

---

### 2. Saúde da temporada por assessoria (rollup do macrociclo)

**Problema.** Com o plano de temporada no ar, quem decide é o dono da assessoria, e ele abre atleta por atleta para descobrir quem está desviando do próprio macro. Desvio acumulado e marcos em risco só aparecem quando já viraram problema semanal.

**Evidência.**
- `artifacts/cpo-weekly/2026-11-16.md` §8.1: proposta original, impacto 4 × confiança 55% ÷ esforço 2 = 1,1, Core. §6.1: o épico estava em código sem linha de sprint.
- **Reforço de 2026-11-27.** `openspec/SPRINTS.md:5-21`: `add-season-plan-start-volume` arquivada em 11-26 e `add-season-plan-load-enforcement` em 11-25 — com `season-plan.enforcement.enabled`, a temporada ACTIVE vira base e teto da carga semanal, com `LONGAO_DIVERGENTE_DA_TEMPORADA` a ±15% e "delta da aprovação em métrica"; 9 de 10 tickets do épico entregues (resta o replanejamento, que depende de 1 ciclo no piloto com a flag ligada).
- Código (verificado hoje, `develop`): `V119__add_season_week_to_plano_semanal.sql` grava `season_week_id` e `target_deviation_pct` = (TSS planejado − `target_tss` da semana) / `target_tss` × 100 em `tb_plano_semanal`. O desvio por semana já está materializado; o rollup é leitura agregada, não cálculo novo.
- `artifacts/cpo-weekly/2026-11-23.md` §5 e a revisão técnica de 11-23: 40 dos 69 commits da semana são `season-plan`/`plano`.
- **Ressalva honesta:** o reforço é de **viabilidade** (o dado existe e está por semana), não de demanda. Nenhum coach pediu o painel; a evidência de demanda segue sendo a auditoria CPO de 11-16.

**Eixo North Star.** Escala sem perder personalização (critério 3) + risco e progresso visíveis (4). Compass: **Core**, direções 1 e 3.

**Métrica do momento.** Retenção de coach (renovação da assessoria) e tempo do coach, pelo mecanismo de uma tela substituir N drilldowns antes da revisão semanal.

**ROI: 4 × 65% ÷ 2 = 1,30** (era 1,10 em 2026-11-21).
- Impacto 4: move escala e risco visível para o decisor econômico (o dono), efeito plausível na retenção do contrato.
- Confiança 65% (era 55%): a viabilidade subiu muito — o desvio por semana está gravado em `tb_plano_semanal` desde a V119, verificado hoje. A demanda continua sem sinal de coach, por isso não passa de 65%.
- Esforço 2: leitura agregada sobre `tb_plano_semanal` (`target_deviation_pct`, `season_week_id`) + `tb_season_week`; nenhum modelo novo.

**Porta.** Two-way (leitura agregada).

**Menor teste (≤3 dias).** Com a flag ligada em uma assessoria fundadora, montar o rollup à mão em planilha por 2 semanas e observar se o dono abre antes da revisão semanal e age em cima de 1 atleta.

**Critério de morte.** Dono não abre a planilha em 2 semanas seguidas, ou abre e não age: morre como relatório que ninguém lê.

**Balde.** Experimentar depois (bloqueada pela flag `season-plan.enabled`, default `false`, e pelo ticket 10 do épico).

---

### 3. Atleta sem canal de ingestão na fila de atenção

**Problema.** O treinador não sabe quais atletas estão cegos no sistema. Atleta com canal `MANUAL` (ou Garmin não conectado) não tem atividade ingerida, logo não tem métrica diária, logo não entra no loop de progresso. E a fila de atenção, em vez de dizer "este atleta não tem canal", entrega `INATIVIDADE` e `ADERENCIA`: o coach lê "sumiu" quando o problema é de canal. Ele gasta decisão em cima de um dado que não existe, e o atleta certo não recebe a ligação.

**Evidência.**
- `artifacts/cpo-weekly/2026-11-09.md` §8.1 (fora da caixa): "Atleta sem canal de ingestão como sinal na fila de atenção", ROI 1,2 estimado. Recomendação viva desde 11-09.
- `knowledge/product/strategic-compass.md:76` (guardrail de dados): o onboarding deve empurrar watch direto → intervals.icu "and flag stub-only athletes to the coach". A regra existe, o sinal não.
- Código (`/workspace/apps/menthoros-backend`, `develop`), reverificado em 2026-11-27: `enums/MotivoAtencao.java:16-21` traz FADIGA, SEM_PLANO, ADERENCIA, INATIVIDADE (entre outros) e nenhum motivo cobre ausência de canal; `enums/CanalIntegracao.java` já persiste `MANUAL`/`INTERVALS_ICU`/`GARMIN` no onboarding, então o dado de entrada existe.
- Contexto (não é reforço): `openspec/SPRINTS.md:2723` mostra `add-retention-radar-lite` no Radar com 1/28 tasks, que adiciona o 7º motivo `RISCO_RETENCAO` à mesma fila — o padrão "motivo novo em `SinalAtencao`" já está aprovado e em execução, embora seja outro motivo.

**Eixo North Star.** Risco e progresso visíveis (critério 4). Compass: **Core**, direção 1 (exception-first coaching).

**Métrica do momento.** Ativação na semana 1 (quantos canais o coach conecta na primeira sessão) e retenção de atleta, pelo mecanismo de o atleta sem canal nunca entrar no PMC nem no loop de progresso.

**ROI: 4 × 60% ÷ 2 = 1,20.** Sem mudança em 2026-11-27 (nenhuma fonte desta coleta trouxe sinal novo).
- Impacto 4: corrige um sinal que hoje mente na fila e move o eixo de risco visível; não é 5 porque não ataca o delta nem a decisão em si.
- Confiança 60%: guardrail escrito no compass + achado repetido do CPO weekly, sem ainda um coach pedindo na semana.
- Esforço 2: reusa `SinalAtencao`/`CoachAttentionSignalEvaluator` e `CanalIntegracao`; é motivo novo na fila existente, front mínimo.

**Porta.** Two-way (sinal novo, sem schema novo).

**Menor teste (≤3 dias).** Rodar a query manual de atletas cujo último registro veio por canal manual ou por nenhum nas últimas 4 semanas e mandar a lista ao founder de uma assessoria fundadora. Medir se ele age na semana (conecta canal ou fala com o atleta).

**Critério de morte.** Em 2 semanas, zero canal conectado e nenhuma mensagem enviada a partir da lista: a dor é nossa, não do coach. Não construir o motivo na fila.

**Balde.** Fazer agora.

---

### 4. Relatório de aderência ao método do coach

**Problema.** O coach não tem como saber onde o motor não fala a língua dele. Ele edita, edita de novo, e a informação de que aquilo é padrão (e não caso isolado) morre na semana. O guardrail da bússola exige que "% aceito sem edição" nunca seja reportado sozinho, sempre pareado com desfecho — hoje ele não é reportado de forma alguma, nem pareado nem solto.

**Evidência.**
- `knowledge/product/strategic-compass.md:96-97`: "The coach decision log (accepted / edited / rejected + diff) is a non-negotiable Enabler" e "'% accepted without edit' is never reported alone — always paired with an outcome signal (adherence, injury, race result)".
- Código (verificado hoje, `develop`): os campos para a leitura agregada existem — `status` (PENDING/APPROVED/REJECTED), `editadoPeloCoach`, `reviewedAt`, `summaryOriginal` e `summary` em `SugestaoCoach.java:44-93`; aderência e carga vêm de `tb_plano_semanal`/`tb_metricas_diarias`. Não há endpoint nem tela que agregue isso por coach.
- `references` do compass, direção 2 (copiloto que aprende cada coach): a leitura é o insumo mínimo para qualquer aprendizado real.

**Eixo North Star.** Qualidade das decisões (critério 2). Compass: **Core**, direção 2.

**Métrica do momento.** % de `WeekSuggestion` aceito sem edição (tendência de alta) pareado com aderência do atleta, por família de treino — mecanismo: o coach vê onde o motor erra para ele e corrige o método na origem, não treino a treino.

**ROI: 3 × 70% ÷ 2 = 1,05.**
- Impacto 3: melhora a qualidade de decisão do coach sobre o próprio motor, sem link causal direto com retenção.
- Confiança 70%: guardrail escrito na bússola (fonte primária) + campos verificados hoje no código; falta evidência de coach.
- Esforço 2: agregação sobre colunas existentes + uma tela de leitura; sem schema novo.

**Relação com a candidata 5.** Não duplica: a 5 estrutura o **diff** de cada edição (schema novo, one-way); esta lê as **flags já gravadas** e entrega o agregado sem tocar o modelo. A 5 é a condição para a leitura fina; esta é o que dá para entregar hoje.

**Porta.** Two-way (leitura pura).

**Menor teste (≤3 dias).** Exportar as sugestões de 4 semanas de uma assessoria fundadora e montar a tabela à mão: % aceito sem edição por família de treino, ao lado da aderência da mesma semana. Mostrar ao coach e ver se ele reconhece o padrão e nomeia uma causa.

**Critério de morte.** O coach olha a tabela e não reconhece nenhum padrão ("edito caso a caso") em 2 de 3 leituras: o delta não é método, é ruído. Arquivar junto com a candidata 5.

**Balde.** Fazer em seguida.

---

### 5. Registro do delta de edição por etapa (o que o coach mudou)

**Problema.** O moat declarado é o delta: a diferença entre o que a IA sugeriu e o que o treinador decidiu. Hoje só sobra um resumo. `SugestaoCoach` guarda `summaryOriginal`, `editadoPeloCoach`, `editedAt` e `versao`, mas a edição em si (etapa, distância, pace, dia) sobrescreve a linha e não vira diff. Cada semana sem log é dado de método que não volta: não dá para dizer "este coach sempre corta o longão em 20%" nem "sempre troca tiro de 800 por 1000".

**Evidência.**
- `knowledge/product/strategic-compass.md:93-94`: "The coach decision log (suggestion accepted / edited / rejected + diff) is a non-negotiable Enabler: every week without it is lost moat data." Guardrail escrito, ainda não honrado no dado.
- Código (`develop`), reverificado em 2026-11-27: `entity/SugestaoCoach.java:81-93` tem `summaryOriginal` e a flag de edição; busca por entidade/tabela de auditoria de edição em `src/main/java` não retorna nada. `PlanoSemanal.versao` e `TreinoPlanejado.versao` incrementam na mesma linha, então a versão anterior não é recuperável.
- `artifacts/cpo-weekly/2026-11-23.md` §8.1 confirma o mesmo padrão no lado da leitura: das três decisões, só `reviewedAt` existe; abrir e editar não deixam rastro de tempo.
- Referência de método: direção 2 do compass (copiloto que aprende cada coach).

**Eixo North Star.** Melhorar a qualidade das decisões (critério 2). Compass: **Enabler**, destrava a direção 2 (copiloto que aprende o coach).

**Métrica do momento.** Conversão em Basic no dia 60 e retenção de coach, pelo mecanismo de sugestão que acerta mais e exige menos edição (% aceito sem edição, sempre pareado com desfecho, nunca sozinho).

**ROI: 4 × 70% ÷ 3 = 0,93.** Sem mudança em 2026-11-27 (reverificação, não reforço).
- Impacto 4: é o ativo que sustenta a diferenciação de longo prazo e destrava o épico de aprendizado por coach.
- Confiança 70%: guardrail do compass é fonte primária e o gap é verificável no código hoje; falta evidência de coach.
- Esforço 3: feature nova sobre modelo de dados existente (append-only com JSONB antes/depois, sem mudar o contrato de leitura).

**Porta.** One-way (schema novo; erro de modelagem custa migração).

**Menor teste (≤3 dias).** Numa assessoria fundadora, exportar as `SugestaoCoach` editadas de uma semana e comparar `summaryOriginal` com `summary` à mão. Se a mesma classe de mudança aparecer em ≥30% das edições, o delta é método e vale estruturar o log.

**Critério de morte.** Nenhuma classe de edição passa de 10% dos casos: o delta é ruído, não método. Arquivar.

**Balde.** Fazer em seguida.

---

### 6. Plano-modelo por coorte (replicar a semana aprovada)

**Problema.** Numa assessoria de 10 a 50 atletas, vários compartilham objetivo e fase (12 atletas para a mesma meia de outubro). O coach revisa 12 planos semana a semana, um por um, e a maior parte das decisões é a mesma nos 12. O tempo dele por atleta não cai porque cada atleta é um ciclo de revisão independente — e é exatamente esse tempo que a bússola diz ser a vantagem competitiva.

**Evidência.**
- Transplante de mercado adjacente (fonte 4 do garimpo): no software de personal trainer, o mecanismo de escala é o **programa mestre** — "once a program exists as a Master Program template, every new client with a matching goal profile gets subscribed to it in a few clicks. If you train 30 clients across three goal profiles, you're maintaining three programs, not writing 30" (`https://trainerize.com/blog/personal-trainer-client-management-software`, leitura 2026-11-27). O mesmo texto trata "escalar além de 15 clientes" como o ponto em que cada cliente novo multiplica tarefa administrativa.
- Interno: `openspec/SPRINTS.md` registra `coach-batch-plan-generation` (geração de N planos, mas cada um revisado individualmente) e o épico de temporada agora dá `target_tss` comparável por semana — a base para dizer "estes atletas estão na mesma semana de carga".
- **Hipótese declarada:** nenhum coach do piloto pediu isso. A evidência é analogia de mercado + estrutura de dados, não sinal de cliente.

**Eixo North Star.** Escala sem perder personalização (critério 3) e tempo do coach (1). Compass: **Core**, direções 1 e 3.

**Métrica do momento.** Minutos de revisão por atleta por semana, com aderência igual ou melhor — mecanismo: uma decisão revisada serve N atletas do mesmo perfil, e só as exceções (lesão, calibração, prova própria) voltam para revisão individual.

**ROI: 4 × 50% ÷ 4 = 0,50.**
- Impacto 4: ataca direto a métrica do North Star em assessorias com coorte homogênea; não é 5 porque depende de a coorte realmente existir no piloto.
- Confiança 50%: analogia de mercado adjacente sólida e documentada, sem nenhuma validação interna.
- Esforço 4: novo modelo de dados (modelo → assinatura → desvio) e mudança no caminho de geração; com um engenheiro, trava semanas.

**Porta.** One-way (modelo de dados novo e vínculo plano ↔ coorte).

**Menor teste (≤3 dias).** Simulação manual com uma assessoria fundadora: o coach aponta 5 atletas com o mesmo objetivo e a mesma semana de carga; a gente entrega a ele uma única semana de treino revisada para os 5 copiarem à mão e mede quanto tempo ele economizou e quantas exceções ele teve de abrir individualmente. Se as exceções passarem de 2 em 5, a coorte é ficção.

**Critério de morte.** Menos de 30% de tempo economizado na simulação, ou mais de 2 exceções por coorte de 5: o coach já trata cada atleta como único e o produto deve seguir o mesmo caminho.

**Balde.** Experimentar depois (esforço 4 com um engenheiro; só entra depois do teste manual).

**Proposta nova (rascunho do CPO, passa pelo Gate-3 como qualquer item).**

---

## Ficaram de fora desta execução (não pontuadas como novas)

- **Frequência real vs. prescrita** (ROI ~0,60): `60-Growth/Trends/2026-11-23.md` traz o dado mais forte da semana em dor de treinador — frequência semanal média caiu de 3,4 para 1,8 treinos (Por Dentro do Corre II, 1.179 entrevistados, coleta de nov/2025), e o próprio relatório diz que serve para "plano que não cabe na semana real do corredor". Verificado hoje: não existe cálculo de frequência observada em `src/main/java`, embora `TreinoRealizado` e `diasDisponiveis` já estejam no banco. Ficou atrás das três por confiança (amostra B2C, não assessoria) e por sobrepor o sinal de `ADERENCIA` da fila.
- **Leitura de ativação da turma fundadora** (ROI ~1,05, `artifacts/cpo-weekly/2026-11-23.md` §8.2): é relatório operacional do founder, não peça de produto — não tem eixo North Star de coach/atleta. Registrada aqui para não voltar como se fosse candidata nova; o lugar dela é o backlog de ops.
- **Chave de modelo por tenant** (ROI ~1,05): é Enabler de `migrate-openai-retired-models`, decisão dentro daquela change.
- **Push ack do treino ao relógio** (ROI ~0,87): `artifacts/cpo-weekly/2026-11-09.md` §8.2; em produção há semanas sem sinal de coach.
- **Risco de positive split na prova** (ROI ~0,80): sobrepõe `artifacts/race-evaluation-skill.openspec.yaml` (draft com splits, fade e desvio de pace desde 2026-05-21) e depende de splits por km.

## Arquivadas

Nenhuma.
