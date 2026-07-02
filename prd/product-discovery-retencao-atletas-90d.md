# Product Discovery — Retenção de atletas após 90 dias

**Produto:** Menthoros  
**Data:** 2026-07-01  
**Tema:** reduzir churn / abandono de atletas após a janela inicial de 90 dias  
**Persona primária:** coach  
**Persona secundária:** atleta  
**Princípio do produto:** coach-in-the-loop; a IA não fala diretamente com o atleta sem curadoria do coach.

---

## 1. Resumo executivo

A retenção após 90 dias provavelmente não será resolvida por desconto, mais notificações genéricas ou mais conteúdo. A pesquisa aponta que abandono em fitness/health acontece quando o usuário deixa de formar hábito, não vê progresso, não tem clareza do próximo passo, perde conexão social/humana ou vira “invisível” antes de cancelar.

Para Menthoros, o maior ROI está em **dar ao coach um sistema operacional de retenção**: detectar risco cedo, explicar por que o atleta está em risco e sugerir a próxima ação humana, dentro da fila de atenção e do fluxo semanal já planejado.

**Recomendação:** priorizar um bloco de produto chamado **Retention Loop 90d**, composto por:

1. **Retention Radar 90d** — score/regra explicável de risco por atleta.
2. **Next Best Action para o coach** — ação recomendada + template PT-BR editável.
3. **Jornada 0-30-60-90** — check-ins e marcos programados.
4. **Feedback/barreiras do atleta** — micro-check-ins curados pelo coach.
5. **Marcos de progresso visíveis** — consistência, evolução e meta flexível.

---

## 2. Evidências pesquisadas

### 2.1 Abandono em apps de saúde/fitness é concentrado cedo

Uma revisão de escopo publicada no *Journal of Medical Internet Research* analisou 18 estudos e 525.824 participantes. O padrão observado foi curvilíneo: abandono mais intenso logo após aquisição e desaceleração ao longo do tempo. A revisão reporta mediana de **70% dos usuários descontinuando o uso nos primeiros 100 dias** e recomenda atacar fatores variados: problemas técnicos, necessidades em mudança e engajamento ao longo do tempo.

**Implicação para Menthoros:** o produto precisa tratar os primeiros 90 dias como jornada ativa, não como onboarding pontual.

Fonte: Kidman et al., 2024 — https://pmc.ncbi.nlm.nih.gov/articles/PMC11694054/

### 2.2 Em academias/clubes fitness, 90 dias também é a janela crítica

Estudos e relatórios de fitness indicam abandono elevado nos primeiros meses. Um artigo em *Journal of Sports Science & Medicine* cita taxas de desistência de **40–65% nos primeiros seis meses** em clubes fitness. Materiais de mercado e playbooks de retenção apontam que mais de 50% de novos praticantes podem desistir nos primeiros três meses.

**Implicação para Menthoros:** para corrida supervisionada, sinais de risco devem ser capturados antes da ausência virar cancelamento: queda de frequência, treinos perdidos, silêncio, ausência de meta, baixa resposta a mensagens e falta de vínculo com o coach.

Fonte acadêmica: Gjestvang et al., 2023 — https://pmc.ncbi.nlm.nih.gov/articles/PMC10244985/

### 2.3 Onboarding estruturado supera orientação única

Playbooks de retenção de academias citam pesquisa de Paul Bedford/IHRSA: membros que passam por onboarding estruturado — orientação inicial + follow-ups em 2–3 semanas — retêm mais em 6 meses do que membros com apenas orientação padrão. O ponto prático recorrente é que onboarding precisa ser um processo de semanas/meses.

**Implicação para Menthoros:** o onboarding de atleta deve ter cadência: dia 1, dias 3–7, semana 2, semanas 3–4, dia 60 e dia 90, sempre com intervenção do coach.

Fontes:  
- Glofox — https://www.glofox.com/blog/onboarding-and-retention/  
- Nutripy — https://nutripy.io/blog/gym-member-retention-strategies

### 2.4 Motivação autônoma e suporte social aumentam aderência

O estudo de Gjestvang et al. encontrou que membros de modelos boutique reportavam mais exercício, maior motivação autônoma e maior suporte social; o artigo sugere que coesão e comunidade podem contribuir para membros mais ativos e motivados.

**Implicação para Menthoros:** mesmo sendo uma plataforma coach-first, o produto deve ajudar o coach a criar vínculo: reconhecer progresso, convidar para desafio, sugerir parceiro/grupo, celebrar consistência.

### 2.5 Descontos não atacam a causa raiz

Materiais de retenção indicam que motivos declarados como “sem tempo” e “preço” frequentemente são proxies: antes disso, presença/engajamento já caiu. Cancelamento é sinal tardio; a decisão aparece semanas antes em comportamento.

**Implicação para Menthoros:** o produto deve antecipar o risco com sinais comportamentais e gerar ações personalizadas, não campanhas genéricas de desconto.

---

## 3. Causas prováveis de baixa retenção após 90 dias

| Causa | Sinais no produto | Mecanismo de churn | Oportunidade |
|---|---|---|---|
| Falha na formação de hábito | treinos perdidos, lacunas > 7/14 dias, baixa aderência ao plano | atleta não transforma treino em rotina | jornada 0-30-60-90 + alertas |
| Falta de clareza do próximo passo | plano vencido, sem próxima prova/meta, sem treino futuro | atleta não sabe o que fazer agora | next best action + plano trimestral |
| Baixa percepção de progresso | não vê evolução, só cobrança | esforço não parece compensar | marcos e visualização simples de progresso |
| Pouca conexão coach-atleta | poucas mensagens/check-ins, atleta silencioso | atleta se sente invisível | prompts para coach, check-ins humanos |
| Baixo suporte social | treina isolado, sem desafio/parceiro | sair tem baixo custo emocional | sugestões de desafio/grupo/parceiro via coach |
| Fricção operacional | dificuldade de registrar treino, importar arquivo, entender tela | uso vira trabalho extra | simplificar ingestão e resumo semanal |
| Carga mal calibrada | dores, fadiga, treino difícil demais/fácil demais | atleta perde confiança ou se lesiona | readiness/barreiras + ajuste do coach |
| Falta de diagnóstico de saída | cancelamento sem motivo real | produto aprende pouco | reason capture + win-back |

---

## 4. Oportunidades de solução

### O1 — Retention Radar 90d

**Descrição:** score explicável de risco por atleta, exibido para o coach na fila de atenção.

**Sinais v1 sugeridos:**
- dias sem treino registrado;
- queda de aderência vs. baseline individual;
- plano vencido ou sem próximos treinos;
- ausência de mensagem/check-in recente;
- ausência de meta/prova futura;
- baixa prontidão/fadiga/dor reportada;
- atleta entre D1 e D120 com transição de fase.

**Por que alto ROI:** usa dados e fluxos que o roadmap já prevê: fila de atenção, weekly review, messaging, workout analyzer.

### O2 — Next Best Action para o coach

**Descrição:** cada alerta vem com uma ação recomendada, motivo e template editável. Exemplos:
- “Enviar check-in curto sobre barreira de agenda.”
- “Reconhecer consistência de 3 semanas.”
- “Ajustar carga; atleta reportou fadiga.”
- “Convidar para desafio de 4 semanas.”

**Guardrail:** a IA pode sugerir, mas o coach aprova/edita/envia.

### O3 — Jornada 0-30-60-90

**Descrição:** cadência automática de lembretes para o coach, não notificações diretas genéricas para o atleta.

**Fases:**
- D1–D30 — fundação: meta, rotina, primeiro sucesso.
- D31–D60 — hábito: consistência e ajuste de barreiras.
- D61–D90 — vínculo: progresso, desafio, próxima meta.
- D91–D120 — renovação: novo ciclo trimestral.

### O4 — Micro-check-ins de barreiras/readiness

**Descrição:** perguntas rápidas, acionadas pelo coach, para descobrir causa real de queda:
- “O que mais atrapalhou treinar esta semana?”
- “Como está sua energia hoje?”
- “Qual horário é mais realista nos próximos 7 dias?”

### O5 — Marcos de progresso visíveis

**Descrição:** marcos simples e não punitivos:
- semanas consistentes;
- treinos concluídos no mês;
- evolução de ritmo/zona/percepção;
- retorno após pausa;
- primeira meta trimestral fechada.

### O6 — Integração social via coach

**Descrição:** sugestões para o coach conectar o atleta a desafio, grupo, parceiro de treino ou prova alvo.

### O7 — Diagnóstico de cancelamento e win-back

**Descrição:** capturar motivo de pausa/cancelamento, classificar bucket e criar ação futura de reentrada.

---

## 5. Priorização por ROI

Escala usada: impacto 1–5; confiança 0–100%; esforço 1–5.  
**ROI score = impacto × confiança ÷ esforço.**

| Prioridade | Solução | Impacto | Confiança | Esforço | ROI score | Decisão |
|---:|---|---:|---:|---:|---:|---|
| 1 | Retention Radar 90d + alerta na fila de atenção | 5 | 85% | 2 | 2.12 | Fazer primeiro |
| 2 | Next Best Action para coach com templates PT-BR | 4 | 80% | 2 | 1.60 | Fazer junto do radar |
| 3 | Jornada de onboarding 0-30-60-90 com check-ins coach-in-loop | 5 | 80% | 3 | 1.33 | MVP do bloco |
| 4 | Questionário rápido de barreiras/readiness e feedback | 3 | 75% | 2 | 1.12 | Instrumentar causa raiz |
| 5 | Diagnóstico de cancelamento e win-back | 3 | 70% | 2 | 1.05 | Pós-MVP do bloco |
| 6 | Metas flexíveis + marcos de progresso visíveis | 4 | 75% | 3 | 1.00 | Fazer após radar/check-ins |
| 7 | Integração social: parceiro/grupo/desafio via coach | 4 | 65% | 4 | 0.65 | Experimento controlado |
| 8 | Programa de indicação como accountability partner | 2 | 60% | 3 | 0.40 | Later |
| 9 | Recuperação de pagamento/assinatura | 2 | 55% | 3 | 0.37 | Depende do modelo comercial |

---

## 6. Métricas de sucesso

### Métrica primária

**Retenção D90/D120 de atletas ativos**

Definição sugerida:
- atleta retido em D90: criado há pelo menos 90 dias, não desativado/cancelado, com pelo menos uma evidência de atividade/engajamento nos dias 76–90;
- atleta retido em D120: criado há pelo menos 120 dias, não desativado/cancelado, com atividade/engajamento nos dias 91–120.

Atividade/engajamento pode ser:
- treino registrado/analisado;
- plano aprovado vigente;
- check-in respondido;
- mensagem coach-atleta;
- weekly review executado.

### Métricas secundárias

| Métrica | Direção desejada |
|---|---|
| % atletas D1-D90 com plano vigente | subir |
| % atletas com lacuna > 14 dias sem treino/check-in | cair |
| % alertas de risco com ação do coach em até 72h | subir |
| Tempo médio do coach para identificar risco | cair |
| % atletas D60-D120 com nova meta/ciclo definido | subir |
| % check-ins respondidos | subir |
| % cancelamentos com motivo classificado | subir |

### Metas iniciais sem baseline

Como baseline real não está disponível neste workspace, definir metas relativas:
- +15% a +25% na retenção D90/D120 da coorte tratada vs. coorte controle;
- -25% em atletas com lacuna > 14 dias dentro dos primeiros 120 dias;
- 70% dos alertas críticos revisados pelo coach em até 72h;
- 50% dos atletas D60-D120 com próxima meta/ciclo definido.

---

## 7. Experimentos recomendados

### Experimento A — Radar + ação humana

**Hipótese:** atletas em risco que recebem intervenção do coach em até 72h retêm mais em D90/D120 do que atletas em risco sem intervenção estruturada.

**Design:** liberar para coaches beta; randomizar por atleta ou por coach quando possível.

**Medição:** retenção D90/D120, lacuna >14 dias, ação do coach, resposta do atleta.

### Experimento B — Jornada 0-30-60-90

**Hipótese:** check-ins estruturados reduzem silêncio e aumentam plano vigente.

**Design:** coorte de novos atletas com lembretes do coach vs. histórico.

### Experimento C — Marco de progresso no dia 60/90

**Hipótese:** reconhecimento de consistência e novo ciclo trimestral aumentam retenção D120.

---

## 8. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Coach sentir aumento de trabalho | recomendações curtas, fila priorizada, templates editáveis |
| Alertas demais virarem ruído | níveis de severidade, agrupamento semanal, suppressão após ação |
| IA parecer falar diretamente com atleta | manter aprovação explícita do coach |
| Score virar caixa-preta | razão do alerta sempre visível |
| Métrica de retenção mal definida | registrar eventos canônicos de engajamento e coortes |
| Social/accountability não caber para todos | tratar como sugestão opcional, não requisito |

---

## 9. Decisão de produto

**Fazer agora:** Retention Radar + Next Best Action + Jornada 0-30-60-90.  
**Fazer em seguida:** barreiras/readiness + marcos de progresso.  
**Experimentar depois:** integração social e win-back.  
**Não fazer agora:** desconto, campanhas genéricas, notificações automáticas diretas para atleta sem coach.
