**Tamanho:** M · **Trilha:** Full

## Why

A fila de atenção (Sprint 9a) entrega `evidence[]` e `suggestedAction` para cada item, mas não responde "por quê este atleta está aqui" de forma direta. O treinador vê "TSB: -40.0 (Fadiga excessiva)" mas não lê a sentença que conecta esse valor a uma conclusão de risco. Quanto mais o produto empilha sinais, recomendações de plano e sugestões LLM, mais o coach precisa de uma camada de explicabilidade estruturada — que sirva tanto à fila determinística quanto (futuramente) à inbox de sugestões IA.

A confiança do treinador no sistema é requisito central do coach-in-the-loop. Explicar é tão crítico quanto prescrever.

## What Changes

**Backend apenas (sem migration, sem novo endpoint):**

1. **Novos tipos de explicabilidade:**
   - `ExplanationConfidence` enum — `HIGH` (determinístico) / `MEDIUM` (heurístico) / `LOW` (derivado de LLM); o v1 produz apenas `HIGH` (todos os sinais da fila são determinísticos).
   - `RecommendationExplanation` record — contrato canônico: `rationale` (sentença do "por quê"), `sourceRules[]` (qual evaluator/regra disparou), `confidence`.

2. **`SinalAtencao` (interno):** ganha `rationale: String` + `sourceRules: List<String>` — o evaluator os constrói junto com as evidências.

3. **`CoachAttentionSignalEvaluator`:** cada um dos 6 métodos (`avaliarFadiga`, `avaliarSobrecarga`, `avaliarAderencia`, `avaliarInatividade`, `avaliarZonasVencidas`, `avaliarSemPlano`) passa a produzir `rationale` concreto e `sourceRules`.

4. **`CoachAttentionItemOutputDto`:** ganha campo `explanation: RecommendationExplanation` (aditivo, `@JsonInclude(NON_NULL)`) — construído a partir do sinal principal em `montarItem`.

5. **`CoachAttentionQueueServiceImpl.montarItem`:** monta `RecommendationExplanation` a partir do sinal principal (rationale + sourceRules do sinal + confidence HIGH).

## Non-Goals

- Não adicionar explicabilidade à geração de plano neste sprint (depende de LLM tool-use, Sprint 10–11).
- Não expor explicabilidade de análise pós-treino (Sprint 23+).
- Não i18n do `rationale` agora — string em PT-BR, determinístico por motivo.
- Não criar endpoint novo — o contrato é aditivo no `GET /api/v1/coach/attention-queue` existente.
- Não remover `evidence[]` e `suggestedAction` do DTO pai (ficam para compatibilidade).
- **Auditoria histórica de explanations fora do escopo de v1** — `explanation` é computado em memória a cada request e não é persistido. Se o coach precisar da justificativa de um sinal que desapareceu (atleta voltou a treinar), o campo não estará disponível. Persistência é uma future change.

## Critérios de aceite

**CA-1: Campo `explanation` presente em todos os itens da fila**
- GIVEN um item da fila com `primaryReason = FADIGA` e TSB = -40.0
- WHEN `GET /api/v1/coach/attention-queue`
- THEN `explanation.rationale` contém uma sentença em PT-BR que menciona o valor de TSB e a zona
- AND `explanation.sourceRules` contém pelo menos `"CoachAttentionSignalEvaluator.avaliarFadiga"`
- AND `explanation.confidence` = `"HIGH"`

**CA-2: `rationale` é concreto e específico ao valor**
- GIVEN um item com `primaryReason = INATIVIDADE` e `diasInativos = 17`
- WHEN `GET /api/v1/coach/attention-queue`
- THEN `explanation.rationale` menciona "17 dias"

**CA-3: `sourceRules` captura a regra/classificador específico**
- GIVEN um item com `primaryReason = FADIGA` e FaixaTsb = CRITICO
- WHEN consultando a fila
- THEN `explanation.sourceRules` contém `"FaixaTsb.CRITICO"`

**CA-4: Contrato aditivo — zero regressão**
- GIVEN consumers que ignoram o campo `explanation`
- WHEN a fila é consultada
- THEN `atletaId`, `athleteName`, `severity`, `priorityScore`, `primaryReason`, `suggestedAction`, `generatedAt`, `evidence[]` permanecem idênticos ao contrato anterior

**CA-5: Todos os 6 motivos têm `rationale` não-vazio**
- GIVEN qualquer sinal (FADIGA / SOBRECARGA / ADERENCIA / INATIVIDADE / ZONAS_VENCIDAS / SEM_PLANO)
- WHEN o evaluator produz o sinal
- THEN `rationale` é uma String não-vazia e não-nula

## Critério de aceite de cobertura

`explanation` presente e não-nulo em 100% dos itens da fila v1 (todos determinísticos). Regressão zero nas 825+ testes existentes.

**Nota:** esta é uma métrica de implementação, não de valor para o treinador. O indicador de valor (tempo de revisão por atleta, taxa de ação nos itens da fila) será medido quando o frontend consumir o campo `explanation` — change de frontend separada, posterior a esta.

## Open Questions & Assumptions

**Resolvidas para esta change:**
- A: `RecommendationExplanation` fica em `dto/output/` (é contrato de API) — confirmado.
- B: `confidence` começa `HIGH` apenas; enums MEDIUM/LOW preparados para LLM (Sprint 10+) — confirmado.
- C: `rationale` em PT-BR, string determinística por motivo; i18n adiado — confirmado.
- D: `evidence[]` e `suggestedAction` permanecem no DTO pai para compatibilidade reversa; `explanation` é additive-only — confirmado.
- E: `explanation` descreve **apenas o sinal principal** (maior severidade + peso). Os sinais secundários estão acessíveis via `evidence[]` consolidado. Rationale multi-sinal (`Map<MotivoAtencao, String>`) é future change.
- F: `rationale` de SOBRECARGA segue o primeiro flag ativo por ordem de prioridade: `sobrecarga` > `necessitaDescanso` > `rampAlto` > `diasConsecutivos`. `sourceRules` lista **todos** os flags ativos como entradas separadas.
- G: `explanation` nunca é `null` na v1 — `montarItem` apenas cria itens quando há pelo menos um sinal; todo sinal produz `rationale` não-vazio. Se nulo por bug, `@JsonInclude(NON_NULL)` omitiria o campo silenciosamente — não aceitável; os testes do Bloco 4 devem assertar `explanation != null`.
- H: Auditoria histórica de explanations fora do escopo — `explanation` é computado em memória e não persistido (ver Non-Goals).

**Abertas (não bloqueantes):**
- Q1: Quando a geração de plano LLM passar a produzir explicações (Sprint 10+), `rationale` deve vir diretamente do LLM como texto livre ou ser estruturado em template? Decisão nessa change futura.
- Q2: O frontend vai exibir `rationale` como tooltip, drawer, ou inline? Não bloqueia o backend agora. **Nota para o frontend:** `rationale` deve ser exibido como sentença principal; `evidence[]` como detalhe expansível — não lado a lado com mesmo peso visual (risco de redundância perceptual).
