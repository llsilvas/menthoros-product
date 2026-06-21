# Design: fix-intervalado-distance-calculation

## Causa Raiz Detalhada

```
LLM gera:
  AQUECIMENTO 10min → distanciaKm = 2.5  (pace Z5: 4:00/km ← ERRADO)
  INTERVALADO 5×400m → distanciaKm = 2.0  (0.4 × 5 ← correto)
  RECUPERACAO 5×2min → distanciaKm = 5.0  (pace Z5: 4:00/km × 10min ← ERRADO)
  DESAQUECIMENTO 10min → distanciaKm = 2.5  (pace Z5: 4:00/km ← ERRADO)
  TreinoPlanejado.distanciaKm = 10.0

somarDistancias(etapas) = 2.5 + 2.0 + 5.0 + 2.5 = 12.0
desvio = |12.0 - 10.0| / 10.0 = 20% → reconciliação substitui por 12.0 (ainda errado)
                                        OR LLM gera total = soma → desvio ≈ 0% → nada acontece

Esperado:
  AQUECIMENTO 10min a Z2 (7:00/km) → distanciaKm = 1.43
  INTERVALADO 5×400m → distanciaKm = 2.0
  RECUPERACAO 5×2min a Z1 (8:00/km) → distanciaKm = 1.25
  DESAQUECIMENTO 10min a Z2 (7:00/km) → distanciaKm = 1.43
  Total correto: 6.11 km
```

## Decisão de Implementação

### Onde implementar

Adicionar o método `corrigirDistanciasEtapasTemporais(List<EtapaTreinoLlmDto>, BigDecimal paceLimiar)` em `IaServiceImpl` como método privado (consistente com o padrão atual do arquivo).

Alternativa descartada: extrair para `EtapaDistanceCalculatorService` separado — o volume de código não justifica uma nova classe neste momento. `IaServiceImpl` já tem 1500+ linhas; uma nova classe seria preferível em uma refatoração maior, mas está fora do escopo de um XS.

O método é chamado **antes** de `normalizarTreinoIntervalado()` e `reconciliarDistanciaComEtapas()` na pipeline de pós-processamento.

### Assinatura

```java
/**
 * Deriva distanciaKm para etapas time-based (AQUECIMENTO, DESAQUECIMENTO, RECUPERACAO)
 * a partir de duracaoMin ÷ paceZona. Substitui qualquer valor fornecido pelo LLM,
 * que frequentemente usa o pace de tiro em vez do pace fácil.
 *
 * Idempotent: YES · Side Effects: NONE · Tenant-aware: NO (stateless)
 *
 * @param etapas lista de etapas do LLM
 * @param paceLimiar pace de limiar do atleta em min/km decimal (ex: 4.5 = 4:30/km), pode ser null
 * @return nova lista com distanciaKm corrigido para etapas temporais
 */
private List<EtapaTreinoLlmDto> corrigirDistanciasEtapasTemporais(
        List<EtapaTreinoLlmDto> etapas,
        BigDecimal paceLimiar) { ... }
```

### Algoritmo

```java
private static final double PACE_Z2_DEFAULT_MIN_KM = 7.0;  // 7:00/km
private static final double PACE_Z1_DEFAULT_MIN_KM = 8.0;  // 8:00/km
private static final double FATOR_Z2 = 1.20;  // pace Z2 ≈ limiar × 1.20
private static final double FATOR_Z1 = 1.35;  // pace Z1 ≈ limiar × 1.35

private List<EtapaTreinoLlmDto> corrigirDistanciasEtapasTemporais(
        List<EtapaTreinoLlmDto> etapas, BigDecimal paceLimiar) {

    if (etapas == null || etapas.isEmpty()) return etapas;

    double paceZ2 = paceLimiar != null
            ? paceLimiar.doubleValue() * FATOR_Z2
            : PACE_Z2_DEFAULT_MIN_KM;
    double paceZ1 = paceLimiar != null
            ? paceLimiar.doubleValue() * FATOR_Z1
            : PACE_Z1_DEFAULT_MIN_KM;

    return etapas.stream()
            .map(e -> corrigirEtapaTemporal(e, paceZ1, paceZ2))
            .toList();
}

private EtapaTreinoLlmDto corrigirEtapaTemporal(EtapaTreinoLlmDto e,
                                                 double paceZ1, double paceZ2) {
    if (e.duracaoMin() == null || e.duracaoMin() <= 0) return e;

    double pace = switch (e.tipoEtapa().toUpperCase()) {
        case "AQUECIMENTO", "DESAQUECIMENTO" -> paceZ2;
        case "RECUPERACAO" -> paceZ1;
        default -> -1.0;  // não modificar
    };

    if (pace < 0) return e;

    double distancia = arredondar3(e.duracaoMin() / pace);
    return new EtapaTreinoLlmDto(
            e.ordem(), e.tipoEtapa(), e.descricaoEtapa(),
            e.duracaoMin(), distancia, e.fcAlvoEtapa(), e.repeticoes(), e.ritmoAlvo()
    );
}
```

`arredondar3()` — já existe em `IaServiceImpl` (ou adaptar o existente `arredondar2()` para 3 casas).

### Ponto de inserção na pipeline

```java
// IaServiceImpl — dentro de validarENormalizarPlanoGerado() ou similar
// Verificar o nome exato durante implementação (task 1.1)

private TreinoPlanejadoLlmDto normalizarTreino(TreinoPlanejadoLlmDto treino,
                                                Atleta atleta,
                                                NivelExperiencia nivel,
                                                List<ZonaFC> zonas) {
    // Passo 0 (NOVO): corrigir distâncias de etapas temporais
    List<EtapaTreinoLlmDto> etapasCorrigidas = corrigirDistanciasEtapasTemporais(
            treino.etapas(), atleta.getPaceLimiar());
    treino = new TreinoPlanejadoLlmDto(..., treino.distanciaKm(), etapasCorrigidas);

    // Passo 1 (existente): expandir etapas comprimidas ("6x400m" → 6 etapas)
    treino = expandirEtapasAgregadas(treino, zonas);

    // Passo 2 (existente): normalizar intervalado (clamp/redistribuir)
    treino = normalizarTreinoIntervalado(treino, nivel, zonas);

    // Passo 3 (existente): reconciliar total com soma de etapas
    treino = reconciliarDistanciaComEtapas(treino);

    return treino;
}
```

> **Nota de implementação:** O nome do método orquestrador e o local exato de inserção devem ser verificados durante task 1.1 (leitura de `IaServiceImpl`). O padrão acima é a intenção; ajustar para o código real.

### Por que Passo 0 antes de expandirEtapasAgregadas

`expandirEtapasAgregadas` desempacota "6x400m" em 6 etapas INTERVALADO + 6 RECUPERACAO. As etapas RECUPERACAO expandidas herdam `distanciaKm` do template de recuperação — se esse template já estiver corrigido no Passo 0, as expandidas terão distância correta. Inverter a ordem criaria RECUPERACAO com distância incorreta antes da correção.

Porém: AQUECIMENTO e DESAQUECIMENTO raramente chegam comprimidos — chegam como etapas únicas com `duracaoMin`. O Passo 0 os trata corretamente nesses dois casos.

## Não Tocar

- `somarDistancias()` — método correto; o bug é nos dados, não na soma
- `reconciliarDistanciaComEtapas()` — continua funcionando depois da correção
- `clampDistanciaPorTipo()` — pode permanecer como proteção adicional (segundas guardas não prejudicam)
- Lógica de treinos CONTINUO/LONGO — não tem RECUPERACAO nem os tipos afetados normalmente
