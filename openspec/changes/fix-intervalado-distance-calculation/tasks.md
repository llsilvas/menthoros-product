# Tasks: fix-intervalado-distance-calculation

**Status:** Proposed
**Sprint:** 9g.1 (hotfix — implementar antes de `coach-edit-planned-workout`)
**Tamanho:** XS · **Trilha:** Fast
**Repos:** menthoros-backend

---

## Bloco 1 — Implementação

### 1.1 Investigação prévia (ler antes de escrever código)

- [ ] 1.1.a Confirmar unidade de `Atleta.paceLimiar`:
  - Ler `Atleta.java` campo `paceLimiar`.
  - Confirmar que é decimal de minutos por km (ex: 4.5 = 4:30/km), não segundos/km.
  - Se estiver em segundos por km: ajustar as fórmulas do design (`paceZ2 = limiarSeg/60 × FATOR_Z2`).
- [ ] 1.1.b Localizar o orquestrador de pós-processamento em `IaServiceImpl`:
  - Grep por chamadas a `normalizarTreinoIntervalado` e `reconciliarDistanciaComEtapas`.
  - Identificar o método que os chama em sequência (ex: `validarENormalizarPlanoGerado`).
  - Anotar nome do método e número de linha — o Passo 0 deve ser inserido ali.
- [ ] 1.1.c Verificar se `arredondar3` já existe ou se é preciso adaptar `arredondar2`:
  - Grep `arredondar` em `IaServiceImpl`.
  - Se só existir `arredondar2` (2 casas): criar `arredondar3` análogo para 3 casas de km.

### 1.2 Constantes

- [ ] 1.2.a Adicionar as 4 constantes `private static final double` ao topo de `IaServiceImpl`:
  ```java
  private static final double PACE_Z2_DEFAULT_MIN_KM = 7.0;
  private static final double PACE_Z1_DEFAULT_MIN_KM = 8.0;
  private static final double FATOR_PACE_Z2 = 1.20;
  private static final double FATOR_PACE_Z1 = 1.35;
  ```
- [ ] 1.2.b Validação: `./mvnw clean compile`.

### 1.3 Método `corrigirEtapaTemporal`

- [ ] 1.3.a Adicionar método privado `corrigirEtapaTemporal(EtapaTreinoLlmDto, double paceZ1, double paceZ2)`:
  - Se `duracaoMin == null || duracaoMin <= 0`: retornar etapa sem alteração.
  - Switch em `tipoEtapa.toUpperCase()`:
    - `"AQUECIMENTO"`, `"DESAQUECIMENTO"` → `pace = paceZ2`
    - `"RECUPERACAO"` → `pace = paceZ1`
    - default → retornar etapa sem alteração (INTERVALADO, TIRO, PRINCIPAL não são modificados)
  - `distancia = arredondar3(duracaoMin / pace)` (arredondar com 3 casas decimais)
  - Retornar novo `EtapaTreinoLlmDto` com `distanciaKm = distancia` e demais campos inalterados.
- [ ] 1.3.b Validação: `./mvnw clean compile`.

### 1.4 Método `corrigirDistanciasEtapasTemporais`

- [ ] 1.4.a Adicionar método privado `corrigirDistanciasEtapasTemporais(List<EtapaTreinoLlmDto>, BigDecimal paceLimiar)`:
  - Guard: `if (etapas == null || etapas.isEmpty()) return etapas;`
  - Calcular `paceZ2 = paceLimiar != null ? paceLimiar.doubleValue() * FATOR_PACE_Z2 : PACE_Z2_DEFAULT_MIN_KM`
  - Calcular `paceZ1 = paceLimiar != null ? paceLimiar.doubleValue() * FATOR_PACE_Z1 : PACE_Z1_DEFAULT_MIN_KM`
  - Retornar `etapas.stream().map(e -> corrigirEtapaTemporal(e, paceZ1, paceZ2)).toList()`
- [ ] 1.4.b Validação: `./mvnw clean compile`.

### 1.5 Inserção na pipeline de pós-processamento

- [ ] 1.5.a No método orquestrador identificado em 1.1.b, inserir chamada a `corrigirDistanciasEtapasTemporais` como primeiro passo:
  - Inserir antes de `expandirEtapasAgregadas()` (ou equivalente).
  - Usar `atleta.getPaceLimiar()` como argumento — confirmar que `atleta` está disponível no escopo (se não: passar como parâmetro adicional ao método ou obtê-lo do contexto local).
- [ ] 1.5.b Validação: `./mvnw clean test`.

---

## Bloco 2 — Testes de unidade

### 2.1 `IaServiceImplTest` ou classe dedicada

- [ ] 2.1.a `@Nested class CorrigirDistanciasEtapasTemporais`:
  - `corrigeAquecimentoComPaceLimiar` — AQUECIMENTO 10min, paceLimiar=4.5 → distanciaKm ≈ 1.389 (10 / (4.5×1.20)).
  - `corrigeDesaquecimentoComPaceLimiar` — DESAQUECIMENTO 10min, paceLimiar=5.0 → distanciaKm ≈ 1.667.
  - `corrigeRecuperacaoComPaceLimiar` — RECUPERACAO 2min, paceLimiar=4.5 → distanciaKm ≈ 0.247 (2 / (4.5×1.35)).
  - `usaDefaultsQuandoPaceLimiarNulo` — AQUECIMENTO 10min, paceLimiar=null → distanciaKm ≈ 1.429 (10/7.0).
  - `naoAlteraIntervalado` — INTERVALADO 400m, distanciaKm=0.4 → distanciaKm permanece 0.4.
  - `naoAlteraTiro` — TIRO 200m, distanciaKm=0.2 → distanciaKm permanece 0.2.
  - `retornaListaVaziaQuandoListaVazia` — lista empty → retorna empty sem exceção.
  - `naoAlteraEtapaSemDuracaoMin` — AQUECIMENTO com `duracaoMin = null` → distanciaKm = null (sem modificação).
- [ ] 2.1.b `@Nested class IntegracaoDistanciaTreinoIntervalado` (teste end-to-end da pipeline de normalização):
  - Dado: TreinoPlanejadoLlmDto tipo INTERVALADO com etapas: AQUECIMENTO(10min, 2.5km), 5×INTERVALADO(0.4km), 5×RECUPERACAO(2min, 1.0km), DESAQUECIMENTO(10min, 2.5km), paceLimiar=4.5.
  - Quando: normalização completa aplicada.
  - Então: `TreinoPlanejado.distanciaKm ∈ [5.5, 8.0]` (não 10km nem ~12km).
- [ ] 2.1.c Validação: `./mvnw clean test`.

---

## Bloco 3 — QA e entrega

- [ ] 3.1 `./mvnw clean test` — todos os testes passando.
- [ ] 3.2 Teste manual:
  - Gerar plano para atleta com `paceLimiar` cadastrado e pelo menos um treino INTERVALADO na semana.
  - Verificar que a distância do treino intervalado está entre 5.5 e 8.0 km para o exemplo 10min + 5×400m + rec + 10min.
  - Gerar plano para atleta SEM `paceLimiar` → verificar que defaults são usados (sem NPE, sem divisão por zero).
  - Gerar treino CONTINUO → verificar que distância não foi alterada pelo fix (CA5).
- [ ] 3.3 Abrir PR (`feature/fix-intervalado-distance-calculation`) e aguardar CI verde.
