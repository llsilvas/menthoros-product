# Tasks: infer-thresholds-from-recent-workouts

**Status:** Em implementação
**Sprint:** 9h (após `coach-edit-planned-workout`)
**Tamanho:** S · **Trilha:** Full
**Repos:** menthoros-backend + menthoros-front

---

## Bloco 1 — Backend: migration e modelo

### 1.1 Migration V40

- [x] 1.1.a Confirmar que V39 é a última migration aplicada após `coach-edit-planned-workout`.
- [x] 1.1.b Criar `V40__Add_threshold_inference_to_plano_metadados.sql`:
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
- [x] 1.1.c Validação: `./mvnw flyway:info` sem conflito.

### 1.2 Entidade e enum

- [x] 1.2.a Criar enum `ConfiancaInferencia` em `enums/`:
  ```java
  public enum ConfiancaInferencia { ALTA, MEDIA, BAIXA }
  ```
- [x] 1.2.b Adicionar os 5 novos campos à entidade `PlanoMetaDados` (nullable, sem `@NotNull`):
  - `fcLimiarEstimado: Integer`
  - `paceLimiarEstimado: BigDecimal` (precision=5, scale=4)
  - `confiancaInferenciaFc: ConfiancaInferencia` (@Enumerated STRING)
  - `confiancaInferenciaPace: ConfiancaInferencia` (@Enumerated STRING)
  - `dataInferenciaLimiar: LocalDate`
- [x] 1.2.c Validação: `./mvnw clean compile`.

---

## Bloco 2 — Backend: `ThresholdInferenceService`

### 2.1 Record de output

- [x] 2.1.a Criar record `ThresholdEstimate` em `services/helper/`.
- [x] 2.1.b Validação: `./mvnw clean compile`.

### 2.2 Implementação do service

- [x] 2.2.a Criar `ThresholdInferenceService` em `services/helper/`.
- [x] 2.2.b Implementar `inferirFcLimiar` (mediana do quintil superior; MIN_AMOSTRAS=3; janela 30d).
- [x] 2.2.c Implementar `inferirPaceLimiar` (quintil mais rápido em treinos contínuos; conversão seg→decimal).
- [x] 2.2.d Validação: `./mvnw clean compile`.

### 2.3 Testes de unidade — `ThresholdInferenceServiceTest`

- [x] 2.3.a `@Nested class InferirFcLimiar`: 9 testes cobrem lista vazia, < MIN_AMOSTRAS, BAIXA/MEDIA/ALTA, quintil, nulos, duração curta, janela 30d.
- [x] 2.3.b `@Nested class InferirPaceLimiar`: 6 testes cobrem lista vazia, < MIN_AMOSTRAS, tipos não-contínuos, quintil, conversão seg→decimal, paceMedia nulo.
- [x] 2.3.c Validação: 15 testes passando.

---

## Bloco 3 — Backend: integração em `TsbServiceImpl`

### 3.1 Injetar `ThresholdInferenceService` em `TsbServiceImpl`

- [x] 3.1.a Adicionar `ThresholdInferenceService thresholdInferenceService` ao constructor de `TsbServiceImpl` via `@RequiredArgsConstructor`.
- [x] 3.1.b Validação: `./mvnw clean compile`.

### 3.2 Método `atualizarLimiareInferidos`

- [x] 3.2.a Método privado `atualizarLimiareInferidos` com guards de staleness (> 90 dias), busca de treinos 30d, e setagem de campos em `metaDados` apenas quando inferência tem resultado.
- [x] 3.2.b Chamada integrada em `atualizarMetaDados()` antes do `save(metaDados)`.
- [x] 3.2.c Validação: `./mvnw clean test`.

### 3.3 Testes de integração em `TsbServiceImplTest`

- [x] 3.3.a `TsbServiceImplAtualizarLimiaresTest`: 6 testes via reflection — staleness guard, sample insuficiente, CA5, pace e FC.
- [x] 3.3.b Validação: 979 testes passando.

---

## Bloco 4 — Backend: prompt builder e DTO

### 4.1 `ThresholdConstraintFormatter`

- [x] 4.1.a Criar `ThresholdConstraintFormatter` em `services/prompt/` — gera texto de Constraint com nível de confiança e aviso de margem para BAIXA.
- [x] 4.1.b Validação: `./mvnw clean compile`.

### 4.2 Integração em `PlanoTreinoPromptBuilder`

- [x] 4.2.a Injetar `ThresholdConstraintFormatter` no builder via `@RequiredArgsConstructor`.
- [x] 4.2.b Lógica de staleness implementada dentro do próprio `ThresholdConstraintFormatter`.
- [x] 4.2.c Constraints de FC e pace adicionados em `montarRegras()` — emitidos apenas quando limiares oficiais estão desatualizados.
- [x] 4.2.d `metaDados` já estava disponível no builder.
- [x] 4.2.e Validação: 973 testes passando.

### 4.3 `PlanoMetaDadosOutputDto` e perfil coach

- [x] 4.3.a Adicionados 5 campos de inferência a `PlanoMetaDadosOutputDto`.
- [x] 4.3.b `AtletaPerfilCoachOutputDto` recebe `LimiareisInferidosDto` com FC, pace formatado, confiança — populado por `CoachAthleteProfileServiceImpl.resolverLimiareisInferidos()`.
- [x] 4.3.c Validação: 973 testes passando.

---

## Bloco 5 — Frontend: banner de transparência

### 5.1 Tipo TypeScript

- [x] 5.1.a `LimiareisInferidosDto` adicionado a `AtletaPerfilCoach.ts`; campo `limiareisInferidos?` adicionado a `AtletaPerfilCoachDto`.
- [x] 5.1.b Validação: `npm run build` verde.

### 5.2 Banner na `CoachAthleteProfilePage`

- [x] 5.2.a `LimiaresInferidosBanner.tsx` criado em `src/features/coach/components/` — renderiza FC/pace estimados com confiança e aviso BAIXA.
- [x] 5.2.b Banner integrado em `CoachAthleteProfilePage` (página de perfil do atleta, onde o perfil já está carregado).
- [x] 5.2.c Validação: `npm run lint && npm run build` verde.

### 5.3 Testes de componente

- [x] 5.3.a `LimiaresInferidosBanner.test.tsx`: 10 testes cobrindo null/undefined, FC-only, pace-only, ambos, texto fixo, aviso BAIXA, ausência de aviso em ALTA.
- [x] 5.3.b Validação: 155 testes passando (20 arquivos).

---

## Bloco 6 — QA e entrega

- [x] 6.1 `./mvnw clean test` — 979 testes passando (0 falhas).
- [x] 6.2 `npm run lint && npm run build && npm test` — 157 testes front passando; lint sem novos erros nos arquivos da change.
- [ ] 6.3 Teste manual ponta-a-ponta:
  - Registrar treino para atleta com `dataUltimoTesteFc` > 90 dias + ≥ 10 treinos com fcMedia nos últimos 30 dias → verificar no banco que `fc_limiar_estimado` foi populado em `tb_plano_metadados`.
  - Gerar plano para esse atleta → confirmar Constraint `[LIMIAR_FC_ESTIMADO]` no log (DEBUG).
  - Abrir `CoachPlanReviewPage` → confirmar banner visível com valor e confiança.
  - Registrar treino para atleta com `dataUltimoTesteFc` < 90 dias → verificar que `fc_limiar_estimado` permanece NULL.
  - Registrar treino com apenas 2 treinos válidos nos últimos 30 dias → verificar NULL (CA3).
  - Verificar que `Atleta.fcLimiar` e `Atleta.dataUltimoTesteFc` permanecem inalterados após qualquer treino (CA5).
  - Confiança BAIXA: verificar aviso adicional no banner.
- [x] 6.4 Revisores: `menthoros-workflow:code-reviewer` + `menthoros-workflow:security-reviewer` + `menthoros-workflow:clean-code-reviewer` — findings críticos e importantes corrigidos antes do PR.
- [x] 6.5 Abrir PR (`feature/infer-thresholds-from-recent-workouts`) e aguardar CI verde.
