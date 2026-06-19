# Design: manual-training-entry-lightweight

## Decisões de Design

### D1 — Reutilizar `TreinoService.lancarTreino()` vs. novo método

**Opção A (escolhida):** criar `TreinoService.registrarTreinoManualAtleta(UUID atletaId, TreinoManualInputDto)` que: resolve atleta por athleteId+tenant, seta campos fixos (fonteDados=MANUAL, status=REALIZADO, criadoPor="ATLETA", fcMedia=null, paceMedia=null), executa best-effort match, salva, publica `TreinoRegistradoEvent`.

**Confirmado no código:** `lancarTreino()` **não chama `TssCalculatorService` diretamente** — TSS é calculado assincronamente pelo handler do `TreinoRegistradoEvent` (que já existe). O novo método deve seguir o mesmo padrão: salvar + publicar evento + chamar `tsbService.atualizarTsbDia()`. O listener existente calcula o TSS automaticamente.

**Opção B:** Criar serviço separado `AtletaTreinoService`. Descartada — duplicaria lógica de evento, TSB e match com planejado.

---

### D2 — Path do endpoint do atleta

**Escolhido:** `POST /api/v1/atletas/me/treinos`

**Alternativas descartadas:**
- `POST /api/v1/treinos/me` — inconsistente com a convenção `/atletas/me/` dos progress endpoints (Sprint 5)
- `POST /api/v1/atletas/{atletaId}/treinos/manual` — expõe atletaId no path, permite tentativa cross-tenant

**Convenção:** seguir `/atletas/me/` igual a `GET /atletas/me/resumo/hoje` (Add-athlete-progress-endpoints, Sprint 5).

---

### D3 — TipoTreino v1: running-only

**Decisão:** usar enum `TipoTreino` existente sem alterações no v1. O formulário exibe os 10 tipos com labels amigáveis em PT-BR.

| Enum | Label no Form |
|---|---|
| REGENERATIVO | Recuperação |
| FACIL | Corrida fácil |
| CONTINUO | Corrida contínua |
| LONGO | Corrida longa |
| TEMPO_RUN | Tempo Run (limiar) |
| FARTLEK | Fartlek |
| INTERVALADO | Intervalado |
| TIRO | Tiros |
| SUBIDA | Subidas |
| PROVA | Prova / Competição |

**Follow-up (fora do escopo):** adicionar MUSCULACAO, NATACAO, BICICLETA ao enum e a `fatorImpacto` correspondente — change futura `add-cross-training-types`.

---

### D4 — Best-effort match com TreinoPlanejado

**Problema:** o avaliador de aderência lê `TreinoPlanejado.statusTreino` — um treino manual sem vínculo não atualiza o status do planejado, gerando falso positivo de aderência baixa.

**Estado do código:** `TreinoPlanejadoRepository.matchByAtletaAndDateAndType()` existe mas **não filtra por `treinoRealizado IS NULL`** — pode sobrescrever vínculo existente. É necessário **novo método** no repositório.

**Decisão:** criar `findFirstByAtletaIdAndDataTreinoAndTipoTreinoAndTreinoRealizadoIsNull()` com JPQL:
```java
@Query("SELECT tp FROM TreinoPlanejado tp WHERE tp.atleta.id = :atletaId AND tp.dataTreino = :data AND tp.tipoTreino = :tipo AND tp.treinoRealizado IS NULL AND tp.statusTreino IN ('PERDIDO', 'PLANEJADO') ORDER BY tp.criadoEm ASC")
Optional<TreinoPlanejado> findFirstForManualMatch(@Param("atletaId") UUID atletaId, @Param("data") LocalDate data, @Param("tipo") TipoTreino tipo);
```

**Fluxo de match:**
1. Chama `findFirstForManualMatch(atletaId, data, tipo)`.
2. Se encontrado: atualiza `statusTreino = REALIZADO`, seta `treinoRealizado = treinoSalvo`, salva `TreinoPlanejado`.
3. Seta `treinoRealizado.treinoPlanejadoId = treinoPlanejado.getId()`.
4. Se não encontrado: persiste standalone com `treinoPlanejadoId = null`. Sem erro.

**Cenário de ambiguidade:** atleta tem dois treinos planejados do mesmo tipo no mesmo dia (raro, mas possível em duplos). Nesse caso, vincula o primeiro encontrado (ordenado por `criadoEm`). Comportamento documentado — não tratar no v1.

**Impacto na fila de atenção:** após match bem-sucedido, `avaliarAderencia()` não conta mais o treino planejado como perdido. O sinal de inatividade some assim que o treino manual entra no banco (independente do match).

---

### D5 — GET /atletas/me/treinos

**Parâmetro:** `dias` — Integer, default=7, max=30 (validado com `@Max(30)`).

**Ordenação:** `dataTreino DESC, criadoEm DESC`.

**Campos retornados:** `TreinoRealizadoOutputDto` existente + campo `fonteDados` (já presente no DTO? verificar — se não, adicionar).

**Paginação:** não necessária para 30 dias de dados (máximo ~60 treinos). Adicionar em follow-up se o volume aumentar com first-party-ingestion.

---

### D6 — Conversão duracaoMinutos → Duration

**Problema:** `TreinoRealizado.duracaoMin` é `java.time.Duration` (mapeado como `INTERVAL_SECOND` no PostgreSQL). O form e o DTO enviam `duracaoMinutos` como `Integer`.

**Solução no mapper:**
```java
// TreinoMapper.toEntity(TreinoManualInputDto input)
entity.setDuracaoMin(Duration.ofMinutes(input.duracaoMinutos()));
```

O OutputDto deve serializar `duracaoMin` como minutos inteiros para o frontend:
```java
// No TreinoRealizadoOutputDto ou no mapper
int duracaoMinutos = (int) treinoRealizado.getDuracaoMin().toMinutes();
```

Verificar se `TreinoRealizadoOutputDto` já tem esse campo como `Integer` ou como `String` de `Duration`.

---

### D7 — UPDATE retroativo de fonte_dados

**Decisão: NÃO executar UPDATE retroativo.**

Registros existentes com `fonte_dados = NULL` são tratados como `IMPORTADO` via lógica de aplicação. O UPDATE retroativo em produção gera risco de lock de tabela desnecessário.

**Implementação:** onde o código lê `fonteDados`, tratar `null` como `FonteDados.IA_GERADO` ou `STRAVA` conforme o campo `externalId` — ou simplesmente não exibir badge de fonte quando null.

---

### D8 — Data máxima retroativa: 7 dias

**Problema:** backfill retroativo mascara inatividade real (atleta para 3 semanas, registra tudo de uma vez, sinal some).

**Decisão:** validar no endpoint que `data >= LocalDate.now().minusDays(7)`. Erro 422 para datas mais antigas. Coach pode lançar treinos retroativos ilimitados pelo endpoint TECNICO existente.

---

## Modelo de Dados (sem novas tabelas)

Campos relevantes em `tb_treino_realizado` confirmados como existentes:

```
percepcao_esforco     INTEGER  CHECK (1..10)   -- nullable ✓
fonte_dados           VARCHAR(50)              -- nullable, enum FonteDados ✓
distancia_km          DECIMAL(10,3)            -- nullable ✓
duracao_min           INTERVAL SECOND          -- mapeado como Duration ✓
criado_por            VARCHAR(100)             -- nullable ✓
treino_planejado_id   UUID                     -- nullable, FK ✓
status                VARCHAR(30)              -- NOT NULL ✓
```

**Migration V37:** somente se `fc_media` ou `pace_media` forem `NOT NULL` no DDL de V1. Verificar antes de criar. Se necessário:

```sql
-- V37__Make_fc_media_pace_media_nullable.sql
ALTER TABLE tb_treino_realizado 
    ALTER COLUMN fc_media DROP NOT NULL,
    ALTER COLUMN pace_media DROP NOT NULL;
```

---

## Fluxo de Dados

```
Atleta (form) 
  → POST /api/v1/atletas/me/treinos
  → AtletaTreinoController (resolve atletaId via JWT)
  → TreinoService.registrarTreinoManualAtleta()
      ├── mapper: TreinoManualInputDto → TreinoRealizado (Duration.ofMinutes, fonteDados=MANUAL)
      ├── TssCalculatorService.calcularTss(treinoRealizado) → metodo RPE
      ├── best-effort match → TreinoPlanejadoRepository.findByAtletaIdAndDataAndTipoAndSemRealizado()
      │       └── se encontrado: TreinoPlanejado.statusTreino = REALIZADO
      ├── treinoRealizadoRepository.save()
      ├── eventPublisher.publishEvent(new TreinoRegistradoEvent(...))
      └── tsbService.atualizarTsbDia(atletaId, data)
  → 201 TreinoRealizadoOutputDto

Coach (shell) ← fila de atenção atualizada (inatividade some, aderência melhora se match)
```

---

## Integração com outras changes

| Change | Relação |
|---|---|
| `athlete-profile-drilldown` (9f) | Consome `GET /atletas/me/treinos?dias=7` no bloco "Plano da semana" e "Aderência" |
| `add-post-workout-debrief` (Sprint 24) | Usa `TreinoRealizado` com `fonteDados=MANUAL` como contraparte do planejado |
| `first-party-ingestion-architecture` (Sprint 22) | Substitui o log manual por importação de `.fit`; os dois convivem via `fonteDados` |
| `add-coach-attention-queue` ✅ | Beneficiado imediatamente: `avaliarInatividade` e `avaliarAderencia` passam a ter dado real |

---

## Pré-mortem: Principais Riscos Residuais

Os riscos foram tratados na proposal. Riscos que permanecem como follow-up consciente:

1. **TSS por RPE vs. TSS real (Sprint 22):** quando o `.fit` chegar, o histórico manual vai ter ~20–30% de desvio. Recalibração retroativa deve ser feature explícita do `first-party-ingestion-architecture`. Documentar isso no `tasks.md` daquela change.

2. **Observações livres injetadas no contexto LLM:** `feedbackAtleta`/`observacoes` entram no `PlanoTreinoPromptBuilder`. Sanitização de max_chars e remoção de padrões óbvios de injeção deve entrar na change de `rag-tool-calling-prescription-engine` (Sprint 12–14) quando o contexto prompt for reestruturado.
