# Tasks: infer-thresholds-from-recent-workouts

**Status:** Proposed
**Sprint:** 9h (após `coach-edit-planned-workout`)
**Tamanho:** S · **Trilha:** Full
**Repos:** menthoros-backend + menthoros-front

---

## Bloco 1 — Backend: migration e modelo

### 1.1 Migration V40

- [ ] 1.1.a Confirmar que V39 é a última migration aplicada após `coach-edit-planned-workout`.
- [ ] 1.1.b Criar `V40__Add_threshold_inference_to_plano_metadados.sql`:
  ```sql
  -- =====================================================================
  -- V40: Adiciona campos de inferência de limiares à tb_plano_metadados
  -- =====================================================================
  ALTER TABLE tb_plano_metadados
      ADD COLUMN IF NOT EXISTS fc_limiar_estimado       INTEGER,
      ADD COLUMN IF NOT EXISTS pace_limiar_estimado     DECIMAL(5,4),
      ADD COLUMN IF NOT EXISTS confianca_inferencia_fc  VARCHAR(10),
      ADD COLUMN IF NOT EXISTS confianca_inferencia_pace VARCHAR(10),
      ADD COLUMN IF NOT EXISTS data_inferencia_limiar   DATE;

  DO $$
  BEGIN
      RAISE NOTICE '✅ V40 - campos de inferência de limiares adicionados a tb_plano_metadados';
  END$$;
  ```
- [ ] 1.1.c Validação: `./mvnw flyway:info` sem conflito.

### 1.2 Entidade e enum

- [ ] 1.2.a Criar enum `ConfiancaInferencia` em `enums/`:
  ```java
  public enum ConfiancaInferencia { ALTA, MEDIA, BAIXA }
  ```
- [ ] 1.2.b Adicionar os 5 novos campos à entidade `PlanoMetaDados` (nullable, sem `@NotNull`):
  - `fcLimiarEstimado: Integer`
  - `paceLimiarEstimado: BigDecimal` (precision=5, scale=4)
  - `confiancaInferenciaFc: ConfiancaInferencia` (@Enumerated STRING)
  - `confiancaInferenciaPace: ConfiancaInferencia` (@Enumerated STRING)
  - `dataInferenciaLimiar: LocalDate`
- [ ] 1.2.c Validação: `./mvnw clean compile`.

---

## Bloco 2 — Backend: `ThresholdInferenceService`

### 2.1 Record de output

- [ ] 2.1.a Criar record `ThresholdEstimate` em `services/helper/`:
  ```java
  public record ThresholdEstimate(Number valor, int amostras, ConfiancaInferencia confianca) {}
  ```
- [ ] 2.1.b Validação: `./mvnw clean compile`.

### 2.2 Implementação do service

- [ ] 2.2.a Criar `ThresholdInferenceService` em `services/helper/` com constantes:
  ```java
  static final int MIN_AMOSTRAS = 3;       // package-private para testes
  static final long MIN_DURACAO_MIN = 20;
  private static final double FATOR_QUINTIL = 0.20;
  ```
- [ ] 2.2.b Implementar `inferirFcLimiar(List<TreinoRealizado> treinos, LocalDate hoje)`:
  - Filtrar por `dataTreino.isAfter(hoje.minusDays(30))`, `fcMedia > 0`, `duracaoMin.toMinutes() > MIN_DURACAO_MIN`.
  - Ordenar `fcMedia` decrescente; pegar `max(1, ceil(n × 0.20))` elementos; mediana conservadora.
  - Se `filtrados.size() < MIN_AMOSTRAS` → `Optional.empty()`.
  - Confiança: ≥10 → ALTA, 5–9 → MEDIA, 3–4 → BAIXA.
  - Retornar `Optional.of(new ThresholdEstimate(mediana, filtrados.size(), confianca))`.
- [ ] 2.2.c Implementar `inferirPaceLimiar(List<TreinoRealizado> treinos, LocalDate hoje)`:
  - Filtrar por data (30d), `tipoTreino IN (CONTINUO, LONGO, TEMPO_RUN, FARTLEK)`, `paceMedia.getSeconds() > 0`, `duracaoMin.toMinutes() > MIN_DURACAO_MIN`.
  - Ordenar `paceMedia.getSeconds()` crescente; top 20%; mediana em segundos.
  - Converter mediana para `BigDecimal`: `BigDecimal.valueOf(seg).divide(BigDecimal.valueOf(60), 4, HALF_UP)`.
  - Retornar `Optional.of(new ThresholdEstimate(paceLimiarDecimal, amostras, confianca))`.
- [ ] 2.2.d Validação: `./mvnw clean compile`.

### 2.3 Testes de unidade — `ThresholdInferenceServiceTest`

- [ ] 2.3.a `@Nested class InferirFcLimiar`:
  - `retornaVazioQuandoListaVazia`.
  - `retornaVazioQuandoMenosDeMinAmostras` (2 treinos com fcMedia válida).
  - `retornaBAIXAParaTresOuQuatroAmostras`.
  - `retornaMEDIAPara5A9Amostras`.
  - `retornaALTAPara10OuMaisAmostras`.
  - `calculaMedianaDoQuintilSuperior` (10 treinos com FC variada → mediana do top 20%).
  - `ignoraTreinosComFcMediaNula`.
  - `ignoraTreinosComDuracaoAbaixoDe20Min`.
  - `ignoraTreinosForaDaJanelaDe30Dias`.
- [ ] 2.3.b `@Nested class InferirPaceLimiar`:
  - `retornaVazioQuandoListaVazia`.
  - `retornaVazioQuandoMenosDeMinAmostras`.
  - `ignoraTiposNaoContínuos` (INTERVALADO, TIRO excluídos).
  - `calculaMedianaDoQuintilMaisRapido`.
  - `converteSegundosParaDecimalMinutos` (285s → 4.7500).
  - `retornaVazioQuandoPaceMediaNuloEmTodosFiltrados`.
- [ ] 2.3.c Validação: `./mvnw clean test`.

---

## Bloco 3 — Backend: integração em `TsbServiceImpl`

### 3.1 Injetar `ThresholdInferenceService` em `TsbServiceImpl`

- [ ] 3.1.a Adicionar `ThresholdInferenceService thresholdInferenceService` ao constructor de `TsbServiceImpl` via `@RequiredArgsConstructor`.
- [ ] 3.1.b Validação: `./mvnw clean compile`.

### 3.2 Método `atualizarLimiareInferidos`

- [ ] 3.2.a Adicionar método privado `atualizarLimiareInferidos(UUID atletaId, Atleta atleta, PlanoMetaDados metaDados, LocalDate hoje)` em `TsbServiceImpl`:
  - Guard: se `!fcStale && !paceStale` → retornar imediatamente.
  - Buscar treinos: `treinoRealizadoRepository.findByAtletaIdAndDataTreinoBetween(atletaId, hoje.minusDays(30), hoje)`.
  - Se `fcStale`: chamar `inferirFcLimiar()` → `ifPresent` → setar `fcLimiarEstimado`, `confiancaInferenciaFc`, `dataInferenciaLimiar`.
  - Se `paceStale`: chamar `inferirPaceLimiar()` → `ifPresent` → setar `paceLimiarEstimado`, `confiancaInferenciaPace`, `dataInferenciaLimiar`.
- [ ] 3.2.b Chamar `atualizarLimiareInferidos(atletaId, atleta, metaDados, hoje)` no final de `atualizarMetaDados()`, imediatamente antes de `planoMetaDadosRepository.save(metaDados)`.
- [ ] 3.2.c Validação: `./mvnw clean test`.

### 3.3 Testes de integração em `TsbServiceImplTest`

- [ ] 3.3.a `@Nested class AtualizarLimiareInferidos` (dentro do `TsbServiceImplTest` existente ou classe separada):
  - `infereFcLimiarQuandoDesatualizadoEAmostraSuficiente`.
  - `naoInfereFcLimiarQuandoAtualizado` (< 90 dias).
  - `naoInfereFcLimiarComAmostraInsuficiente` (< MIN_AMOSTRAS).
  - `inferePaceLimiarQuandoDesatualizadoEAmostraSuficiente`.
  - `naoAlteraFcLimiarNemPaceLimiarOficialDoAtleta` (CA5 — campos do `Atleta` intactos).
  - `persisteNoMetaDados` (verificar `verify(planoMetaDadosRepository).save(...)` com campos setados).
- [ ] 3.3.b Validação: `./mvnw clean test`.

---

## Bloco 4 — Backend: prompt builder e DTO

### 4.1 `ThresholdConstraintFormatter`

- [ ] 4.1.a Criar `ThresholdConstraintFormatter` em `services/prompt/` com:
  - `formatarConstraintFc(Integer fcEstimado, ConfiancaInferencia confianca, LocalDate dataInferencia): String`
  - `formatarConstraintPace(BigDecimal paceEstimado, ConfiancaInferencia confianca, LocalDate dataInferencia): String`
  - Confiança BAIXA: adiciona aviso de margem ampliada.
- [ ] 4.1.b Validação: `./mvnw clean compile`.

### 4.2 Integração em `PlanoTreinoPromptBuilder`

- [ ] 4.2.a Injetar `ThresholdConstraintFormatter` no builder via `@RequiredArgsConstructor`.
- [ ] 4.2.b Adicionar métodos privados de staleness ao builder:
  ```java
  private boolean fcLimiarDesatualizado(Atleta a) { ... }
  private boolean paceLimiarDesatualizado(Atleta a) { ... }
  ```
- [ ] 4.2.c No `buildOptimizedPrompt()`, logo após o bloco `[1]` de dados fisiológicos, adicionar leitura dos campos de `PlanoMetaDados`:
  - Se `metaDados.getFcLimiarEstimado() != null && fcLimiarDesatualizado(atleta)`: emitir Constraint de FC.
  - Se `metaDados.getPaceLimiarEstimado() != null && paceLimiarDesatualizado(atleta)`: emitir Constraint de pace.
- [ ] 4.2.d Confirmar que `metaDados` já está disponível no builder (passado pelo `IaServiceImpl`). Se não estiver: adicionar como parâmetro.
- [ ] 4.2.e Validação: `./mvnw clean test`.

### 4.3 `PlanoMetaDadosOutputDto`

- [ ] 4.3.a Adicionar ao `PlanoMetaDadosOutputDto` (com `@JsonInclude(NON_NULL)`):
  - `fcLimiarEstimado: Integer`
  - `paceLimiarEstimadoFormatado: String` (formatado como "4:45/km")
  - `confiancaInferenciaFc: ConfiancaInferencia`
  - `confiancaInferenciaPace: ConfiancaInferencia`
  - `dataInferenciaLimiar: LocalDate`
- [ ] 4.3.b Atualizar o mapper de `PlanoMetaDados → PlanoMetaDadosOutputDto` para incluir os novos campos (com conversão `BigDecimal` → String formatada para pace).
- [ ] 4.3.c Validação: `./mvnw clean test`.

---

## Bloco 5 — Frontend: banner de transparência

### 5.1 Tipo TypeScript

- [ ] 5.1.a Adicionar campos opcionais ao tipo `PlanoMetaDados` (ou ao tipo de profile do atleta) em `src/types/`:
  ```ts
  fcLimiarEstimado?: number;
  paceLimiarEstimadoFormatado?: string;
  confiancaInferenciaFc?: 'ALTA' | 'MEDIA' | 'BAIXA';
  confiancaInferenciaPace?: 'ALTA' | 'MEDIA' | 'BAIXA';
  dataInferenciaLimiar?: string;
  ```
- [ ] 5.1.b Validação: `npm run build`.

### 5.2 Banner na `CoachPlanReviewPage`

- [ ] 5.2.a Criar `LimiaresInferidosBanner.tsx` em `src/features/coach/components/`:
  - Props: `fcLimiarEstimado?: number`, `paceLimiarEstimadoFormatado?: string`, `confiancaFc?`, `confiancaPace?`
  - Renderizar `MUI Alert severity="info"` apenas quando pelo menos um campo está presente.
  - Listar: `FC limiar estimado: 163 bpm (ALTA)` e/ou `Pace limiar estimado: 4:45/km (MEDIA)`.
  - Texto fixo: "Limiares estimados por inferência — recomende um teste formal ao atleta."
  - Confiança BAIXA: adicionar ícone de aviso e texto "Poucos dados — revise as prescrições de intensidade."
- [ ] 5.2.b Na `CoachPlanReviewPage`, ao carregar o perfil do atleta (via `GET /coach/atletas/{id}/perfil`), passar os campos de inferência para o banner.
- [ ] 5.2.c Validação: `npm run lint && npm run build`.

### 5.3 Testes de componente

- [ ] 5.3.a `LimiaresInferidosBanner.test.tsx`:
  - Renderiza FC e pace quando ambos presentes.
  - Renderiza apenas FC quando só FC presente.
  - Não renderiza quando ambos ausentes/undefined.
  - Exibe aviso adicional quando confiança BAIXA.
- [ ] 5.3.b Validação: `npm run lint && npm run build && npm test`.

---

## Bloco 6 — QA e entrega

- [ ] 6.1 `./mvnw clean test` — todos os testes passando.
- [ ] 6.2 `npm run lint && npm run build && npm test` — tudo verde.
- [ ] 6.3 Teste manual ponta-a-ponta:
  - Registrar treino para atleta com `dataUltimoTesteFc` > 90 dias + ≥ 10 treinos com fcMedia nos últimos 30 dias → verificar no banco que `fc_limiar_estimado` foi populado em `tb_plano_metadados`.
  - Gerar plano para esse atleta → confirmar Constraint `[LIMIAR_FC_ESTIMADO]` no log (DEBUG).
  - Abrir `CoachPlanReviewPage` → confirmar banner visível com valor e confiança.
  - Registrar treino para atleta com `dataUltimoTesteFc` < 90 dias → verificar que `fc_limiar_estimado` permanece NULL.
  - Registrar treino com apenas 2 treinos válidos nos últimos 30 dias → verificar NULL (CA3).
  - Verificar que `Atleta.fcLimiar` e `Atleta.dataUltimoTesteFc` permanecem inalterados após qualquer treino (CA5).
  - Confiança BAIXA: verificar aviso adicional no banner.
- [ ] 6.4 Revisores: `menthoros-workflow:code-reviewer` + `menthoros-workflow:security-reviewer`.
- [ ] 6.5 Abrir PR (`feature/infer-thresholds-from-recent-workouts`) e aguardar CI verde.
