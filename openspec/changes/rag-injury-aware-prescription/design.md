## Context

Esta change estende a KB universal (`rag-tool-calling-prescription-engine`) com o domínio de lesão e a integra ao fluxo de geração e à guarda de prescrição. O conhecimento de lesão é **universal** (return-to-run, contraindicações por tipo de lesão) → escopo **global**, como o resto da KB. O dado da lesão do atleta (`descricaoLesao`) é dinâmico → vem do atleta, não do vetor.

Stack: Spring Boot 3.5.x / Java 21, Spring AI + pgvector, Claude Sonnet 4. IDs `UUID`.

Invariante guia: **segurança é determinística**. As skills (`IntervaladoElegibilidadeSkill`, `RecoveryCargaSkill`) decidem o que bloquear; o RAG só enriquece a prescrição alternativa e a explicação. O LLM nunca recebe autoridade para reabilitar uma sessão bloqueada por regra.

## Goals

- Prescrição fundamentada para atletas lesionados (não apenas "regenerativo" genérico)
- Filtrar sessões contraindicadas para a lesão específica
- Detectar e escalar sinais de bandeira-vermelha ao coach
- Citar a fonte clínica na justificativa

## Non-Goals

- Diagnosticar lesão (o sistema não diagnostica; usa a `descricaoLesao` informada)
- Substituir avaliação de profissional de saúde
- Auto-ingestão de conteúdo clínico não curado (web scraping)
- Mover a decisão de bloqueio para o LLM

## Decisions

### D1: Lesão é um domínio da KB universal, não um store novo
Reusar a `vector_store` da change base com `domain = lesao` e `scope = global`. O corpus é universal e **não contém PII** — diferente do corpus tenant-scoped da metodologia do coach.

### D2: Corpus curado por profissional
Documentos de `knowledge-base/lesao/` SHALL ser revisados por profissional de saúde antes da ingestão. Cada chunk carrega `source` e (quando aplicável) referência clínica, para citação e auditoria.

### D3: Query de lesão a partir de texto livre + região
`descricaoLesao` é texto livre (ex.: "Tendinite no joelho direito"). `InjuryContextRetriever` monta a query combinando a descrição, a região corporal inferida e a fase de periodização. Recuperação filtra `domain = lesao` e `language = 'en'`.

### D4: Baixa confiança → conservador + escalar (não inferir protocolo específico)
Se a similaridade dos chunks recuperados ficar abaixo do threshold (a descrição não casa com nenhum protocolo conhecido), o sistema SHALL **não** inventar protocolo: prescreve conservador (regenerativo/cross-training) e **escala ao coach** via fila de atenção, com nota "lesão não mapeada — revisar".

### D5: RAG enriquece, skills decidem bloqueio (invariante de segurança)
O contexto de lesão recuperado alimenta: (a) o prompt de geração (como prescrever em torno da lesão) e (b) a lista de **tipos de sessão contraindicados**, repassada ao `TrainingPrescriptionGuardSkill`. A guarda **veta** sessões contraindicadas **após** a geração. Nenhum contexto RAG SHALL reabilitar uma sessão bloqueada por skill determinística.

### D6: Bandeira-vermelha → disclaimer + fila de atenção
Chunks marcados como `red_flag` (sintomas que exigem encaminhamento: dor aguda em repouso, edema com calor/vermelhidão, dor que piora progressiva) disparam: disclaimer obrigatório no plano ("procurar avaliação profissional") + item na fila de atenção do coach (`add-coach-attention-queue`), independentemente do conteúdo gerado.

### D7: Citação clínica
A `justificativaFisiologica` referente à adaptação por lesão SHALL citar a fonte recuperada (integração com `add-recommendation-explainability`).

## Architecture

```
PlanoSemanalService.gerarPlano(atletaId, semana)
        │
        ├── atleta.temLesao == true ?
        │        └── InjuryContextRetriever(descricaoLesao, regiao, fase)
        │                ├── vector_store (domain=lesao, scope=global)
        │                ├── chunks de protocolo  → contexto de geração (+ citação)
        │                ├── tipos contraindicados → TrainingPrescriptionGuardSkill
        │                └── red_flag?            → disclaimer + fila de atenção do coach
        │
        ├── [decisão de bloqueio permanece determinística]
        │        IntervaladoElegibilidadeSkill / RecoveryCargaSkill
        │
        └── geração (KB universal + tools + contexto de lesão)
                └── TrainingPrescriptionGuardSkill veta sessões contraindicadas
```

## Key Interfaces

```java
@Component
public class InjuryContextRetriever {
    // Recupera protocolo + contraindicações; vazio/baixa-confiança → fallback conservador
    public InjuryContext recuperar(String descricaoLesao, String regiao, FasePeriodizacao fase);
}

public record InjuryContext(
    List<String> protocoloChunks,          // para o prompt + citação
    Set<TipoTreino> sessoesContraindicadas, // para o guard
    boolean redFlag,
    List<String> fontes
) {}
```

## Migration Path

1. Depende de `rag-tool-calling-prescription-engine` (KB + PgVectorStore) mergeada
2. Adicionar `knowledge-base/lesao/` curado e ingerir via profile `rag-init`
3. Feature flag `app.ai.rag.injury.enabled` (default `false`)
4. Validar com casos reais de atletas lesionados (piloto) antes de ligar; comparar adequação da prescrição (revisão do coach) com/sem o contexto de lesão
