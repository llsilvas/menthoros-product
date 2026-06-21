# Design: infer-thresholds-from-recent-workouts

## Decisões Técnicas

### 1. Trigger de inferência — condição de staleness

A inferência é ativada independentemente para FC e pace, com a mesma condição:

```java
// Para FC
boolean fcLimiarDesatualizado =
    atleta.getFcLimiar() == null ||
    atleta.getDataUltimoTesteFc() == null ||
    ChronoUnit.DAYS.between(atleta.getDataUltimoTesteFc(), LocalDate.now()) > 90;

// Para pace
boolean paceLimiarDesatualizado =
    atleta.getPaceLimiar() == null ||
    atleta.getDataUltimoTestePace() == null ||
    ChronoUnit.DAYS.between(atleta.getDataUltimoTestePace(), LocalDate.now()) > 90;
```

> **Nota:** `LocalDate.now()` é chamado no `PlanoTreinoPromptBuilder` (contexto de serviço HTTP), não dentro do `ThresholdInferenceService`. Isso preserva a testabilidade — os testes do service recebem `LocalDate` via parâmetro.

### 2. Algoritmo de inferência

**FC limiar estimado:**

```
entrada: List<TreinoRealizado> — últimos 30 dias
filtro:
  - fcMedia != null E fcMedia > 0
  - duracaoMin != null E duracaoMin.toMinutes() > 20
cálculo:
  1. Ordenar fcMedia decrescente (maiores valores primeiro)
  2. Pegar os top 20% (= max(1, Math.ceil(n * 0.20)) itens)
  3. Calcular mediana desse subconjunto
saída: fcLimiarEstimado (Integer, bpm)
```

Lógica: o quintil superior de FC nos treinos representa os momentos de esforço mais intenso — próximos ou no limiar anaeróbico. A mediana (não a média) é robusta a leituras espúrias de cardíaco.

**Pace limiar estimado:**

```
entrada: List<TreinoRealizado> — últimos 30 dias
filtro:
  - tipoTreino IN (CONTINUO, LONGO, TEMPO_RUN, FARTLEK)
  - paceMedia != null E paceMedia.getSeconds() > 0
  - duracaoMin != null E duracaoMin.toMinutes() > 20
cálculo:
  1. Ordenar paceMedia.getSeconds() crescente (paces mais rápidos primeiro)
  2. Pegar os top 20% (menor segundos = mais rápido)
  3. Calcular mediana em segundos e converter para BigDecimal minutos decimais
saída: paceLimiarEstimado (BigDecimal, decimal de minutos/km, ex: 4.75 = 4:45/km)
```

Lógica: o quintil superior de pace em treinos contínuos sem tiro representa esforços de corrida a ritmo de limiar ou próximo. Excluem-se INTERVALADO e TIRO porque seus paces são supramáximos e inflariam artificialmente o limiar.

**Confiança:**

| Amostras válidas | Nível |
|---|---|
| ≥ 10 | ALTA |
| 5–9 | MEDIA |
| 3–4 | BAIXA |
| < 3 | INSUFICIENTE — não injeta Constraint |

### 3. Componente `ThresholdInferenceService`

```java
@Component
public class ThresholdInferenceService {

    // Janela de análise em dias
    private static final int JANELA_DIAS = 30;

    // Tamanho mínimo de amostra para inferir
    static final int MIN_AMOSTRAS = 3;

    // Duração mínima de treino para ser incluído na inferência
    static final long MIN_DURACAO_MIN = 20;

    // Percentual do quintil superior
    private static final double FATOR_QUINTIL = 0.20;

    /**
     * Idempotent: YES — leitura pura, sem side effects
     * Side Effects: NONE
     * Tenant-aware: YES (lista de treinos já filtrada pelo caller)
     */
    public Optional<ThresholdEstimate> inferirFcLimiar(
            List<TreinoRealizado> treinos30d, LocalDate hoje) { ... }

    /**
     * Idempotent: YES — leitura pura, sem side effects
     * Side Effects: NONE
     * Tenant-aware: YES (lista de treinos já filtrada pelo caller)
     */
    public Optional<ThresholdEstimate> inferirPaceLimiar(
            List<TreinoRealizado> treinos30d, LocalDate hoje) { ... }
}
```

**Output record:**

```java
public record ThresholdEstimate(
    String tipo,           // "FC_LIMIAR" | "PACE_LIMIAR"
    Number valor,          // Integer (bpm) para FC; BigDecimal (min decimal) para pace
    int amostras,          // quantos treinos foram usados
    ConfiancaInferencia confianca  // enum ALTA | MEDIA | BAIXA
) {}

public enum ConfiancaInferencia { ALTA, MEDIA, BAIXA }
```

O service recebe a lista de treinos já carregada (pelo `PlanoTreinoPromptBuilder`) para não introduzir uma nova query — os treinos dos últimos 30 dias já são consultados pelo `IaServiceImpl` no contexto de geração de plano.

### 4. Formato do Constraint injetado

```
[LIMIAR_FC_ESTIMADO] FC limiar inferido: 163 bpm
  Fonte: mediana dos 20% maiores FC em 15 treinos dos últimos 30d | Confiança: ALTA
  ATENÇÃO: valor estimado por inferência — os valores das zonas de FC derivados deste limiar devem ser tratados como referência aproximada. Recomendar teste formal ao atleta.

[LIMIAR_PACE_ESTIMADO] Pace limiar inferido: 4:45/km (4.75 min/km decimal)
  Fonte: mediana dos 20% paces mais rápidos em treinos contínuos >20min | Confiança: MEDIA
  ATENÇÃO: valor estimado por inferência — usar como base para zonas de pace, mas com margem de ±5s/km nas prescrições.
```

Quando o limiar oficial está atual (≤ 90 dias), o Constraint não é emitido — as zonas usam os valores reais normalmente.

Quando a confiança é BAIXA (3–4 amostras), o Constraint é emitido com instrução adicional:
```
  ⚠️ CONFIANÇA BAIXA (apenas 3 treinos) — ampliar margem de prescrição em ±10s/km ou ±5 bpm.
```

### 5. Integração em `PlanoTreinoPromptBuilder`

O builder recebe os treinos via `ContextoTreino ctx = treinoHistoricoProvider.prepararContexto(atleta)`, que expõe `ctx.treinosUltimas4Semanas()` (janela de 28 dias). O `ThresholdInferenceService` filtra internamente para os últimos 30 dias via `dataTreino` — a diferença de 2 dias é irrelevante estatisticamente.

```java
// PlanoTreinoPromptBuilder.buildOptimizedPrompt(...)
// (já existente) ctx = treinoHistoricoProvider.prepararContexto(atleta)

// (já existente) bloco [1] - dados fisiológicos com valores oficiais
sb.append(dadosFisiologicosFormatter.formatar(atleta));

// (novo) — inferência de limiar quando desatualizado
LocalDate hoje = LocalDate.now();
List<TreinoRealizado> treinos = ctx.treinosUltimas4Semanas();
Optional<ThresholdEstimate> estimativaFc = Optional.empty();
Optional<ThresholdEstimate> estimativaPace = Optional.empty();

if (fcLimiarDesatualizado(atleta, hoje)) {
    estimativaFc = thresholdInferenceService.inferirFcLimiar(treinos, hoje);
    estimativaFc.ifPresent(est -> sb.append(thresholdConstraintFormatter.formatarConstraintFc(est)));
}
if (paceLimiarDesatualizado(atleta, hoje)) {
    estimativaPace = thresholdInferenceService.inferirPaceLimiar(treinos, hoje);
    estimativaPace.ifPresent(est -> sb.append(thresholdConstraintFormatter.formatarConstraintPace(est)));
}
```

As variáveis `estimativaFc` e `estimativaPace` são retornadas ao caller junto com o plano gerado para popular o campo `limiareisInferidos` no response DTO.

### 6. Ausência de side effects no banco

O `ThresholdInferenceService` é stateless. Não injeta repositórios nem persiste dados.
`Atleta.fcLimiar`, `Atleta.paceLimiar`, `dataUltimoTesteFc`, `dataUltimoTestePace` permanecem intactos.

A única saída é o texto adicionado ao prompt.

### 7. Cálculo da mediana

```java
private static <T extends Comparable<T>> T mediana(List<T> lista) {
    // lista deve estar ordenada antes de chamar
    int n = lista.size();
    if (n % 2 == 1) return lista.get(n / 2);
    // para par, pega o inferior (conservador — subestima levemente)
    return lista.get(n / 2 - 1);
}
```

Para FC (Integer) e pace (Long de segundos), a mediana inteira conservadora é adequada — o arredondamento é < 1bpm / < 1s/km.

### 8. Campo `limiareisInferidos` no response

O response da geração de plano (`PlanoSemanalOutputDto` ou um DTO wrapper dedicado) inclui um campo opcional:

```java
// dto/output/LimiarInferidoDto.java
public record LimiarInferidoDto(
    String tipo,             // "FC_LIMIAR" | "PACE_LIMIAR"
    String valorFormatado,   // "163 bpm" | "4:45/km"
    int amostras,
    ConfiancaInferencia confianca
) {}

// campo em PlanoSemanalOutputDto (ou no response wrapper da geração):
@JsonInclude(JsonInclude.Include.NON_NULL)
List<LimiarInferidoDto> limiareisInferidos;
```

**Persistência:** o campo NÃO é armazenado no banco. Ele é montado no service de geração a partir dos `Optional<ThresholdEstimate>` devolvidos pelo builder e incluído apenas no response de `POST /api/v1/planos/atletas/{atletaId}/gerar`. Consultas subsequentes ao plano (GET) não incluem esse campo.

**Leitura no frontend:** a `CoachPlanReviewPage` exibe o banner com base nos dados retornados pela chamada de geração e mantidos no estado local (context ou store) enquanto o coach está na sessão de revisão.

### 9. Diagrama de fluxo da geração de plano com inferência

```
PlanoTreinoPromptBuilder.buildOptimizedPrompt(ctx)
  │
  ├─ [1] Dados fisiológicos (fcLimiar oficial, paceLimiar oficial, zonas calculadas)
  │
  ├─ [NOVO] Se fcLimiar desatualizado:
  │    ThresholdInferenceService.inferirFcLimiar(treinos30d)
  │    → Optional<ThresholdEstimate>
  │    → se presente: Constraint [LIMIAR_FC_ESTIMADO] adicionado ao prompt
  │
  ├─ [NOVO] Se paceLimiar desatualizado:
  │    ThresholdInferenceService.inferirPaceLimiar(treinos30d)
  │    → Optional<ThresholdEstimate>
  │    → se presente: Constraint [LIMIAR_PACE_ESTIMADO] adicionado ao prompt
  │
  ├─ [2] Histórico de pace (PaceHistoricoFormatter — já existente)
  │    Teto de pace por tipo — continua como antes
  │
  └─ [3..N] Restante do prompt (treinos recentes, TSB/CTL, objetivos, etc.)
```
