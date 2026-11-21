# PRD — Retention Loop 90d para atletas

**Produto:** Menthoros  
**Change ID sugerido:** `add-athlete-retention-loop-90d` (nunca criada)  
**Status:** parcialmente entregue; **escopo revisto em 2026-11-20** — o restante aguarda coorte de atletas e Gate 3  
**Data original:** 2026-07-01 · **Última revisão:** 2026-11-20  
**Owner sugerido:** Produto  
**Personas:** coach primário; atleta secundário

---

## 0. Revisão de 2026-11-20

### 0.1 O que já foi entregue

| Solução proposta (§6) | Estado | Onde |
|---|---|---|
| 1. Retention Radar 90d | **Parcial** | A fila de atenção cobre os sinais de risco (`add-coach-attention-queue`, 2026-06-18; auditoria da bússola de 2026-09-23). O motivo `RISCO_RETENCAO` e as fases D1–D120 estão em `add-retention-radar-lite` — 1/28, parada desde 2026-07-24 |
| 2. Cards de risco na fila | **Parcial** | A fila e o card existem; falta o motivo de retenção |
| 3. Next Best Action com template | **Não entregue** | Depende de `add-athlete-coach-messaging` — 0/23, parada desde 2026-06-10 |
| 4. Jornada 0-30-60-90 | **Não entregue** | — |
| 5. Micro-check-ins | **Parcial** | Check-in diário de prontidão (`add-daily-readiness-checkin`, 2026-07-03). Check-in de barreira não existe |
| 6. Marcos de progresso | **Parcial, por outro caminho** | Streak e próxima prova (`add-athlete-engagement-signals`), feedback pós-treino (`add-athlete-retention-quick-wins`, ambos 2026-07-04), kudos (08-27), análise do treino para o atleta (08-31), cards de compartilhamento (2026-11) |
| RF9 — instrumentação analítica | **Não entregue** | Nenhum dos eventos do §14 existe |

### 0.2 O que mudou

- **Não há coorte para medir D90.** Em 2026-11-19 a produção tinha 5 atletas de fora; 3 não
  voltaram depois do cadastro. Regras de risco sobre cinco atletas produzem ruído, e nenhum
  experimento do §12 é executável.
- **O gargalo saiu do atleta e foi para o coach.** Dos 3 treinadores de fora, nenhum estava ativo
  em 2026-11-19; em 2026-11-10, 8 de 10 atletas não tinham treino realizado ingerido. Sem coach
  ativado, não existe atleta para reter.
- **O canal de mensagem segue indefinido** (pergunta aberta 2 do §13). Tudo que depende de mensagem
  do coach ao atleta — Next Best Action, jornada, micro-check-in de barreira — continua bloqueado.
- **O roadmap por sprints (26–32) está superado** (`roadmap-retencao-atletas-90d.md`).
- **O plano de temporada passou a carregar os marcos.** Os marcos do macro (prova-teste, prova-alvo)
  já estão no banco; a proposta de transformá-los em evento de engajamento está em
  `prd-plano-temporada.md` §14.1.

### 0.3 Sequência revista, com ROI

`ROI = impacto (1–5) × confiança (0–100%) ÷ esforço (1–5)`

| # | Item | Impacto | Confiança | Esforço | ROI | Bucket | Compass |
|---|---|---|---|---|---|---|---|
| N | **Proposta nova — Radar de ativação da assessoria (§0.4)** | 5 | 70% | 2 | 1,75 | Fazer agora | Enabler (de todas as direções) |
| B | Instrumentação mínima: eventos de ativação e de retenção (RF9 reduzido) | 4 | 70% | 2 | 1,40 | Fazer agora | Enabler (métrica do North Star) |
| E | Marco do macro como evento de engajamento (`prd-plano-temporada.md` §14.1) | 4 | 55% | 1 | 2,20 | Fazer agora, junto do épico de temporada | Core (direção 4) |
| A | Radar lite — `RISCO_RETENCAO` com os 5 sinais prontos | 3 | 50% | 3 | 0,50 | Experimentar depois | Core (direção 1) |
| D | Jornada 0-30-60-90 (lembretes ao coach) | 3 | 40% | 3 | 0,40 | Experimentar depois | Core (direção 1) |
| C | Next Best Action + templates | 3 | 40% | 4 | 0,30 | Não fazer agora | Core (direção 2) |

**Evidência por trás da confiança:**

- 70% em N e B: o problema foi observado duas vezes em produção (2026-11-10 e 2026-11-19) e, nas
  duas, o levantamento foi feito à mão. A pendência nº 1 do founder em 2026-11-19 é exatamente
  esse levantamento ("atletas vinculados, Garmin conectado, última atividade e propostas
  revisadas, por assessoria").
- 55% em E: mesma nota do PRD de temporada — o dado existe, o efeito em retenção é hipótese.
- 50% em A: os 5 sinais têm dado pronto (auditoria de código de 2026-07-24), mas não há atletas
  suficientes para calibrar falso positivo. Impacto 3 hoje; sobe quando houver coorte.
- 40% em C e D: dependem de canal de mensagem não decidido; a taxa de resposta do coach a lembrete
  é desconhecida.

A ordem antiga (radar → next best action → jornada → barreiras → marcos → dashboard) fica
substituída por: **N + B agora; E junto do ticket 5 do épico de temporada; A quando houver ao
menos uma assessoria fundadora com 10 atletas ativos por 30 dias; C e D só depois da decisão de
canal.**

### 0.4 Proposta nova — Radar de ativação da assessoria

**O que é.** O mesmo padrão deste PRD — regras explicáveis, motivo legível, próxima ação — apontado
para o coach durante os 60 dias de teste. Por assessoria: atletas convidados, convites aceitos,
relógio conectado, primeiro treino ingerido, primeira proposta gerada, primeira proposta revisada,
dias desde o último acesso do coach. Duas saídas: uma visão para o founder (quem travou e em que
passo) e um checklist para o próprio coach ("faltam 3 atletas conectarem o relógio").

**Por que.** É a métrica de fase do North Star (`knowledge/product/north-star.md`: ≥ 5 atletas
conectados na semana 1 e primeira proposta revisada em 7 dias) tornada visível. Hoje ela não é
medida: a leitura de 2026-11-19 saiu de uma lista montada à mão, e o teste de 60 dias de três
treinadores vence por volta de 2026-12-02 sem que ninguém tenha sido avisado de que travaram.

**Esforço.** 2 (S): agregação sobre tabelas que existem (convite, conexão, treino realizado,
sugestão com `reviewedAt`). Sem LLM.

**Risco.** Sobreposição parcial com `add-sync-health-signal`,
`add-attention-reason-sem-sincronizacao` e `add-waitlist-funnel-endpoint` — reaproveitar, não
duplicar. "Último acesso" mede login e o Garmin sincroniza sem login; o indicador confiável é
treino ingerido e proposta revisada.

**Gate.** Draft. Não entra no roadmap sem decisão do founder.

### 0.5 Decisões que precisam do founder

1. Aprovar a troca de ordem: ativação da assessoria antes de retenção do atleta.
2. Destino de `add-retention-radar-lite` (1/28, 114 dias sem movimento): manter em espera com o
   gatilho do §0.3 ou arquivar como adiada.
3. Canal de mensagem coach → atleta (pergunta aberta 2), que destrava C e D.
4. Definição comercial de "atleta retido" (pergunta aberta 1) — sem ela o D90 não é mensurável.

---

> A partir daqui, o texto é o PRD original de 2026-07-01. Os requisitos funcionais, as histórias e
> os critérios de aceite continuam sendo o desenho válido para os itens A, C e D quando forem
> retomados. O §10 ("MVP scope") e o §12 ("Rollout") estão superados pelo §0.

---

## 1. Contexto

Menthoros é uma plataforma AI-first de prescrição de treino de corrida com modelo coach-in-the-loop. O coach aprova, edita ou rejeita sugestões da IA; nenhum output de IA chega ao atleta sem ação deliberada do coach.

A pesquisa de retenção em saúde/fitness mostra abandono concentrado nos primeiros 90–100 dias e causas recorrentes: hábito não formado, falta de clareza, baixa percepção de progresso, pouca conexão humana/social, barreiras não diagnosticadas e risco detectado tarde demais.

---

## 2. Problema

Coaches não têm uma visão operacional clara de quais atletas estão caminhando para churn após 90 dias, por que estão em risco e qual ação deve ser tomada agora. Como resultado, a intervenção acontece tarde, geralmente depois de semanas de silêncio, treino perdido ou cancelamento.

---

## 3. Objetivos

1. Aumentar retenção D90/D120 dos atletas.
2. Reduzir atletas com lacunas de engajamento maiores que 14 dias.
3. Ajudar o coach a agir cedo, com baixo esforço e alta personalização.
4. Transformar retenção em rotina de produto: sinais → alerta → ação coach-in-loop → acompanhamento.

---

## 4. Não objetivos

- Enviar mensagens automáticas de IA diretamente para o atleta sem aprovação do coach.
- Construir modelo preditivo ML opaco na primeira versão.
- Resolver cobrança/pagamentos na primeira versão.
- Criar rede social aberta entre atletas.
- Depender de dados Strava para predição de retenção.

---

## 5. Público-alvo

### Coach

Quer escalar acompanhamento sem perder qualidade humana. Precisa saber quais atletas merecem atenção hoje e o que fazer.

### Atleta

Quer sentir progresso, clareza de próximos passos e acompanhamento real. Não quer ser bombardeado por notificações genéricas.

---

## 6. Proposta de solução

Construir o **Retention Loop 90d**, um conjunto de recursos coach-facing:

1. **Retention Radar 90d** — identifica atletas D1-D120 em risco com regras explicáveis.
2. **Cards de risco na fila de atenção** — mostram severidade, motivo, fase da jornada e histórico relevante.
3. **Next Best Action** — sugere ação do coach com template editável em PT-BR.
4. **Jornada 0-30-60-90** — lembretes estruturados para check-ins e metas.
5. **Micro-check-ins de barreiras/readiness** — permitem ao coach coletar causa real da queda.
6. **Marcos de progresso** — exibem consistência e evolução para apoiar reconhecimento.

---

## 7. Requisitos funcionais

### RF1 — Calcular fase de retenção do atleta

O sistema deve classificar cada atleta ativo em uma fase:

| Fase | Janela | Objetivo |
|---|---:|---|
| Fundação | D1-D30 | criar rotina inicial |
| Hábito | D31-D60 | consolidar consistência |
| Vínculo | D61-D90 | reforçar progresso e relação |
| Renovação | D91-D120 | iniciar novo ciclo trimestral |
| Maduro | D121+ | acompanhamento normal |

### RF2 — Calcular risco explicável v1

O sistema deve gerar risco `baixo`, `médio`, `alto` ou `crítico` para atletas D1-D120 usando regras transparentes.

Sinais v1:
- `dias_sem_treino_registrado`;
- `aderencia_ultimos_14_dias`;
- `plano_vencido_ou_inexistente`;
- `sem_mensagem_ou_checkin_14_dias`;
- `sem_meta_ou_prova_futura`;
- `readiness_baixo_ou_barreira_reportada`;
- `queda_vs_baseline_individual` quando houver histórico.

### RF3 — Exibir card na fila de atenção

Para risco `médio+`, o sistema deve criar/atualizar um card coach-facing contendo:
- atleta;
- fase;
- severidade;
- motivos do risco;
- dados recentes relevantes;
- próxima ação sugerida;
- prazo recomendado;
- botão para abrir perfil do atleta;
- botão para revisar/enviar mensagem ou criar check-in.

### RF4 — Sugerir Next Best Action

O sistema deve sugerir uma ação com base no motivo dominante:

| Motivo dominante | Ação sugerida |
|---|---|
| lacuna de treino | check-in de barreira |
| plano vencido | propor novo microciclo |
| baixa aderência | ajustar carga/agenda |
| sem meta | definir meta de 30/60/90 dias |
| silêncio | mensagem pessoal curta |
| progresso positivo | reconhecer marco e propor próximo desafio |

### RF5 — Templates editáveis PT-BR

O sistema deve fornecer templates em PT-BR, sempre editáveis pelo coach antes do envio.

Exemplo:

> “Oi, {{nome}}. Vi que as últimas duas semanas ficaram mais difíceis para encaixar os treinos. Qual foi a principal barreira: agenda, energia, dor/desconforto ou motivação? Com isso eu ajusto seu plano para ficar mais realista.”

### RF6 — Jornada 0-30-60-90

O sistema deve criar lembretes de check-in para novos atletas:
- D1: boas-vindas + objetivo;
- D7: primeiro ajuste;
- D14: barreira inicial;
- D30: revisão de rotina;
- D60: progresso + próxima meta;
- D90: fechamento do ciclo e plano D91-D120.

### RF7 — Micro-check-ins

O coach deve poder enviar check-in curto com perguntas pré-definidas e/ou customizadas. A resposta deve aparecer no perfil do atleta e alimentar os motivos de risco.

### RF8 — Marcos de progresso

O sistema deve calcular e exibir marcos simples:
- primeira semana consistente;
- 4 semanas com plano ativo;
- retorno após pausa;
- treino-chave concluído;
- ciclo de 90 dias fechado;
- melhoria relevante em métrica disponível.

### RF9 — Instrumentação analítica

O sistema deve registrar eventos:
- risco calculado;
- card criado/atualizado;
- card visualizado;
- ação sugerida;
- ação aceita/editada/descartada;
- mensagem/check-in enviado;
- resposta do atleta;
- risco resolvido;
- churn/pausa/cancelamento quando disponível.

---

## 8. Requisitos não funcionais

- Explicabilidade: todo risco precisa listar razões.
- Privacidade/LGPD: respostas de check-in podem conter saúde/sensibilidade; acesso restrito ao tenant/coach.
- Performance: cálculo de risco não deve degradar abertura da fila; preferir job/evento assíncrono se necessário.
- Auditabilidade: registrar quando sugestão foi gerada e quando o coach aprovou/editou/enviou.
- PT-BR hardcoded, alinhado ao frontend atual.

---

## 9. Histórias de usuário e critérios de aceite

### História 1 — Ver atletas em risco na fila de atenção

**Como** coach,  
**quero** ver atletas D1-D120 com risco de abandono na minha fila de atenção,  
**para** agir antes que parem de treinar ou cancelem.

**Critérios de aceite**

- **Dado** um atleta ativo em D31-D60 com mais de 14 dias sem treino registrado, **quando** o cálculo de risco rodar, **então** um card de risco deve aparecer na fila do coach.
- **Dado** um atleta com plano vencido e sem próxima sessão, **quando** o card for exibido, **então** o motivo “plano vencido/sem próximo passo” deve aparecer claramente.
- **Dado** um atleta com risco baixo, **quando** o coach abrir a fila, **então** nenhum card de retenção deve ser criado para evitar ruído.
- **Dado** um card existente, **quando** o risco mudar, **então** o card deve ser atualizado em vez de duplicado.

### História 2 — Entender por que o atleta está em risco

**Como** coach,  
**quero** ver os fatores que explicam o risco,  
**para** decidir se a recomendação faz sentido.

**Critérios de aceite**

- **Dado** um card de risco, **quando** ele for aberto, **então** deve mostrar fase, severidade, sinais acionados e dados recentes.
- **Dado** que um sinal vem de ausência de mensagens, **quando** o card for aberto, **então** deve mostrar há quantos dias não há interação registrada.
- **Dado** que o score não tem dados suficientes para baseline individual, **quando** o card for aberto, **então** deve informar “histórico insuficiente” e usar regras absolutas.

### História 3 — Receber uma próxima ação recomendada

**Como** coach,  
**quero** receber uma ação recomendada para cada card,  
**para** não perder tempo decidindo o próximo passo.

**Critérios de aceite**

- **Dado** risco por lacuna de treino, **quando** o card for criado, **então** a ação sugerida deve ser um check-in de barreira.
- **Dado** risco por plano vencido, **quando** o card for criado, **então** a ação sugerida deve ser revisar/criar novo microciclo.
- **Dado** progresso positivo no dia 60/90, **quando** houver marco, **então** a ação sugerida deve ser reconhecimento + próxima meta.
- **Dado** qualquer ação sugerida, **quando** o coach a executar, **então** deve ficar registrado que a ação foi aceita/editada/descartada.

### História 4 — Editar e aprovar mensagem antes de enviar

**Como** coach,  
**quero** revisar e editar templates de mensagem,  
**para** manter minha voz e preservar o modelo coach-in-the-loop.

**Critérios de aceite**

- **Dado** um template sugerido, **quando** o coach clicar em “revisar mensagem”, **então** a mensagem deve abrir em modo editável.
- **Dado** uma mensagem sugerida, **quando** o coach não confirmar envio, **então** nada deve ser enviado ao atleta.
- **Dado** uma mensagem editada e enviada, **quando** o envio concluir, **então** o histórico deve guardar versão final enviada, timestamp e coach responsável.

### História 5 — Gerenciar check-ins da jornada 0-30-60-90

**Como** coach,  
**quero** receber lembretes de check-in por fase do atleta,  
**para** manter a cadência de retenção sem depender de memória manual.

**Critérios de aceite**

- **Dado** um novo atleta, **quando** ele completar D7, D14, D30, D60 e D90, **então** o sistema deve gerar lembrete apropriado se não houve interação equivalente recente.
- **Dado** que o coach já interagiu com o atleta dentro da janela configurada, **quando** o lembrete for avaliado, **então** ele deve ser suprimido ou marcado como coberto.
- **Dado** o lembrete D90, **quando** o coach abri-lo, **então** deve sugerir revisão do ciclo e definição do próximo ciclo D91-D120.

### História 6 — Coletar barreiras do atleta

**Como** coach,  
**quero** enviar um micro-check-in de barreiras,  
**para** entender por que a aderência caiu e ajustar o plano.

**Critérios de aceite**

- **Dado** um card por baixa aderência, **quando** o coach escolher “enviar check-in”, **então** deve poder selecionar perguntas pré-definidas.
- **Dado** que o atleta respondeu, **quando** o coach abrir o perfil, **então** a resposta deve aparecer na linha do tempo do atleta.
- **Dado** uma resposta indicando dor/fadiga, **quando** o risco for recalculado, **então** o motivo deve incluir readiness/barreira reportada.

### História 7 — Ver marcos de progresso

**Como** coach,  
**quero** ver marcos de progresso do atleta,  
**para** reconhecer consistência e reforçar motivação.

**Critérios de aceite**

- **Dado** que o atleta completou 4 semanas com plano ativo, **quando** o coach abrir o perfil ou review semanal, **então** deve aparecer um marco de consistência.
- **Dado** um marco reconhecido pelo coach, **quando** a mensagem for enviada, **então** o marco deve ser marcado como reconhecido.
- **Dado** um atleta sem marcos disponíveis, **quando** o componente carregar, **então** não deve exibir estado enganoso; deve sugerir próximo marco possível.

### História 8 — Medir impacto do sistema de retenção

**Como** PM/operador,  
**quero** acompanhar métricas de retenção e ações tomadas,  
**para** validar ROI e decidir próximos investimentos.

**Critérios de aceite**

- **Dado** uma coorte de atletas, **quando** o dashboard for calculado, **então** deve mostrar retenção D90 e D120.
- **Dado** cards gerados, **quando** o dashboard for calculado, **então** deve mostrar % de cards com ação em até 72h.
- **Dado** atletas em D1-D120, **quando** o dashboard for calculado, **então** deve mostrar % com lacuna >14 dias.
- **Dado** dados insuficientes, **quando** o dashboard carregar, **então** deve exibir aviso de baixa confiança.

---

## 10. MVP scope

### Inclui

- Regras v1 de risco.
- Cards de risco na fila de atenção.
- Next Best Action com templates editáveis.
- Lembretes D7/D14/D30/D60/D90.
- Eventos analíticos básicos.

### Não inclui no MVP

- ML preditivo.
- Automações diretas sem coach.
- Pagamentos.
- Comunidade entre atletas.
- App mobile nativo.

---

## 11. Dependências

- Atenção/fila do coach.
- Perfil do atleta.
- Plano aprovado/vigente.
- Registro/análise de treinos.
- Mensageria coach-atleta.
- Weekly athlete review.
- Eventos analíticos ou audit log.

---

## 12. Rollout

1. **Dogfood interno:** regras em modo read-only; comparar com percepção manual.
2. **Beta com 1–3 coaches:** cards visíveis, ações manuais.
3. **Experimento controlado:** coorte com Retention Loop vs. controle/histórico.
4. **Geral:** liberar templates, dashboard e refinamento de thresholds.

---

## 13. Perguntas abertas

1. Qual é a definição comercial de “atleta retido”: assinatura paga, plano ativo, treino registrado ou relacionamento ativo?
2. Existe canal de mensagem já escolhido para atleta — WhatsApp, e-mail, inbox interno?
3. O coach pode configurar cadência/threshold por atleta?
4. O produto terá events analytics próprio ou usará tabela/audit log inicial?
5. Como distinguir pausa saudável de churn real?

---

## 14. Analytics sugerido

Eventos mínimos:

```text
retention_risk_calculated
retention_card_created
retention_card_viewed
retention_action_suggested
retention_action_accepted
retention_action_edited
retention_action_dismissed
retention_message_sent
retention_checkin_sent
retention_checkin_answered
retention_risk_resolved
retention_milestone_created
retention_milestone_acknowledged
```

Propriedades comuns:

```text
coach_id
tenant_id
athlete_id
athlete_age_days
retention_phase
risk_level
risk_reasons
action_type
source
created_at
```

---

## 15. Critério de sucesso do PRD

O PRD é bem-sucedido se, após MVP + experimento, Menthoros conseguir responder:

1. quais atletas D1-D120 estão em risco;
2. por que estão em risco;
3. qual ação o coach tomou;
4. se a ação reduziu lacunas e aumentou retenção D90/D120.
