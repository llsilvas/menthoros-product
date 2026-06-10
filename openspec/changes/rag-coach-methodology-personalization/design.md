## Context

Esta change adiciona uma **segunda classe de dado vetorial** ao sistema, ortogonal à KB universal da `rag-tool-calling-prescription-engine`:

| Classe | Escopo | Filtro obrigatório | Conteúdo |
|---|---|---|---|
| KB universal | Global | `language`, `domain` | fisiologia, periodização (verdade universal) |
| **Metodologia do coach** | **Tenant/coach** | **`tenant_id` + `coach_id`** | exemplares de planos do próprio coach |

A premissa é few-shot por recuperação: em vez de descrever o estilo do coach em prompt estático, recuperar os exemplos reais mais parecidos com a situação atual e deixá-los ancorar a geração.

Stack: Spring Boot 3.5.x / Java 21, Spring AI + pgvector, LLM Claude Sonnet 4. IDs são `UUID`.

## Goals

- Personalizar a geração de plano ao estilo de cada coach via few-shot dos seus planos aprovados/corrigidos
- Criar loop de aprendizado: cada aprovação melhora o corpus do coach
- Garantir isolamento tenant/coach absoluto na recuperação
- Elevar a taxa de aceitação sem edição acima do teto alcançável só com KB universal

## Non-Goals

- Treinar/fine-tunar modelo de embedding ou LLM por coach (usar few-shot por recuperação, não fine-tuning)
- Compartilhar metodologia entre coaches/tenants (explicitamente proibido)
- Interface de curadoria de exemplares para o coach (escopo futuro; só purga via admin nesta fase)
- Substituir a KB universal — esta change a **complementa**

## Decisions

### D1: Escopo tenant/coach com guard obrigatório
Toda recuperação no corpus de metodologia SHALL passar por `CoachCorpusGuard`, que injeta filtro `tenant_id == <ctx>` E `coach_id == <ctx>` na busca. Não existe recuperação sem o filtro. Falha de contexto (sem tenant/coach) aborta a recuperação e cai no fallback de KB universal — nunca recupera "global" do corpus de coach.

### D2: O que é embeddado é um "resumo de situação", não o grafo de entidades
O texto embeddado por exemplar é um **resumo estruturado** montado por `SituacaoExemplarBuilder`:
- Snapshot do perfil do atleta no momento (nível, fase de periodização, objetivo/prova-alvo, restrições)
- Estado de carga resumido (faixa de CTL/TSB, não o valor exato — para generalizar)
- Estrutura do plano final (tipos de sessão, distribuição semanal, volume)
- Justificativa fisiológica final

Isso mantém o vetor semanticamente denso e evita `LazyInitializationException`/acoplamento a JPA (mesmo princípio das skills).

### D3: Indexar a versão FINAL do coach (a correção é o sinal de ouro)
- Plano **aprovado sem edição** → ingerir como exemplar de alta confiança (`quality=approved`)
- Plano **editado** → ingerir a **versão final do coach** (não a gerada pela IA), marcada `quality=edited`. A diferença entre o gerado e o corrigido é exatamente o que o coach quer e o sistema deve aprender.

### D4: Recuperação como few-shot, não como "contexto factual"
Os top-K exemplares recuperados são injetados no prompt como **exemplos** ("veja como você estruturou planos para situações semelhantes"), distintos dos chunks da KB universal (que entram como conhecimento) e dos resultados de tools (dados do atleta atual). O prompt SHALL separar claramente as três fontes.

### D5: Cold-start e fallback
Se o corpus do coach tiver menos de `app.ai.rag.coach.min-exemplares` (default 5) exemplares para a faixa de situação, o few-shot do coach SHALL ser omitido e a geração usa apenas KB universal + tools. Logar `coach-rag: cold-start, usando apenas KB universal`.

### D6: Ranking por similaridade + recência + qualidade
Score final do exemplar = `similaridade × peso_qualidade × decaimento_recência`:
- `peso_qualidade`: `approved` > `edited`
- `decaimento_recência`: exemplares mais recentes pesam mais (estilo do coach evolui)
- topK configurável (`app.ai.rag.coach.top-k`, default 3)

### D7: Partição física do vetor
Reusar a tabela `vector_store` da change base com `metadata.scope` (`global` | `tenant`) **ou** uma coleção dedicada `coach_methodology`. Decisão: **coleção/tabela dedicada** preferida para reduzir risco de query global acidentalmente varrer dados de coach. Se mantida a mesma tabela, o filtro de scope SHALL ser obrigatório em ambos os lados (KB universal filtra `scope=global`; coach filtra `scope=tenant` + ids).

### D8: Versionamento de embedding e retenção (LGPD)
- Metadata grava `embedding_model`+versão (consistente com a change base) para reindexação
- Purga: `DELETE /api/admin/rag/coach/{coachId}` remove todos os exemplares do coach; deleção de atleta remove exemplares que o referenciem

## Architecture

```
PlanoSemanalService.gerarPlano(atletaId, semana)   [atletaId/coachId do contexto]
        │
        ├── QuestionAnswerAdvisor      ──→ vector_store (scope=global)        [conhecimento universal]
        │
        ├── CoachMethodologyRetriever  ──→ coach_methodology (tenant+coach)   [few-shot do coach]
        │       └── CoachCorpusGuard.filtro(tenant_id, coach_id)  ← obrigatório
        │       └── cold-start? → omite few-shot (fallback KB universal)
        │
        └── AthleteQueryTools          ──→ dados do atleta (Tool Calling)     [estado atual]

Aprovação/edição de plano (instrumentação da change base)
        │
        └── CoachMethodologyCorpusService.ingest(plano final, coachId, tenantId)
                └── SituacaoExemplarBuilder → resumo estruturado → embedding → upsert idempotente
```

## Key Interfaces

```java
// Guard obrigatório em toda recuperação do corpus de coach (análogo ao TenantGuard das tools)
@Component
public class CoachCorpusGuard {
    public Filter.Expression scopedFilter(UUID tenantId, UUID coachId) { ... } // tenant_id AND coach_id
}

@Service
public class CoachMethodologyCorpusService {
    // Ingestão idempotente (dedup por planoId + hash do resumo)
    public void ingest(PlanoFinal plano, UUID coachId, UUID tenantId);
    public void purgeByCoach(UUID coachId);
}

@Component
public class CoachMethodologyRetriever {
    // Recupera top-K exemplares do próprio coach; lista vazia em cold-start
    public List<ExemplarPlano> recuperarSimilares(SituacaoAtleta situacao, UUID tenantId, UUID coachId);
}
```

## Migration Path

1. Depende de `rag-tool-calling-prescription-engine` mergeada (PgVectorStore + instrumentação de aceitação)
2. Feature flag `app.ai.rag.coach.enabled` (default `false`)
3. Fase de **acumulação**: o loop de ingestão liga primeiro (sem injetar few-shot) para construir corpus
4. Ligar a injeção de few-shot quando os coaches-piloto acumularem ≥ N exemplares; comparar taxa de aceitação com/sem few-shot do coach (A/B sobre a métrica já instrumentada)
