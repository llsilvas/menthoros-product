# Feature Radar (CPO)

> Fila de candidatas a feature. **Não é roadmap**: o Radar oficial é `openspec/SPRINTS.md` e só o founder escreve nele.
> Pontuação: `ROI = impacto (1–5) × confiança (0–100%) ÷ esforço (1–5)`. Confiança sempre rastreável a evidência; sem evidência, o item é hipótese e a confiança cai para 30%.
> Baldes: Fazer agora / Fazer em seguida / Experimentar depois / Não fazer agora.
> Criado em 2026-11-21 (primeira execução do cron). Última atualização: 2026-11-21.

## Resumo (ordenado por ROI)

| Candidata | Balde | ROI | Status | Criada | Último reforço |
|---|---|:---:|:---:|:---:|:---:|
| Atleta sem canal de ingestão na fila de atenção | Fazer agora | 1,20 | nova | 2026-11-21 | 2026-11-21 |
| Saúde da temporada por assessoria (rollup do macrociclo) | Experimentar depois | 1,10 | nova | 2026-11-21 | 2026-11-21 |
| Registro do delta de edição por etapa (o que o coach mudou) | Fazer em seguida | 0,93 | nova | 2026-11-21 | 2026-11-21 |

---

## Fichas

### 1. Atleta sem canal de ingestão na fila de atenção

**Problema.** O treinador não sabe quais atletas estão cegos no sistema. Atleta com canal `MANUAL` (ou Garmin não conectado) não tem atividade ingerida, logo não tem métrica diária, logo não entra no loop de progresso. E a fila de atenção, em vez de dizer "este atleta não tem canal", entrega `INATIVIDADE` e `ADERENCIA`: o coach lê "sumiu" quando o problema é de canal. Ele gasta decisão em cima de um dado que não existe, e o atleta certo não recebe a ligação.

**Evidência.**
- `artifacts/cpo-weekly/2026-11-09.md` §8.1 (fora da caixa): "Atleta sem canal de ingestão como sinal na fila de atenção", ROI 1,2 estimado. Recomendação viva desde 11-09.
- `knowledge/product/strategic-compass.md:76` (guardrail de dados): o onboarding deve empurrar watch direto → intervals.icu "e flag stub-only athletes to the coach". A regra existe, o sinal não.
- Código (`/workspace/apps/menthoros-backend`, `develop`): `enums/MotivoAtencao.java` tem 7 motivos (FADIGA, PROVA_ATLETA, SOBRECARGA, SEM_PLANO, ADERENCIA, INATIVIDADE, ZONAS_VENCIDAS) e nenhum cobre ausência de canal. `enums/CanalIntegracao.java` já persiste `MANUAL`/`INTERVALS_ICU`/`GARMIN` no onboarding, então o dado de entrada existe.

**Eixo North Star.** Risco e progresso visíveis (critério 4). Compass: **Core**, direção 1 (exception-first coaching).

**Métrica do momento.** Ativação na semana 1 (quantos canais o coach conecta na primeira sessão) e retenção de atleta, pelo mecanismo de o atleta sem canal nunca entrar no PMC nem no loop de progresso.

**ROI: 4 × 60% ÷ 2 = 1,20.**
- Impacto 4: corrige um sinal que hoje mente na fila e move o eixo de risco visível; não é 5 porque não ataca o delta nem a decisão em si.
- Confiança 60%: guardrail escrito no compass (fonte primária do produto) + achado repetido do CPO weekly, sem ainda um coach pedindo na semana.
- Esforço 2: reusa `SinalAtencao`/`CoachAttentionSignalEvaluator` e `CanalIntegracao`; é motivo novo na fila existente, front mínimo.

**Porta.** Two-way (sinal novo, sem schema novo).

**Menor teste (≤3 dias).** Rodar a query manual de atletas cujo último registro veio por canal manual ou por nenhum nas últimas 4 semanas e mandar a lista ao founder de uma assessoria fundadora. Medir se ele age na semana (conecta canal ou fala com o atleta).

**Critério de morte.** Em 2 semanas, zero canal conectado e nenhuma mensagem enviada a partir da lista: a dor é nossa, não do coach. Não construir o motivo na fila.

**Balde.** Fazer agora.

---

### 2. Saúde da temporada por assessoria (rollup do macrociclo)

**Problema.** Com o plano de temporada no ar, quem decide é o dono da assessoria, e ele abre atleta por atleta para descobrir quem está desviando do próprio macro. Desvio acumulado e marcos em risco só aparecem quando já viraram problema semanal.

**Evidência.**
- `artifacts/cpo-weekly/2026-11-16.md` §8.1: proposta explícita, impacto 4 × confiança 55% ÷ esforço 2 = 1,1, tamanho S, Core. Mesma edição, §6.1: o épico de temporada está em código sem linha de sprint.
- `openspec/SPRINTS.md:16`: as três fatias do épico `add-season-plan-*` estão mergeadas em `develop` atrás de `SEASON_PLAN_ENABLED`, default `false`. O dado existe; o produto ainda não está ligado.
- **Ressalva honesta:** é fonte única (uma auditoria CPO), por isso a confiança fica em 55% e o item não entra como "Fazer agora".

**Eixo North Star.** Escala sem perder personalização (critério 3) + risco e progresso visíveis (4). Compass: **Core**, direções 1 e 3.

**Métrica do momento.** Retenção de coach (renovação da assessoria) e tempo do coach, pelo mecanismo de uma tela substituir N drilldowns antes da revisão semanal.

**ROI: 4 × 55% ÷ 2 = 1,10.**
- Impacto 4: move escala e risco visível para o decisor econômico (o dono), efeito plausível na retenção do contrato.
- Confiança 55%: evidência é a análise CPO de uma semana e o código atrás de flag; nenhum coach pediu.
- Esforço 2: reusa `SemanaPlanejada`, `desvio_alvo_percentual` e `SugestaoCoach`, que o épico já produz.

**Porta.** Two-way (leitura agregada).

**Menor teste (≤3 dias).** Com a flag ligada em uma assessoria fundadora, montar o rollup à mão em planilha por 2 semanas e observar se o dono abre antes da revisão semanal e age em cima de 1 atleta.

**Critério de morte.** Dono não abre a planilha em 2 semanas seguidas, ou abre e não age: morre como relatório que ninguém lê.

**Balde.** Experimentar depois (bloqueada pela flag `season-plan.enabled`).

---

### 3. Registro do delta de edição por etapa (o que o coach mudou)

**Problema.** O moat declarado é o delta: a diferença entre o que a IA sugeriu e o que o treinador decidiu. Hoje só sobra um resumo. `SugestaoCoach` guarda `summaryOriginal`, `editadoPeloCoach`, `editedAt` e `versao`, mas a edição em si (etapa, distância, pace, dia) sobrescreve a linha e não vira diff. Cada semana sem log é dado de método que não volta: não dá para dizer "este coach sempre corta o longão em 20%" nem "sempre troca tiro de 800 por 1000".

**Evidência.**
- `knowledge/product/strategic-compass.md:93-94`: "The coach decision log (suggestion accepted / edited / rejected + diff) is a non-negotiable Enabler: every week without it is lost moat data." Guardrail escrito, ainda não honrado no dado.
- Código (`develop`): `entity/SugestaoCoach.java:82-93` tem os campos de resumo e a flag de edição; busca por entidade/tabela de auditoria de edição em `src/main/java` não retorna nada. `PlanoSemanal.versao` e `TreinoPlanejado.versao` incrementam na mesma linha, então a versão anterior não é recuperável.
- Referência de método: `references` do compass, direção 2 (copiloto que aprende cada coach).

**Eixo North Star.** Melhorar a qualidade das decisões (critério 2). Compass: **Enabler**, destrava a direção 2 (copiloto que aprende o coach).

**Métrica do momento.** Conversão em Basic no dia 60 e retenção de coach, pelo mecanismo de sugestão que acerta mais e exige menos edição (% aceito sem edição, sempre pareado com desfecho, nunca sozinho).

**ROI: 4 × 70% ÷ 3 = 0,93.**
- Impacto 4: é o ativo que sustenta a diferenciação de longo prazo e destrava o épico de aprendizado por coach.
- Confiança 70%: guardrail do compass é fonte primária e o gap é verificável no código hoje; falta evidência de coach.
- Esforço 3: feature nova sobre modelo de dados existente (append-only com JSONB antes/depois, sem mudar o contrato de leitura).

**Porta.** One-way (schema novo; erro de modelagem custa migração).

**Menor teste (≤3 dias).** Numa assessoria fundadora, exportar as `SugestaoCoach` editadas de uma semana e comparar `summaryOriginal` com `summary` à mão. Se a mesma classe de mudança aparecer em ≥30% das edições, o delta é método e vale estruturar o log.

**Critério de morte.** Nenhuma classe de edição passa de 10% dos casos: o delta é ruído, não método. Arquivar.

**Balde.** Fazer em seguida.

---

## Ficaram de fora desta execução (não pontuadas como novas)

- **Chave de modelo por tenant** (ROI ~1,05): é Enabler de `migrate-openai-retired-models`, decisão dentro daquela change, não candidata nova. `artifacts/cpo-weekly/2026-11-16.md` §8.2.
- **Push ack do treino ao relógio** (ROI ~0,87): `artifacts/cpo-weekly/2026-11-09.md` §8.2; ficou atrás das três por ROI e por já ter estado em produção há 2 semanas sem sinal de coach.
- **Risco de positive split na prova** (ROI ~0,80): sobrepõe `artifacts/race-evaluation-skill.openspec.yaml` (draft com splits, fade e desvio de pace desde 2026-05-21) e depende de splits por km.

## Arquivadas

Nenhuma. Primeira execução do radar.
