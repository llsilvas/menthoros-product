## Context

A fila de atenção (Sprint 9a) entrega `evidence[]` + `suggestedAction` por item, mas não expõe uma sentença que conecte os dados a uma conclusão de risco. Esta change adiciona uma camada de explicabilidade estruturada sobre a infra já entregue, sem mudar o comportamento nem criar novos endpoints.

A mudança é aditiva: `CoachAttentionItemOutputDto` ganha um campo `explanation: RecommendationExplanation` construído a partir do sinal principal de cada atleta.

---

## Goals / Non-Goals

**Goals:**
- Contrato canônico `RecommendationExplanation` reutilizável (inbox Sprint 15, plan quality Sprint 10+).
- `rationale` concreto e específico ao valor (ex.: "TSB em -40.0 situa-se na zona CRITICO, indicando fadiga excessiva...").
- `sourceRules` rastreável (qual evaluator + qual regra/classificador disparou).
- `confidence` preparado para LLM (HIGH agora, MEDIUM/LOW futuramente).

**Non-Goals:**
- Integração de explicabilidade na geração de plano LLM (Sprint 10+).
- Análise pós-treino explicável (Sprint 23+).
- I18n do `rationale`.
- Frontend — o campo `explanation` ficará disponível na API para o front consumir quando quiser.

---

## Decisions

### D1: `RecommendationExplanation` é contrato de API (em `dto/output/`)

**Decisão:** O record vive em `dto/output/RecommendationExplanation.java`, não em `services/helper/`.

**Rationale:** Faz parte do payload de resposta do endpoint `GET /api/v1/coach/attention-queue`. Outros endpoints futuros (plan quality, inbox) reusarão o mesmo record. Viver em `dto/output/` segue o padrão do projeto e sinaliza que é um contrato público.

---

### D2: `explanation` é aditivo — `evidence[]` e `suggestedAction` permanecem no DTO pai

**Decisão:** `CoachAttentionItemOutputDto` ganha `explanation: RecommendationExplanation` como campo aditivo. Os campos `evidence[]` e `suggestedAction` permanecem no pai.

**Rationale:** Zero breaking change. Consumers existentes continuam funcionando. O campo `@JsonInclude(NON_NULL)` garante que ausência de explanation (em casos de null futuro) não rompe o JSON. Duplicação de `evidence` e `suggestedAction` é evitada: `explanation` carrega apenas os campos NOVOS (`rationale`, `sourceRules`, `confidence`).

---

### D3: `rationale` é construído no `CoachAttentionSignalEvaluator`

**Decisão:** Cada método do evaluator constrói `rationale` e `sourceRules` junto com as evidências. O evaluator já tem todos os valores concretos (tsb, faixa, diasInativos, etc.) — é o lugar natural.

**Rationale:** Evita passar dados de volta do serviço para o evaluator. O `SinalAtencao` ganha dois campos novos: `rationale: String` e `sourceRules: List<String>`. `montarItem` em `CoachAttentionQueueServiceImpl` lê `principal.rationale()` + `principal.sourceRules()` para montar `RecommendationExplanation`.

---

### D4: `confidence` começa em `HIGH` para todos os sinais da fila v1

**Decisão:** Os 6 sinais da fila de atenção são 100% determinísticos (FaixaTsb, flags de PlanoMetaDados, contagens, datas). Todos retornam `ExplanationConfidence.HIGH`. Os valores `MEDIUM` e `LOW` do enum ficam preparados para uso futuro com sinais LLM.

**Rationale:** Antecipa o contrato sem overengineering. O evaluator não precisa de lógica de confiança agora — basta retornar `HIGH` em todos os `SinalAtencao`.

---

### D5: `sourceRules` é `List<String>` — não um enum; declaradas como constantes estáticas

**Decisão:** `sourceRules` é `List<String>` com valores no formato `"ClassName.methodOrConstant"`. Os valores são declarados como constantes estáticas privadas em `CoachAttentionSignalEvaluator` (ex.: `private static final String SOURCE_FADIGA = "CoachAttentionSignalEvaluator.avaliarFadiga";`).

**Rationale:** Strings são extensíveis sem mudança de schema. Um enum travaria o contrato. Constantes estáticas centralizam a atualização se a classe for renomeada — o risco de stale strings após refactor é real mas aceitável para v1 (informativo, não executável).

---

### D6: `Evidencia` permanece no `CoachAttentionItemOutputDto` (não migrar para `RecommendationExplanation`)

**Decisão:** `Evidencia` fica como nested record dentro de `CoachAttentionItemOutputDto`. `RecommendationExplanation` não referencia `Evidencia` — tem apenas `rationale`, `sourceRules`, `confidence`.

**Rationale:** Evita dependência circular entre `dto/output/` records. `Evidencia` é um detalhe do DTO da fila; quando a explicabilidade for aplicada a outros contextos (plan quality, inbox), cada um terá sua própria representação de evidência ou reutilizará `Evidencia` diretamente.

---

## Technical Notes

### Contrato final

```java
// enums/ExplanationConfidence.java (NOVO)
public enum ExplanationConfidence { HIGH, MEDIUM, LOW }

// dto/output/RecommendationExplanation.java (NOVO)
@JsonInclude(NON_NULL)
@Schema(description = "Explicabilidade estruturada de uma recomendação ou sinal de atenção")
public record RecommendationExplanation(
    @Schema(description = "Sentença que explica por que o sinal foi acionado")
    String rationale,

    @Schema(description = "Regras/classificadores que dispararam o sinal, no formato ClassName.methodOrConstant")
    List<String> sourceRules,

    @Schema(description = "Grau de confiança na explicação: HIGH=determinístico, MEDIUM=heurístico, LOW=derivado de LLM")
    ExplanationConfidence confidence
) {}

// services/helper/SinalAtencao.java (MODIFICADO — aditivo)
public record SinalAtencao(
    MotivoAtencao motivo,
    Severidade severidade,
    List<Evidencia> evidencias,
    String rationale,           // NOVO
    List<String> sourceRules    // NOVO
) {}

// dto/output/CoachAttentionItemOutputDto.java (MODIFICADO — campo aditivo)
public record CoachAttentionItemOutputDto(
    UUID atletaId,
    String athleteName,
    Severidade severity,
    int priorityScore,
    MotivoAtencao primaryReason,
    String suggestedAction,
    Instant generatedAt,
    List<Evidencia> evidence,
    RecommendationExplanation explanation  // NOVO
) { ... }
```

### Rationale sentences por motivo (construídas no evaluator)

| Motivo | Formato do `rationale` |
|--------|------------------------|
| FADIGA | `"TSB em {tsb} situa-se na zona {faixa.name()} ({faixa.getInterpretacao()}), indicando {severidade == CRITICA ? "fadiga excessiva com risco de overtraining" : "fadiga elevada acima da capacidade de recuperação"}."` |
| SOBRECARGA | `"Plano sinaliza {flags ativas concatenadas}, indicando sobrecarga ou progressão excessiva."` |
| ADERENCIA | `"{perdidos} treino(s) não cumprido(s) nos últimos 14 dias (PERDIDO ou PARCIAL)."` |
| INATIVIDADE | `"Sem atividade registrada há {diasInativos} dias."` |
| SEM_PLANO | `"Atleta sem plano ativo; impossível avaliar carga ou progressão."` |
| ZONAS_VENCIDAS | `"Último teste de FC/pace há mais de 3 meses; zonas de treinamento potencialmente desatualizadas."` |

### sourceRules por evaluator

| Evaluator method | sourceRules |
|-----------------|-------------|
| `avaliarFadiga` | `["CoachAttentionSignalEvaluator.avaliarFadiga", "FaixaTsb.{faixa.name()}"]` |
| `avaliarSobrecarga` | `["CoachAttentionSignalEvaluator.avaliarSobrecarga", "PlanoMetaDados.{flag ativa}"]` |
| `avaliarAderencia` | `["CoachAttentionSignalEvaluator.avaliarAderencia", "TreinoExecucaoStatus.PERDIDO|PARCIAL"]` |
| `avaliarInatividade` | `["CoachAttentionSignalEvaluator.avaliarInatividade"]` |
| `avaliarZonasVencidas` | `["CoachAttentionSignalEvaluator.avaliarZonasVencidas", "Atleta.precisaAtualizarTestes"]` |
| `avaliarSemPlano` | `["CoachAttentionSignalEvaluator.avaliarSemPlano"]` |

### Integração em `montarItem`

```java
// CoachAttentionQueueServiceImpl.montarItem — trecho relevante
SinalAtencao principal = sinais.stream().max(...).orElseThrow();
RecommendationExplanation explanation = new RecommendationExplanation(
    principal.rationale(),
    principal.sourceRules(),
    ExplanationConfidence.HIGH
);
return Optional.of(new CoachAttentionItemOutputDto(
    atletaId, nomeCompleto(atleta), principal.severidade(), priorityScore,
    principal.motivo(), principal.motivo().getSuggestedAction(),
    geradoEm, evidencias, explanation
));
```

---

## Risks / Trade-offs

**[Risco] `rationale` acumula lógica de formatação no evaluator** — O evaluator já é longo. Rationale sentences adicionam ~6 Strings de template. Mitigação: strings curtas, declaradas como constantes ou inline simples; não extrair helper extra (premature).

**[Trade-off] `evidence[]` e `rationale` podem parecer redundantes no frontend** — Se exibidos com mesmo peso visual, o coach vê a mesma informação em dois formatos. Contrato de uso: `rationale` = sentença principal (exibir em destaque); `evidence[]` = detalhe granular (expansível/colapsável). Responsabilidade do frontend.

**[Risco] `sourceRules` como strings são frágeis a refactor** — Constantes estáticas no evaluator centralizam a atualização (D5). São para auditoria humana, não para navegação programática — aceitável para v1.

**[Risco] `avaliarSobrecarga` com múltiplas flags ativas pode gerar `sourceRules` incompleto** — O evaluator DEVE listar todos os flags ativos como entradas separadas em `sourceRules` (não só o primeiro). Os testes de Bloco 3 cobrem combinações múltiplas com `containsExactlyInAnyOrder`.

**[Risco] Locale decimal no `rationale` de FADIGA** — `String.format("TSB em %.1f...", tsb)` com `Locale` padrão `pt_BR` gera vírgula. Mitigação: usar `Locale.US` explicitamente — mesma convenção já adotada em `CoachAttentionSignalEvaluator` para as `Evidencia`s.

**[Risco] `explanation` nulo silencioso** — `@JsonInclude(NON_NULL)` omitiria o campo se `montarItem` falhar em construir `RecommendationExplanation`. Na v1, `explanation` NUNCA deve ser nulo (todos os sinais produzem rationale). Os testes do Bloco 4 assertam `explanation != null` explicitamente.

**[Decisão de design] `explanation` descreve apenas o sinal principal** — Os sinais secundários (ex.: `SEM_PLANO` quando o primário é `FADIGA CRITICA`) são acessíveis via `evidence[]` consolidado, mas não têm `rationale` próprio. Rationale multi-sinal é future change — se o produto quiser isso, usar `explanations: Map<MotivoAtencao, RecommendationExplanation>`.

**[Decisão de design] `explanation` é computado em memória, não persistido** — Auditoria histórica de explanations fora do escopo de v1 (ver Non-Goals do proposal).

---

## Migration Plan

Sem migration. Mudança aditiva: campo `explanation` com `@JsonInclude(NON_NULL)` não quebra consumers que não esperam o campo.

## Open Questions

- Q1: Quando LLM produzir explanations (Sprint 10+), `rationale` virá como texto livre do modelo ou haverá um template guia? Decisão na change futura.
- Q2: Frontend vai exibir `rationale` em tooltip, drawer, ou inline? Não bloqueia backend agora.
