# Menthoros — Roadmap de Implementação

Documento de priorização e ordem de execução dos changes ativos do projeto. Reflete a visão de produto e a lógica de dependências técnicas entre as entregas.

**Última atualização:** 2026-04-22
**Fonte canônica de especificação:** `openspec/changes/`
**Issues residuais:** `docs/issues/`
**Docs correlacionados:** `docs/architecture/` (técnica), `docs/strategy/PRODUTO_MENTHOROS_ESTRATEGIA.md` (documento canônico de visão e estratégia de produto), `docs/operations/` (runbooks), `docs/archive/` (roadmaps antigos e planos absorvidos)

---

## Princípios de ordenação

1. **Dado real antes de refinar fórmulas.** Não faz sentido calibrar TSS/CTL/ATL/TSB em cima de input manual ruidoso.
2. **Motor analítico correto antes de UX de treinador.** Features de treinador construídas sobre cálculos errados precisam ser retrabalhadas.
3. **Entregas fatiáveis.** Changes grandes (Strava, domain skills, progressão) devem ser quebrados em incrementos que geram valor isoladamente.
4. **Não estabilizar o que ainda vai mudar.** Formalização arquitetural (domain skills) só depois que as regras estiverem calibradas.

---

## Visão geral por onda

| Onda | Tema | Changes | Tasks totais |
|:---:|---|---|:---:|
| 1 | Fundação de dado real | `strava-integration` | 47 |
| 2 | Correções críticas de cálculo | `fix-tsb-semantics`, `add-continuous-daily-load-management`, `progressao-treinos`, `refine-tss-tsb-precision`, `fix-weekly-load-distribution` | ~140 |
| 3 | Confiança no motor analítico | `add-zone-confidence-management`, `add-running-field-tests` | 47 |
| 4 | Experiência do treinador | `add-coach-attention-queue`, `add-post-workout-debrief`, `add-weekly-athlete-review`, `add-recommendation-explainability` | 51 |
| 5 | Arquitetura agêntica | `add-llm-tool-use`, `introduce-domain-skills-architecture`, `llm-code-switching` | ~110 |
| 6 | Features de produto avançadas | `add-daily-readiness-checkin`, `add-race-time-prediction`, `add-taper-guidance`, `add-macrociclo-structure` | ~130 |

**Fora do roadmap ativo:**
- `fix-multi-tenancy-enforcement` — em desenvolvimento em branch paralela.
- `introduce-coach-assistant-core-features` — change guarda-chuva; conteúdo absorvido pela Onda 4.

---

## Onda 1 — Fundação de dado real

### `strava-integration` (47 tasks)

Prioridade máxima. Sem dados reais, todo o restante opera sobre input manual com adesão baixa e precisão limitada. Destrava o ciclo automatizado planejado → realizado → análise → próximo plano.

Sugestão de fatiamento em três incrementos que entregam valor isoladamente:

**1.1 Strava-MVP (Conexão + Sync manual)**
Escopo: tasks 1.x a 6.x do `strava-integration/tasks.md`. Atleta conecta via OAuth2, aciona "Sincronizar" e vê atividades importadas. Já habilita as correções da Onda 2 com dado real.

**1.2 Strava-Realtime (Webhooks)**
Escopo: tasks 7.x. Eventos create/update/delete processados em tempo real. Remove atrito operacional do sync manual.

**1.3 Strava-Hardening (Produção)**
Escopo: tasks 8.x e 9.x + criptografia de tokens (marcada como "a ser implementada" no proposal) + rate-limit robusto nos webhooks. Requisito para abrir para base ampla de atletas.

**Alinhamento obrigatório com a branch de tenancy:**
A entidade nova `IntegracaoExterna` e os novos campos em `tb_treino_realizado` / `tb_etapa_realizada` devem seguir o padrão consolidado pela branch paralela (coluna `tenant_id` obrigatória, índice composto, filtro em repositories, cache segmentado). Evitar retrabalho pós-merge.

---

## Onda 2 — Correções críticas de cálculo

Com dado real do Strava alimentando o sistema, é hora de garantir que as fórmulas centrais representem corretamente o estado do atleta.

### `fix-tsb-semantics` (35 tasks)

Corrige a mistura de prontidão pré-treino com fadiga pós-treino no cálculo do TSB. Hoje o sistema usa fadiga pós para decidir sobre o próprio treino — distorce prescrição e ajuste de pace. É pré-requisito para as Ondas 3 e 4: qualquer feature de treinador que use TSB como sinal fica bloqueada até isso estar correto.

### `add-continuous-daily-load-management` (21 tasks)

Trata dias de descanso como parte explícita da série fisiológica e desacopla o comportamento do lançamento diário de treino. Consolida a interpretação do TSB como estado contínuo, não como função do lançamento do dia.

### `progressao-treinos` (30 tasks)

Substitui o contador simples de `semanasProgressaoContinua` por um envelope técnico que considera aderência, qualidade de execução, longões realizados, RPE e resposta recente. A IA passa a receber contexto confiável sobre o momento do atleta.

### `refine-tss-tsb-precision` (8 seções, ~35 tasks)

Agrupa refinamentos residuais de precisão do motor de cálculo: elevação bidirecional, Ramp Rate com fallback, TSS por etapa, thresholds de TSB por nível, piso de pace para IF saturável e triângulo pace/distância/duração (ex-BACKLOG P2-A/B). Absorve as ex-ISSUE-07 a ISSUE-10 do `docs/issues/`. Deve rodar **depois** de `fix-tsb-semantics`, `add-continuous-daily-load-management` e `progressao-treinos`.

### `fix-weekly-load-distribution` (10 seções, ~20 tasks)

Aplica regras determinísticas de distribuição hard/easy, espaçamento entre sessões-chave e alinhamento com `disponibilidadeSemanal` do atleta antes de persistir a `PlanoSemanal`. Resolve o problema recorrente do P3-B do backlog: "semanas tecnicamente corretas com distribuição que treinador humano trocaria em 30s".

---

## Onda 3 — Confiança no motor analítico

### `add-zone-confidence-management` (12 tasks)

Classifica zonas fisiológicas por nível de confiança (estimada, vencida, incoerente, confiável). Impede que o sistema pareça preciso sem base real, condição necessária para a explicabilidade da Onda 4.

### `add-running-field-tests` (35 tasks)

Formaliza testes de campo (3 km, 5 min) como elemento operacional do ciclo. É o canal natural para recalibrar zonas alimentadas pelo Strava, fechando o loop com a capability anterior.

---

## Onda 4 — Experiência do treinador

Ordem interna segue o ritmo operacional do treinador: diário → pós-sessão → semanal → transversal.

### `add-coach-attention-queue` (13 tasks)

Fila operacional de atletas que exigem ação. Hook diário que traz o treinador para o produto e consolida o valor das análises.

### `add-post-workout-debrief` (17 tasks)

Leitura estruturada do que aconteceu na sessão e seu impacto na sequência do ciclo. Fecha o ciclo pós-execução que hoje é manual.

### `add-weekly-athlete-review` (12 tasks)

Consolidação semanal automatizada. Reduz tempo operacional e dá consistência à decisão sobre a próxima semana.

### `add-recommendation-explainability` (9 tasks)

Explicabilidade atravessa todas as features anteriores. Entra por último para cobrir o conjunto maduro, não ser retrabalhada a cada ajuste de fórmula.

---

## Onda 5 — Arquitetura agêntica

### `add-llm-tool-use` (11 seções, ~35 tasks)

Infraestrutura base para exposição de ferramentas Java ao LLM via Spring AI `@Tool` / `FunctionCallbackWrapper`. Habilita três tools MVP (GetAtletaMetricasTool, GetHistoricoTreinosTool, GetProvaAlvoTool), persistência de invocações em `tb_llm_tool_call` para auditoria, feature flag para rollout seguro e cache de idempotência. Pré-requisito bloqueante para `introduce-domain-skills-architecture`.

### `introduce-domain-skills-architecture` (41 tasks)

Formaliza o conhecimento de domínio hoje espalhado entre helpers, prompt builders e documentação. Adota o modelo consolidado em `docs/architecture/Plano_SpringAI_Agent_Skills.md`: Skills.md como cérebro + `@Tool` como mãos. Alto valor estrutural — requer `add-llm-tool-use` e estabilização das fórmulas nas Ondas 2/3 antes de iniciar.

### `llm-code-switching` (21 tasks)

Otimização de custo e qualidade de LLM via prompts mistos PT/EN. Ganho incremental sobre funcionalidade já entregue.

---

## Onda 6 — Features de produto avançadas

Pacote de diferenciação competitiva. Depende das Ondas 2–4 estarem estabilizadas para não operar sobre fórmulas em mudança. As 4 changes podem ser executadas em paralelo dentro desta onda.

### `add-daily-readiness-checkin` (9 seções, ~25 tasks)

Captura diária de prontidão subjetiva (sono, humor, dores, energia, estresse) com cálculo determinístico de `readinessScore` e `nivelProntidao`. Integra com `IntervaladoElegibilidadeService` como sexto portão da decisão e enriquece o contexto do LLM com sequência dos últimos 7 dias. Fundamental para fechar a lacuna entre "dado objetivo" (Strava) e "sinal subjetivo" (sensação do atleta).

### `add-race-time-prediction` (9 seções, ~25 tasks)

Predição de tempo por prova-alvo usando Riegel (mesma distância ou próxima), VDOT (Daniels) via teste de campo, híbrido ponderado ou estimativa por CTL como fallback. Expõe confiabilidade (0–1) e `gapSeg` vs. objetivo ao contexto do LLM. Snapshot semanal via `@Scheduled` permite análise de evolução ao longo da periodização.

### `add-taper-guidance` (10 seções, ~25 tasks)

Cálculo determinístico da janela de taper por prova-alvo com estratégias LINEAR, EXPONENCIAL ou STEP. Aplica redução progressiva de volume, mantém intensidade até dia 3, bloqueia intervalados pesados nos últimos 7 dias e permite "tune-up" em dias 4–6. Fecha o loop da periodização no momento mais visível (dia da prova).

### `add-macrociclo-structure` (11 seções, ~35 tasks)

Estrutura explícita de macrociclo (12–24 semanas) com mesociclos determinísticos em fases BASE → ESPECIFICO → PICO → TAPER → TRANSICAO. `PlanoSemanal` passa a herdar `fase` e `objetivoCarga` do mesociclo vigente. Ancoragem temporal e pedagógica que eleva a prescrição ao nível de treinador humano experiente. Coordena com `add-taper-guidance` e `progressao-treinos` (documentado em `design.md`).

---

## Fora do roadmap ativo

### `fix-multi-tenancy-enforcement`
Em desenvolvimento em branch paralela. Quando mergeado, estabelece padrão de `tenant_id` que o Strava deve seguir (ver alinhamento na Onda 1).

### `introduce-coach-assistant-core-features`
Change guarda-chuva do qual derivam as capabilities da Onda 4. Sugestão: não tratar como change autônomo — seu conteúdo está absorvido nos changes específicos (`add-coach-attention-queue`, `add-post-workout-debrief`, `add-weekly-athlete-review`, `add-recommendation-explainability`).

### Bugs e inconsistências já resolvidas (docs/issues)
ISSUE-01 a ISSUE-06 estão resolvidas em código + testes. Ver `docs/issues/README.md` para detalhes e lacunas de cobertura de testes futuras.

---

## Dependências entre ondas

```
Onda 1 (Strava) ──► Onda 2 (fix cálculos) ──► Onda 3 (confiança) ──► Onda 4 (UX treinador)
                                                                            │
                                                                            └──► Onda 5 (arquitetura)
```

- **Onda 2 depende de Onda 1:** fórmulas calibradas sobre dado real.
- **Onda 3 depende de Onda 2:** confiança em zonas pressupõe TSB correto.
- **Onda 4 depende de Onda 3:** UX do treinador só convence com motor analítico confiável.
- **Onda 5 depende de Onda 4:** formalizar arquitetura só depois que as regras estiverem maduras.

---

## Como usar este documento

- **Sprint planning:** priorizar sempre a onda ativa; só puxar da próxima quando a atual estiver em testes/review.
- **Novo change no openspec:** classificar em uma das ondas antes de iniciar.
- **Change novo sem onda clara:** sinal de que o escopo pode estar desalinhado do roadmap — reavaliar.
- **Atualização:** ao arquivar um change em `openspec/changes/archive/`, marcar como concluído na onda correspondente.
