## Fase 1 — Corpus de lesão (Semana 1)

### 1. Base de conhecimento de lesão (curada)

- [ ] 1.1 Criar `src/main/resources/knowledge-base/lesao/` e reunir corpus **curado por profissional de saúde**: protocolos de return-to-run, contraindicações por tipo de lesão (tendinite, fascite plantar, canelite, síndrome da banda IT, etc.), sinais de bandeira-vermelha
- [ ] 1.2 Cada documento/chunk SHALL conter metadata: `domain = lesao`, `language`, `source`, `red_flag` (quando aplicável), `tipos_contraindicados` (quando o protocolo os enumerar)
- [ ] 1.3 Ingerir via profile `rag-init` (reusa `KnowledgeIngestionService` da change base); validar chunks por query direta em `vector_store`

---

## Fase 2 — Recuperação consciente de lesão (Semana 2)

### 2. InjuryContextRetriever

- [ ] 2.1 Criar `InjuryContextRetriever.recuperar(descricaoLesao, regiao, fase)` retornando `InjuryContext`
- [ ] 2.2 Montar query a partir de `descricaoLesao` (texto livre) + região corporal inferida + fase; filtrar `domain = lesao`, `language = 'en'`
- [ ] 2.3 Extrair do resultado: chunks de protocolo (para prompt/citação), `Set<TipoTreino>` contraindicados, flag `redFlag`, fontes
- [ ] 2.4 Baixa confiança (sem chunk acima do threshold) → `InjuryContext` conservador (sem protocolo específico) + sinalizar para escalar (D4)
- [ ] 2.5 Testes: descrição conhecida mapeia protocolo + contraindicações; descrição desconhecida cai no conservador; `red_flag` detectado

---

## Fase 3 — Integração na geração e na guarda (Semana 3)

### 3. Geração consciente de lesão

- [ ] 3.1 Em `PlanoSemanalService`, quando `atleta.temLesao == true`, chamar `InjuryContextRetriever` e injetar os chunks de protocolo no prompt (seção própria, com instrução de prescrever em torno da lesão)
- [ ] 3.2 Citar as fontes clínicas na `justificativaFisiologica` (integração com `add-recommendation-explainability`)
- [ ] 3.3 Quando `temLesao == false`, fluxo idêntico ao da change base (sem custo extra)

### 4. Guarda de contraindicação (invariante de segurança)

- [ ] 4.1 Estender `TrainingPrescriptionGuardSkill` para receber `Set<TipoTreino> contraindicados` e **vetar** sessões desse tipo no plano gerado
- [ ] 4.2 Garantir que o contexto RAG **não** reabilita sessões bloqueadas pelas skills determinísticas (`IntervaladoElegibilidadeSkill`, `RecoveryCargaSkill`) — a decisão de bloqueio permanece nelas
- [ ] 4.3 Teste de invariante: dado bloqueio determinístico de intervalado por lesão, nenhum contexto RAG faz o plano final conter intervalado
- [ ] 4.4 Teste: sessão contraindicada gerada pelo LLM é removida/substituída pela guarda

### 5. Escalonamento de bandeira-vermelha

- [ ] 5.1 Quando `InjuryContext.redFlag == true`, adicionar disclaimer obrigatório no plano ("procurar avaliação de profissional de saúde")
- [ ] 5.2 Criar item na fila de atenção do coach (`add-coach-attention-queue`) com a descrição da lesão e o motivo
- [ ] 5.3 Disparar o disclaimer/escalonamento **independentemente** do conteúdo do plano gerado
- [ ] 5.4 Testes: red-flag gera disclaimer + item de atenção; ausência de red-flag não escala

---

## Fase 4 — Validação (Semana 4)

### 6. Validação clínica e de segurança

- [ ] 6.1 Feature flag `app.ai.rag.injury.enabled` (default `false`)
- [ ] 6.2 Piloto: revisar com o coach a adequação da prescrição para 10+ atletas lesionados, com/sem contexto de lesão
- [ ] 6.3 Métrica Micrometer: `injury_rag_contraindicados_vetados_total`, `injury_rag_red_flag_total`, `injury_rag_low_confidence_total`
- [ ] 6.4 Revisão profissional do corpus antes de ligar em produção; registrar responsável pela curadoria
- [ ] 6.5 Ligar em produção apenas após validação de que nenhuma sessão contraindicada/bloqueada vaza para o plano final
