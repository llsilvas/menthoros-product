## Fase 1 — Corpus tenant-scoped e guard (Semana 1)

### 1. Isolamento e partição vetorial

- [ ] 1.1 Decidir partição (D7): coleção/tabela dedicada `coach_methodology` (preferida) ou `metadata.scope` na `vector_store` existente
- [ ] 1.2 Criar `CoachCorpusGuard` com `scopedFilter(UUID tenantId, UUID coachId)` retornando `Filter.Expression` com `tenant_id` E `coach_id` — obrigatório em toda recuperação
- [ ] 1.3 Teste de isolamento: recuperação em sessão do coach A nunca retorna exemplares do coach B (mesmo tenant) nem de outro tenant
- [ ] 1.4 Teste: ausência de tenant/coach no contexto → recuperação abortada (não cai para escopo global)

### 2. Resumo de situação (exemplar)

- [ ] 2.1 Criar `SituacaoAtleta` (record: nivel, faseProgramada, objetivo/provaAlvo, faixaCtl, faixaTsb, restricoes) — sem entidades JPA
- [ ] 2.2 Criar `SituacaoExemplarBuilder`: monta o texto estruturado a embeddar (perfil + carga em faixas + estrutura do plano final + justificativa)
- [ ] 2.3 Teste: builder não acessa coleções lazy de JPA; gera texto determinístico para a mesma entrada

### 3. CoachMethodologyCorpusService (ingestão)

- [ ] 3.1 Criar `CoachMethodologyCorpusService.ingest(PlanoFinal, coachId, tenantId)`: dedup idempotente por `planoId` + hash do resumo
- [ ] 3.2 Metadata do exemplar: `tenant_id`, `coach_id`, `plano_id`, `quality` (`approved` | `edited`), `fase`, `nivel`, `embedding_model`, `ingested_at`
- [ ] 3.3 Para plano editado, indexar a **versão final do coach** (não a gerada pela IA), `quality=edited`
- [ ] 3.4 `purgeByCoach(coachId)` e remoção de exemplares ao deletar atleta (LGPD)
- [ ] 3.5 Testes: ingestão idempotente; `quality` correto; purga remove só o coach alvo

---

## Fase 2 — Loop de aprendizado (Semana 2)

### 4. Gatilho de ingestão na aprovação

- [ ] 4.1 Conectar o `CoachMethodologyCorpusService.ingest` ao evento de aprovação/edição de plano (instrumentação `editadoPeloCoach` da change base)
- [ ] 4.2 Ingestão fora do ciclo de request crítico (assíncrono via `ApplicationEventPublisher`/listener) para não impactar latência da aprovação
- [ ] 4.3 Feature flag `app.ai.rag.coach.enabled` (default `false`); na fase de acumulação, ingerir sem ainda injetar few-shot
- [ ] 4.4 Log estruturado: exemplares ingeridos por coach, distribuição `approved` vs `edited`

---

## Fase 3 — Recuperação e injeção few-shot (Semana 3)

### 5. CoachMethodologyRetriever

- [ ] 5.1 Criar `CoachMethodologyRetriever.recuperarSimilares(situacao, tenantId, coachId)`: aplica `CoachCorpusGuard`, busca topK (`app.ai.rag.coach.top-k`, default 3)
- [ ] 5.2 Ranking D6: `similaridade × peso_qualidade × decaimento_recência` (`approved` > `edited`; recentes pesam mais)
- [ ] 5.3 Cold-start: abaixo de `app.ai.rag.coach.min-exemplares` (default 5), retorna vazio e loga `coach-rag: cold-start`
- [ ] 5.4 Testes: ranking respeita qualidade/recência; cold-start retorna vazio

### 6. Integração no PlanoSemanalService

- [ ] 6.1 Injetar os exemplares como **few-shot** no prompt, em seção separada de: (a) chunks KB universal, (b) resultados de tools
- [ ] 6.2 Prompt deixa explícito que os exemplares são "como você (coach) estruturou situações semelhantes" — não fatos universais
- [ ] 6.3 Citar exemplares na justificativa (integração com `add-recommendation-explainability`)
- [ ] 6.4 Quando few-shot omitido (cold-start/flag off), geração idêntica à da change base (KB universal + tools)

---

## Fase 4 — Validação de impacto (Semana 4)

### 7. Medição A/B

- [ ] 7.1 Marcar planos gerados com `few_shot_coach_usado` (boolean) para segmentar a métrica de aceitação já instrumentada
- [ ] 7.2 Comparar taxa de aceitação sem edição: KB universal vs KB universal + few-shot do coach (por coach com ≥ N exemplares)
- [ ] 7.3 Métrica Micrometer: `coach_rag_exemplares_recuperados{coach}`, `coach_rag_cold_start_total`
- [ ] 7.4 Revisar exemplares que produziram planos rejeitados; permitir exclusão de exemplar ruim
- [ ] 7.5 Ligar few-shot em produção quando A/B mostrar ganho de aceitação ≥ +5 p.p. sobre a baseline da change base
