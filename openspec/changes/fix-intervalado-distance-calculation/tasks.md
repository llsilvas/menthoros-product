# Tasks: fix-intervalado-distance-calculation

**Status:** In Progress
**Branch:** `feature/fix-intervalado-distance-calculation`
**Base commit:** `8ca7e2c`
**Sprint:** 9g.1 (hotfix — implementar antes de `coach-edit-planned-workout`)
**Tamanho:** XS · **Trilha:** Fast
**Repos:** menthoros-backend

---

## Achados da investigação (pré-implementação)

| Item | Confirmado |
|---|---|
| `paceLimiar` unidade | `min/km` (BigDecimal, precision=5, scale=2). Comentário: `// min/km no limiar (ex: 4.5 min/km)`. Fórmula `duracaoMin / paceLimiar.doubleValue()` correta. |
| Orquestrador | `validarENormalizarPlanoGerado` (linhas 346–476) |
| Ponto de inserção | Antes da linha 377 (`expandirEtapasAgregadas`) — `Atleta atleta` já disponível (carregado linha 350) |
| Sequência pós-inserção | [0] `corrigirDistanciasEtapasTemporais` → [1] `expandirEtapasAgregadas` → [2] `normalizarTreinoIntervalado` → [3] `reconciliarDistanciaComEtapas` |
| `arredondar2` | Existe (linha 999): `Math.round(valor * 100.0) / 100.0` — 2 casas decimais suficientes para km. **Não criar `arredondar3`**. |
| Constantes de pace | Nenhuma no arquivo — adicionar as nossas |
| `clampDistanciaPorTipo` | Não modifica null (retorna etapa intacta se `distanciaKm == null || d <= 0`) — compatível com o fix |
| Teste existente | `IaServiceImplFcValidationTest` (12 mocks, `@Nested`, reflexão via `invoke`) — adicionar nova `@Nested` class nele |

---

## Bloco 1 — Implementação em `IaServiceImpl`

### 1.1 Constantes

- [x] 1.1.a Adicionar as 4 constantes `private static final double` no bloco de constantes existente em `IaServiceImpl`:
  ```java
  private static final double PACE_Z2_DEFAULT_MIN_KM = 7.0;  // 7:00/km — Z2 genérico sem limiar cadastrado
  private static final double PACE_Z1_DEFAULT_MIN_KM = 8.0;  // 8:00/km — Z1 genérico sem limiar cadastrado
  private static final double FATOR_PACE_Z2 = 1.20;          // Z2 ≈ limiar × 1.20
  private static final double FATOR_PACE_Z1 = 1.35;          // Z1 ≈ limiar × 1.35
  ```
- [x] 1.1.b `verify:` `./mvnw clean compile` sem erros.

### 1.2 Método `corrigirEtapaTemporal` (privado)

- [x] 1.2.a Criar método privado `corrigirEtapaTemporal(EtapaTreinoLlmDto e, double paceZ1, double paceZ2)`:
  - Guard: se `e.duracaoMin() == null || e.duracaoMin() <= 0` → retornar `e` sem alteração.
  - Switch em `e.tipoEtapa().toUpperCase()`:
    - `"AQUECIMENTO"`, `"DESAQUECIMENTO"` → `pace = paceZ2`
    - `"RECUPERACAO"` → `pace = paceZ1`
    - default → retornar `e` sem alteração (INTERVALADO, TIRO, PRINCIPAL intocados)
  - `double distancia = arredondar2(e.duracaoMin() / pace)` — usar `arredondar2` existente (2 casas = 10m de precisão, suficiente).
  - Retornar `new EtapaTreinoLlmDto(e.ordem(), e.tipoEtapa(), e.descricaoEtapa(), e.duracaoMin(), distancia, e.fcAlvoEtapa(), e.repeticoes(), e.ritmoAlvo())`.
- [x] 1.2.b `verify:` `./mvnw clean compile`.

### 1.3 Método `corrigirDistanciasEtapasTemporais` (privado)

- [x] 1.3.a Criar método privado `corrigirDistanciasEtapasTemporais(List<EtapaTreinoLlmDto> etapas, BigDecimal paceLimiar)`:
  ```java
  /**
   * Deriva distanciaKm para etapas time-based (AQUECIMENTO, DESAQUECIMENTO, RECUPERACAO)
   * via duracaoMin ÷ paceZona, substituindo o valor incorreto gerado pelo LLM
   * (que usa o pace de tiro em vez do pace fácil).
   *
   * Idempotent: YES · Side Effects: NONE · Tenant-aware: NO
   */
  private List<EtapaTreinoLlmDto> corrigirDistanciasEtapasTemporais(
          List<EtapaTreinoLlmDto> etapas, BigDecimal paceLimiar) {
      if (etapas == null || etapas.isEmpty()) return etapas;
      double paceZ2 = paceLimiar != null
              ? paceLimiar.doubleValue() * FATOR_PACE_Z2
              : PACE_Z2_DEFAULT_MIN_KM;
      double paceZ1 = paceLimiar != null
              ? paceLimiar.doubleValue() * FATOR_PACE_Z1
              : PACE_Z1_DEFAULT_MIN_KM;
      return etapas.stream()
              .map(e -> corrigirEtapaTemporal(e, paceZ1, paceZ2))
              .toList();
  }
  ```
- [x] 1.3.b `verify:` `./mvnw clean compile`.

### 1.4 Inserção na pipeline de `validarENormalizarPlanoGerado`

- [x] 1.4.a Em `validarENormalizarPlanoGerado`, inserir a chamada ao novo método imediatamente **antes** da linha 377 (`expandirEtapasAgregadas`):
  — Aplicado nos blocos INTERVALADO/TIRO e FARTLEK.
- [x] 1.4.b `verify:` `./mvnw clean test` — 939 testes passando, 0 falhas.

---

## Bloco 2 — Testes de unidade

### 2.1 Nova `@Nested class CorrigirDistanciasEtapasTemporais` em `IaServiceImplFcValidationTest`

> Usar reflexão (padrão do arquivo): `invokeCorrigirEtapaTemporal(...)` e `invokeCorrigirDistanciasEtapasTemporais(...)` via `Method.invoke` para testar métodos privados.

- [x] 2.1.a Criar helper `invokeCorrigirDistanciasEtapasTemporais(List<EtapaTreinoLlmDto>, BigDecimal)` por reflexão (igual ao padrão `invokeParseFcRange` existente).
- [x] 2.1.b Testes de `corrigirEtapaTemporal` via `corrigirDistanciasEtapasTemporais`:
  - `corrigeAquecimento` — AQUECIMENTO 10min, paceLimiar=4.5 → `distanciaKm ≈ 10/(4.5×1.20) = 1.85`. Usar `assertThat(result).isCloseTo(1.85, within(0.01))`.
  - `corrigeDesaquecimento` — DESAQUECIMENTO 10min, paceLimiar=5.0 → `distanciaKm ≈ 10/(5.0×1.20) = 1.67`.
  - `corrigeRecuperacao` — RECUPERACAO 2min, paceLimiar=4.5 → `distanciaKm ≈ 2/(4.5×1.35) = 0.33`.
  - `usaDefaultsQuandoPaceLimiarNulo` — AQUECIMENTO 10min, paceLimiar=null → `distanciaKm ≈ 10/7.0 = 1.43`.
  - `naoAlteraIntervalado` — INTERVALADO 400m (`distanciaKm=0.4`, `duracaoMin=4`) → `distanciaKm` permanece `0.4`.
  - `naoAlteraTiro` — TIRO (`distanciaKm=0.2`) → `distanciaKm` permanece `0.2`.
  - `retornaListaVaziaQuandoListaVazia` — `List.of()` → retorna `List.of()`, sem exceção.
  - `naoAlteraEtapaSemDuracaoMin` — AQUECIMENTO com `duracaoMin=null` → etapa retornada com `distanciaKm` original (null).
- [x] 2.1.c `@Nested class IntegracaoDistanciaTreinoIntervalado` — teste de integração da pipeline completa (apenas os métodos privados em sequência, sem chamar `validarENormalizarPlanoGerado` que requer mocks de repositório):
  - Construir `TreinoPlanejadoLlmDto` tipo INTERVALADO com etapas: AQUECIMENTO(10min, 2.5km), 5×INTERVALADO(0.4km cada), 5×RECUPERACAO(2min, 1.0km cada), DESAQUECIMENTO(10min, 2.5km). `distanciaKm` do treino = 10.0.
  - Aplicar `corrigirDistanciasEtapasTemporais` → verificar que AQUECIMENTO ≠ 2.5 e RECUPERACAO ≠ 1.0.
  - Aplicar `reconciliarDistanciaComEtapas` sobre o resultado → verificar que `distanciaKm ∈ [5.5, 8.0]` (CA1).
  - Nota: invocar `reconciliarDistanciaComEtapas` também por reflexão (já privado, padrão do arquivo).
- [x] 2.1.d `verify:` `./mvnw clean test` — 939 testes passando, 0 falhas.

---

## Bloco 3 — QA e entrega

- [x] 3.1 `verify:` `./mvnw clean test` — 939 testes passando, 0 falhas.
- [ ] 3.2 Commit de entrega (Conventional Commits PT-BR).
- [ ] 3.3 Teste manual (opcional — validar no ambiente de dev se disponível):
  - Gerar plano para atleta com `paceLimiar` cadastrado com treino INTERVALADO (ex: aquecimento + tiros + recovery + desaquecimento) → verificar `distanciaKm ∈ [5.5, 8.0]`.
  - Gerar plano para atleta sem `paceLimiar` → sem NPE, sem divisão por zero.
  - Gerar treino CONTINUO → `distanciaKm` inalterada (CA5).
- [ ] 3.4 Abrir PR: `gh pr create --base develop --head feature/fix-intervalado-distance-calculation`.
