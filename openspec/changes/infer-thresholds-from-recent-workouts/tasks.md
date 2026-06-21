# Tasks: infer-thresholds-from-recent-workouts

**Status:** Proposed
**Sprint:** 9h (após `coach-edit-planned-workout`)
**Tamanho:** S · **Trilha:** Full
**Repos:** menthoros-backend + menthoros-front

---

## Bloco 1 — Backend: `ThresholdInferenceService`

### 1.1 Records de output

- [ ] 1.1.a Criar enum `ConfiancaInferencia` em `enums/`:
  ```java
  public enum ConfiancaInferencia { ALTA, MEDIA, BAIXA }
  ```
- [ ] 1.1.b Criar record `ThresholdEstimate` em `services/helper/`:
  ```java
  public record ThresholdEstimate(
      String tipo,
      Number valor,
      int amostras,
      ConfiancaInferencia confianca
  ) {}
  ```
- [ ] 1.1.c Validação: `./mvnw clean compile`.

### 1.2 `ThresholdInferenceService`

- [ ] 1.2.a Criar `ThresholdInferenceService` em `services/helper/` com constantes:
  - `JANELA_DIAS = 30`, `MIN_AMOSTRAS = 3` (package-private para testes), `MIN_DURACAO_MIN = 20L`, `FATOR_QUINTIL = 0.20`.
- [ ] 1.2.b Implementar `inferirFcLimiar(List<TreinoRealizado> treinos30d, LocalDate hoje)`:
  - Filtrar: `fcMedia != null && fcMedia > 0 && duracaoMin != null && duracaoMin.toMinutes() > MIN_DURACAO_MIN`.
  - Filtrar por data: `treino.getDataTreino().isAfter(hoje.minusDays(JANELA_DIAS))` (ou critério equivalente disponível na entidade).
  - Ordenar `fcMedia` decrescente; pegar top `Math.max(1, (int) Math.ceil(n * FATOR_QUINTIL))` elementos.
  - Calcular mediana (índice conservador para n par: `n/2 - 1`).
  - Se `filtrados.size() < MIN_AMOSTRAS` → retornar `Optional.empty()`.
  - Mapear confiança: `≥10 → ALTA`, `5-9 → MEDIA`, `3-4 → BAIXA`.
  - Retornar `Optional.of(new ThresholdEstimate("FC_LIMIAR", mediana, filtrados.size(), confianca))`.
- [ ] 1.2.c Implementar `inferirPaceLimiar(List<TreinoRealizado> treinos30d, LocalDate hoje)`:
  - Filtrar: `tipoTreino IN (CONTINUO, LONGO, TEMPO_RUN, FARTLEK)` E `paceMedia != null && paceMedia.getSeconds() > 0 && duracaoMin.toMinutes() > MIN_DURACAO_MIN`.
  - Filtrar por data: igual ao FC.
  - Ordenar `paceMedia.getSeconds()` crescente (menor = mais rápido); pegar top quintil.
  - Calcular mediana de segundos; converter para `BigDecimal` decimal de minutos: `BigDecimal.valueOf(medianaSegundos).divide(BigDecimal.valueOf(60), 4, HALF_UP)`.
  - Retornar `Optional.of(new ThresholdEstimate("PACE_LIMIAR", paceLimiarDecimal, filtrados.size(), confianca))`.
- [ ] 1.2.d Validação: `./mvnw clean compile`.

### 1.3 Testes de unidade — `ThresholdInferenceServiceTest`

- [ ] 1.3.a Criar `ThresholdInferenceServiceTest` em `services/helper/`:
  ```java
  @ExtendWith(MockitoExtension.class)
  class ThresholdInferenceServiceTest {
      private ThresholdInferenceService service = new ThresholdInferenceService();
      private LocalDate hoje = LocalDate.of(2026, 6, 21);
  ```
- [ ] 1.3.b `@Nested class InferirFcLimiar`:
  - `retornaVazioQuandoListaVazia`.
  - `retornaVazioQuandoMenosDeMinAmostras` (2 treinos com fcMedia válida).
  - `retornaBAIXAParaTresA4Amostras`.
  - `retornaMEDIAPara5A9Amostras`.
  - `retornaALTAPara10OuMaisAmostras`.
  - `calculaMedianaDoQuintilSuperior` (ex: 10 treinos com FC 130,135,140,145,150,155,158,160,163,165 → quintil superior = 2 maiores [163,165] → mediana = 163).
  - `ignoraTreinosComFcMediaNula`.
  - `ignoraTreinosComDuracaoMenorQue20Min`.
  - `ignoraTreinosForaDaJanelaDe30Dias`.
- [ ] 1.3.c `@Nested class InferirPaceLimiar`:
  - `retornaVazioQuandoListaVazia`.
  - `retornaVazioQuandoMenosDeMinAmostras`.
  - `ignoraTiposNaoContínuos` (INTERVALADO, TIRO → excluídos).
  - `calculaMedianaDoQuintilMaisRapido` (menor segundos = pace mais rápido).
  - `converteSegundosParaDecimalMinutos` (ex: 285 segundos = 4.75 min/km decimal).
  - `retornaVazioQuandoPaceMediaNuloEmTodosFiltrados`.
- [ ] 1.3.d Validação: `./mvnw clean test`.

## Bloco 2 — Backend: integração no prompt builder

### 2.1 Ponto de integração no `PlanoTreinoPromptBuilder`

> **Achado DoR:** os treinos chegam via `ContextoTreino ctx = treinoHistoricoProvider.prepararContexto(atleta)`. O campo a usar é `ctx.treinosUltimas4Semanas()` (28 dias). O `ThresholdInferenceService` filtra internamente para 30 dias — nenhuma query adicional necessária.

- [ ] 2.1.a Confirmar que `ContextoTreino.treinosUltimas4Semanas()` está acessível no ponto de injeção identificado no design (após o bloco de dados fisiológicos).
- [ ] 2.1.b Validação: `./mvnw clean compile`.

### 2.2 Métodos auxiliares de staleness no builder

- [ ] 2.2.a Adicionar dois métodos privados em `PlanoTreinoPromptBuilder`:
  ```java
  private boolean fcLimiarDesatualizado(Atleta atleta, LocalDate hoje) {
      return atleta.getFcLimiar() == null
          || atleta.getDataUltimoTesteFc() == null
          || ChronoUnit.DAYS.between(atleta.getDataUltimoTesteFc(), hoje) > 90;
  }

  private boolean paceLimiarDesatualizado(Atleta atleta, LocalDate hoje) {
      return atleta.getPaceLimiar() == null
          || atleta.getDataUltimoTestePace() == null
          || ChronoUnit.DAYS.between(atleta.getDataUltimoTestePace(), hoje) > 90;
  }
  ```
- [ ] 2.2.b Validação: `./mvnw clean compile`.

### 2.3 Formatter de Constraints de limiar estimado

- [ ] 2.3.a Criar `ThresholdConstraintFormatter` em `services/prompt/` com dois métodos:
  - `formatarConstraintFc(ThresholdEstimate est): String` — gera o bloco de texto do Constraint `[LIMIAR_FC_ESTIMADO]`.
  - `formatarConstraintPace(ThresholdEstimate est): String` — gera o bloco do Constraint `[LIMIAR_PACE_ESTIMADO]`.
  - Incluir nível de confiança e aviso proporcional:
    - ALTA/MEDIA: aviso padrão de recomendação de teste formal.
    - BAIXA: aviso adicional com margem de prescrição.
- [ ] 2.3.b Validação: `./mvnw clean compile`.

### 2.4 Injeção no `buildOptimizedPrompt`

- [ ] 2.4.a Injetar `ThresholdInferenceService` e `ThresholdConstraintFormatter` no `PlanoTreinoPromptBuilder` via `@RequiredArgsConstructor`.
- [ ] 2.4.b No método `buildOptimizedPrompt`, logo após o bloco de dados fisiológicos, adicionar os blocos de inferência usando `ctx.treinosUltimas4Semanas()` como entrada (o service filtra para 30 dias internamente via `dataTreino`).
- [ ] 2.4.c O builder deve retornar as estimativas ao caller (via objeto de resultado ou parâmetro de saída), para que o service de geração possa incluir `limiareisInferidos` no response DTO. Opção mais limpa: `buildOptimizedPrompt` retorna um record `PromptBuildResult(String prompt, List<ThresholdEstimate> estimativas)`.
- [ ] 2.4.d Validação: `./mvnw clean compile`.

### 2.5.1 DTO de output: `LimiarInferidoDto` e campo no response de geração

- [ ] 2.5.1.a Criar `LimiarInferidoDto` (record em `dto/output/`):
  ```java
  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record LimiarInferidoDto(
      String tipo,
      String valorFormatado,
      int amostras,
      ConfiancaInferencia confianca
  ) {}
  ```
- [ ] 2.5.1.b Adicionar campo `@JsonInclude(NON_NULL) List<LimiarInferidoDto> limiareisInferidos` ao DTO de response da geração de plano.
- [ ] 2.5.1.c No service de geração (`IaServiceImpl` ou equivalente): após obter `PromptBuildResult`, converter as estimativas para `List<LimiarInferidoDto>` e popular no response.
- [ ] 2.5.1.d Validação: `./mvnw clean compile`.

### 2.5 Testes de integração no `PlanoTreinoPromptBuilder`

> **Nota:** `PlanoTreinoPromptBuilder` tem zero cobertura de testes atualmente (discovery feita em 16/jun). Esta tarefa adiciona os primeiros testes para a inferência de limiar como entry point — sem exigir cobertura completa do builder (fora de escopo).

- [ ] 2.5.a Criar `PlanoTreinoPromptBuilderThresholdTest` (classe dedicada, não misturar com futuras classes de teste do builder completo):
  - Setup: instanciar builder com mocks de todos os formatters e o `ThresholdInferenceService` real (não mockado — é pura lógica).
  - `deveInjetarConstraintFcQuandoLimiarDesatualizado`:
    - Atleta com `dataUltimoTesteFc` = 100 dias atrás + 5 treinos com fcMedia válida.
    - Prompt resultante contém `[LIMIAR_FC_ESTIMADO]`.
  - `naoDeveInjetarConstraintFcQuandoLimiarAtual`:
    - Atleta com `dataUltimoTesteFc` = 30 dias atrás.
    - Prompt resultante NÃO contém `[LIMIAR_FC_ESTIMADO]`.
  - `naoDeveInjetarConstraintFcComAmostraInsuficiente`:
    - Atleta com `dataUltimoTesteFc` = 100 dias atrás + apenas 2 treinos com fcMedia.
    - Prompt resultante NÃO contém `[LIMIAR_FC_ESTIMADO]`.
  - Equivalentes para pace (`LIMIAR_PACE_ESTIMADO`).
- [ ] 2.5.b Validação: `./mvnw clean test`.

---

## Bloco 3 — Frontend: banner de transparência

### 3.1 Tipo TypeScript

- [ ] 3.1.a Adicionar ao tipo do response de geração de plano em `src/types/`:
  ```ts
  export type ConfiancaInferencia = 'ALTA' | 'MEDIA' | 'BAIXA';
  export interface LimiarInferido {
    tipo: 'FC_LIMIAR' | 'PACE_LIMIAR';
    valorFormatado: string;
    amostras: number;
    confianca: ConfiancaInferencia;
  }
  ```
  Adicionar campo `limiareisInferidos?: LimiarInferido[]` ao tipo `PlanoSemanal` (ou ao response wrapper de geração).
- [ ] 3.1.b Validação: `npm run build`.

### 3.2 Banner na `CoachPlanReviewPage`

- [ ] 3.2.a Criar componente `LimiaresInferidosBanner.tsx` em `src/features/coach/components/`:
  - Props: `limiares: LimiarInferido[]`
  - Renderiza um `MUI Alert` com `severity="info"` listando cada limiar: `FC limiar estimado: 163 bpm (15 treinos, ALTA)`, `Pace limiar estimado: 4:45/km (8 treinos, MEDIA)`.
  - Texto fixo ao final: "Recomende um teste formal de limiar ao atleta para calibração precisa."
  - Confiança BAIXA: adicionar ícone de aviso e texto adicional "Poucos dados — revise as prescrições de intensidade."
- [ ] 3.2.b Exibir o banner no topo do painel de revisão quando `plano.limiareisInferidos?.length > 0`.
  - Os dados de `limiareisInferidos` chegam no response de geração e devem ser mantidos no estado do componente (ou context) durante a sessão de revisão.
- [ ] 3.2.c Validação: `npm run lint && npm run build`.

### 3.3 Testes de componente

- [ ] 3.3.a Teste do `LimiaresInferidosBanner`: renderiza FC e pace quando presentes; inclui texto de aviso quando confiança BAIXA; não renderiza quando `limiares` é vazio ou indefinido.
- [ ] 3.3.b Validação: `npm run lint && npm run build && npm test`.

---

## Bloco 4 — QA e entrega

- [ ] 4.1 `./mvnw clean test` — todos os testes passando.
- [ ] 4.2 `npm run lint && npm run build && npm test` — tudo verde.
- [ ] 4.3 Teste manual ponta-a-ponta:
  - Atleta com `dataUltimoTesteFc` há mais de 90 dias + ≥ 10 treinos com fcMedia nos últimos 30 dias → gerar plano → confirmar presença de `[LIMIAR_FC_ESTIMADO]` no log (DEBUG) + campo `limiareisInferidos` no response JSON + banner visível na `CoachPlanReviewPage`.
  - Atleta com teste de limiar recente (< 90 dias) → gerar plano → confirmar ausência de Constraint estimado e ausência do banner na UI.
  - Atleta com 2 treinos válidos no período → gerar plano → confirmar ausência de Constraint (CA3).
  - Atleta com `dataUltimoTestePace` nulo (nunca fez teste) + treinos contínuos recentes → confirmar inferência de pace e banner mostrando `PACE_LIMIAR`.
  - Confiança BAIXA (3–4 amostras): banner exibe aviso adicional de poucos dados.
  - Verificar no banco que `fcLimiar`, `paceLimiar`, `dataUltimoTesteFc`, `dataUltimoTestePace` permanecem inalterados após geração (CA5).
- [ ] 4.4 Revisores: `menthoros-workflow:code-reviewer` + `menthoros-workflow:security-reviewer`.
- [ ] 4.5 Abrir PR (`feature/infer-thresholds-from-recent-workouts`) e aguardar CI verde.
