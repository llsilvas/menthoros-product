# Design: infer-thresholds-from-recent-workouts

## Decisões Técnicas

### 1. Arquitetura geral — onde a inferência roda

A inferência de limiares **não roda na geração de plano** — roda quando os metadados do atleta são atualizados, ou seja, após cada treino registrado.

Razão: `TsbServiceImpl.atualizarMetaDados(UUID atletaId, MetricasDiarias metricas)` (linha 238–267) já é o ponto de atualização de todas as métricas calculadas do atleta — CTL, ATL, TSB, alertas. Adicionar `fcLimiarEstimado` e `paceLimiarEstimado` aqui é consistente com o padrão existente e mantém `PlanoMetaDados` como repositório único de estado calculado por atleta.

Benefícios:
- O `PlanoTreinoPromptBuilder` lê os valores calculados (não computa) → geração de plano mais rápida
- Os valores são sempre atuais quando o plano é gerado, independente de quantos planos o coach gerar
- A `CoachPlanReviewPage` pode ler os dados do endpoint de perfil que já existe — sem estado efêmero no frontend
- A inferência roda uma vez por treino registrado, não uma vez por plano gerado

### 2. Novos campos em `PlanoMetaDados` — migration V40

```sql
-- V40__Add_threshold_inference_to_plano_metadados.sql
ALTER TABLE tb_plano_metadados
    ADD COLUMN IF NOT EXISTS fc_limiar_estimado      INTEGER,
    ADD COLUMN IF NOT EXISTS pace_limiar_estimado    DECIMAL(5,4),
    ADD COLUMN IF NOT EXISTS confianca_inferencia_fc VARCHAR(10),
    ADD COLUMN IF NOT EXISTS confianca_inferencia_pace VARCHAR(10),
    ADD COLUMN IF NOT EXISTS data_inferencia_limiar  DATE;
```

Todos nullable — `NULL` significa "nunca inferido" ou "insuficiente amostra". Não há migration reversa: os dados estimados são sempre recalculáveis.

Campos correspondentes na entidade:
```java
@Column(name = "fc_limiar_estimado")
private Integer fcLimiarEstimado;

@Column(name = "pace_limiar_estimado", precision = 5, scale = 4)
private BigDecimal paceLimiarEstimado;

@Enumerated(EnumType.STRING)
@Column(name = "confianca_inferencia_fc", length = 10)
private ConfiancaInferencia confiancaInferenciaFc;

@Enumerated(EnumType.STRING)
@Column(name = "confianca_inferencia_pace", length = 10)
private ConfiancaInferencia confiancaInferenciaPace;

@Column(name = "data_inferencia_limiar")
private LocalDate dataInferenciaLimiar;
```

### 3. Algoritmo de inferência

**FC limiar estimado:**
```
entrada: List<TreinoRealizado> — últimos 30 dias
filtro:
  - fcMedia != null E fcMedia > 0
  - duracaoMin.toMinutes() > 20
cálculo:
  1. Ordenar fcMedia decrescente
  2. Top 20%: max(1, ceil(n × 0.20)) elementos
  3. Mediana do subconjunto (índice n/2 - 1 para n par → conservador)
saída: Integer (bpm)
```

**Pace limiar estimado:**
```
entrada: List<TreinoRealizado> — últimos 30 dias
filtro:
  - tipoTreino IN (CONTINUO, LONGO, TEMPO_RUN, FARTLEK)
  - paceMedia.getSeconds() > 0 E duracaoMin.toMinutes() > 20
cálculo:
  1. Ordenar paceMedia.getSeconds() crescente (menor = mais rápido)
  2. Top 20% mais rápidos
  3. Mediana em segundos → BigDecimal decimal de minutos (segundos / 60, 4 casas)
saída: BigDecimal (ex: 4.7500 = 4:45/km)
```

**Confiança:**
| Amostras válidas | Nível |
|---|---|
| ≥ 10 | ALTA |
| 5–9 | MEDIA |
| 3–4 | BAIXA |
| < 3 | INSUFICIENTE → não persiste (mantém `NULL`) |

### 4. `ThresholdInferenceService` — componente puro

```java
// services/helper/ThresholdInferenceService.java
@Component
public class ThresholdInferenceService {

    static final int MIN_AMOSTRAS = 3;
    static final long MIN_DURACAO_MIN = 20;
    private static final double FATOR_QUINTIL = 0.20;

    /**
     * Idempotent: YES · Side Effects: NONE · Tenant-aware: YES (lista já filtrada pelo caller)
     */
    public Optional<ThresholdEstimate> inferirFcLimiar(List<TreinoRealizado> treinos, LocalDate hoje) { ... }

    /**
     * Idempotent: YES · Side Effects: NONE · Tenant-aware: YES (lista já filtrada pelo caller)
     */
    public Optional<ThresholdEstimate> inferirPaceLimiar(List<TreinoRealizado> treinos, LocalDate hoje) { ... }
}

public record ThresholdEstimate(Number valor, int amostras, ConfiancaInferencia confianca) {}
public enum ConfiancaInferencia { ALTA, MEDIA, BAIXA }
```

O service é stateless e sem repositórios injetados — testabilidade total. O caller (TsbServiceImpl) fornece a lista de treinos.

### 5. Integração em `TsbServiceImpl.atualizarMetaDados()`

```java
// TsbServiceImpl — após aplicarAnalise, antes de save()
private void atualizarMetaDados(UUID atletaId, MetricasDiarias metricas) {
    PlanoMetaDados metaDados = planoMetaDadosRepository.findByAtletaId(atletaId)...;

    // (existente) CTL, ATL, TSB, diasConsecutivos, alertas...
    metaDados.setCtlAtual(metricas.getCtl());
    // ...
    metaDados.aplicarAnalise(metricasAlertaService.analisarMetricas(...));

    // (NOVO) inferência de limiares quando desatualizados
    LocalDate hoje = LocalDate.now();
    Atleta atleta = metricas.getAtleta();
    atualizarLimiareInferidos(atletaId, atleta, metaDados, hoje);

    planoMetaDadosRepository.save(metaDados);
}

private void atualizarLimiareInferidos(UUID atletaId, Atleta atleta,
                                        PlanoMetaDados metaDados, LocalDate hoje) {
    boolean fcStale  = atleta.getFcLimiar() == null || atleta.getDataUltimoTesteFc() == null
                    || ChronoUnit.DAYS.between(atleta.getDataUltimoTesteFc(), hoje) > 90;
    boolean paceStale = atleta.getPaceLimiar() == null || atleta.getDataUltimoTestePace() == null
                    || ChronoUnit.DAYS.between(atleta.getDataUltimoTestePace(), hoje) > 90;

    if (!fcStale && !paceStale) return; // nada a fazer

    // Query única para 30 dias — reutiliza o repositório já injetado
    List<TreinoRealizado> treinos30d = treinoRealizadoRepository
            .findByAtletaIdAndDataTreinoBetween(atletaId, hoje.minusDays(30), hoje);

    if (fcStale) {
        thresholdInferenceService.inferirFcLimiar(treinos30d, hoje)
                .ifPresent(est -> {
                    metaDados.setFcLimiarEstimado((Integer) est.valor());
                    metaDados.setConfiancaInferenciaFc(est.confianca());
                    metaDados.setDataInferenciaLimiar(hoje);
                });
    }
    if (paceStale) {
        thresholdInferenceService.inferirPaceLimiar(treinos30d, hoje)
                .ifPresent(est -> {
                    metaDados.setPaceLimiarEstimado((BigDecimal) est.valor());
                    metaDados.setConfiancaInferenciaPace(est.confianca());
                    metaDados.setDataInferenciaLimiar(hoje);
                });
    }
}
```

**Query adicional:** uma `findByAtletaIdAndDataTreinoBetween` por atualização de metadados quando limiares estão stale. Aceitável — `atualizarMetaDados` já faz 2–3 queries; mais uma para 30 dias de treinos é desprezível. O guard `if (!fcStale && !paceStale) return;` garante que atletas com limiares atualizados não pagam o custo.

### 6. Leitura em `PlanoTreinoPromptBuilder` — sem computação

O builder lê os valores pré-calculados de `PlanoMetaDados`. Não instancia `ThresholdInferenceService`:

```java
// PlanoTreinoPromptBuilder.buildOptimizedPrompt(...)
// (já existente) bloco [1] — dados fisiológicos
sb.append(dadosFisiologicosFormatter.formatar(atleta));

// (NOVO) se limiar estimado persistido e limiar oficial stale: emitir Constraint
if (metaDados.getFcLimiarEstimado() != null && fcLimiarDesatualizado(atleta)) {
    sb.append(thresholdConstraintFormatter.formatarConstraintFc(
        metaDados.getFcLimiarEstimado(),
        metaDados.getConfiancaInferenciaFc(),
        metaDados.getDataInferenciaLimiar()
    ));
}
if (metaDados.getPaceLimiarEstimado() != null && paceLimiarDesatualizado(atleta)) {
    sb.append(thresholdConstraintFormatter.formatarConstraintPace(
        metaDados.getPaceLimiarEstimado(),
        metaDados.getConfiancaInferenciaPace(),
        metaDados.getDataInferenciaLimiar()
    ));
}
```

O `metaDados` já é carregado pelo `IaServiceImpl` para acessar CTL/ATL/TSB — sem query adicional.

### 7. Formato do Constraint injetado

```
[LIMIAR_FC_ESTIMADO] FC limiar inferido: 163 bpm (inferido em 2026-06-15)
  Fonte: mediana dos 20% maiores FC em 15 treinos dos últimos 30d | Confiança: ALTA
  ATENÇÃO: valor estimado por inferência — zonas derivadas são aproximadas. Recomendar teste formal.

[LIMIAR_PACE_ESTIMADO] Pace limiar inferido: 4:45/km (inferido em 2026-06-15)
  Fonte: mediana dos 20% paces mais rápidos em treinos contínuos >20min | Confiança: MEDIA
  ATENÇÃO: valor estimado — usar com margem de ±5s/km nas prescrições.
```

Confiança BAIXA adiciona:
```
  ⚠️ CONFIANÇA BAIXA (apenas 3 treinos) — ampliar margem em ±10s/km ou ±5 bpm.
```

### 8. Exposição ao frontend via `PlanoMetaDadosOutputDto`

Os campos estimados são adicionados ao `PlanoMetaDadosOutputDto` já existente:

```java
public record PlanoMetaDadosOutputDto(
    // ... campos existentes (ctlAtual, atlAtual, tsbAtual, etc.)
    @JsonInclude(JsonInclude.Include.NON_NULL) Integer fcLimiarEstimado,
    @JsonInclude(JsonInclude.Include.NON_NULL) String paceLimiarEstimadoFormatado, // "4:45/km"
    @JsonInclude(JsonInclude.Include.NON_NULL) ConfiancaInferencia confiancaInferenciaFc,
    @JsonInclude(JsonInclude.Include.NON_NULL) ConfiancaInferencia confiancaInferenciaPace,
    @JsonInclude(JsonInclude.Include.NON_NULL) LocalDate dataInferenciaLimiar
) {}
```

O `GET /coach/atletas/{id}/perfil` (endpoint `athlete-profile-drilldown`) já retorna `PlanoMetaDadosOutputDto` — o frontend recebe os campos estimados automaticamente sem novo endpoint.

A `CoachPlanReviewPage` lê esses campos ao carregar o perfil do atleta antes da revisão e exibe o banner quando presentes. Nenhum estado efêmero nem resposta da geração necessários.

### 9. Diagrama de fluxo completo

```
TreinoRealizado registrado
  │
  ▼
TsbServiceImpl.atualizarTsbDia()
  │
  ▼
TsbServiceImpl.atualizarMetaDados()
  ├─ CTL / ATL / TSB / alertas (existente)
  ├─ [NOVO] atualizarLimiareInferidos():
  │    Se fcLimiar stale → inferirFcLimiar(treinos30d) → metaDados.fcLimiarEstimado
  │    Se paceLimiar stale → inferirPaceLimiar(treinos30d) → metaDados.paceLimiarEstimado
  └─ planoMetaDadosRepository.save()


Coach gera plano
  │
  ▼
PlanoTreinoPromptBuilder.buildOptimizedPrompt()
  ├─ [1] Dados fisiológicos (limiar oficial, zonas)
  ├─ [NOVO] Se metaDados.fcLimiarEstimado != null E fcLimiar stale:
  │    → Constraint [LIMIAR_FC_ESTIMADO] (lê do banco, não computa)
  ├─ [NOVO] Se metaDados.paceLimiarEstimado != null E paceLimiar stale:
  │    → Constraint [LIMIAR_PACE_ESTIMADO]
  └─ [2..N] Restante do prompt (treinos recentes, TSB/CTL, objetivos)


CoachPlanReviewPage carrega atleta
  │
  ▼
GET /coach/atletas/{id}/perfil
  → PlanoMetaDadosOutputDto com fcLimiarEstimado, confiancaInferenciaFc
  → Banner exibido quando fcLimiarEstimado != null
```
