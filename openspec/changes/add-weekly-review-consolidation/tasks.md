# Tasks — add-weekly-review-consolidation (M · Full · backend, determinístico)

> Fatia 1 de 3. Sem LLM. Ancorada 1:1 ao `PlanoSemanal`, gerada no encerramento (ver ADR-0006). Cada bloco fecha com `./mvnw clean test`. `verify:` = como saber que funcionou. CA entre colchetes.

## Plano de execução — anchors reais (backend, 2026-07-24)

- **Migration V71** (última V70). Entidade padrão `@Entity` + `@Table(name="tb_...")` + `@Column(name="snake_case")`.
- **`PlanoSemanal`** já tem `semana_inicio/fim`, `tsb_inicio/fim`, volumes, `status` (`PlanoStatus.CONCLUIDO`) — reusar via join, não duplicar.
- **Encerramento:** hook em `EncerramentoSemanaService.encerrarPlanosElegiveis` (dispara manual + fallback `EncerramentoSemanaScheduler`).
- **Aderência:** contagem via `treinoPlanejadoRepository.findComRealizadoByAtletaAndPeriodo(atletaId, tenantId, semanaInicio, semanaFim)` na janela do plano (**NÃO** `getAdesaoSemana`). Criticidade `TipoTreino.getFatorImpacto() ≥ 1.15`.
- **Coach-only:** `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")`; tenant `TenantContext.getTenantId()`.

## 0. Pré-requisitos (ancorados)

- [x] 0.1 Ancoragem ao `PlanoSemanal`, aderência por contagem, gatilho no encerramento — confirmados em grelhagem (ADR-0006, glossário "Revisão Semanal") — [D1–D5]

## 1. Modelo & migration

- [ ] 1.1 Migration **V71** aditiva `tb_revisao_semanal` com FK **única** `plano_semanal_id` — [CA6]
  - verify: `flyway:validate`; índice único em `plano_semanal_id`.
- [ ] 1.2 Entidade + DTO: `planoSemanalId`, `recommendationType`, `adherenceStatus`, `percentualRealizacao`, `dadosSuficientes`, `geradaEm` — [CA1]
  - verify: teste de mapeamento entidade↔DTO.
- [ ] 1.3 Validação: `./mvnw clean test`

## 2. Consolidação determinística

- [ ] 2.1 `adherenceStatus` por contagem na janela exata `[semanaInicio, semanaFim]` via `treinoPlanejadoRepository.findComRealizadoByAtletaAndPeriodo(atletaId, tenantId, semanaInicio, semanaFim)`: ALTA ≥90% / MEDIA 60-89% / BAIXA <60% ou treino crítico (`fatorImpacto ≥1.15`) faltando — [CA1b]
  - verify: teste parametrizado nos 3 cortes + crítico faltando forçando BAIXA; janela contada é a do plano (segunda–domingo), NÃO 4 semanas nem via `getAdesaoSemana`.
- [ ] 2.2 `dadosSuficientes = false` no limiar (<2 treinos realizados OU sem ponto PMC/TSB válido, inclui `tsb_fim` nulo) — [CA3]
  - verify: teste nos gatilhos, incluindo `tsb_fim` nulo.
- [ ] 2.3 `recommendationType` (árvore D5, TSB de `PlanoSemanal.tsb_fim`): se `tsb_fim` nulo ⇒ MAINTAIN (ramos numéricos não se aplicam); senão RECOVERY se `tsb_fim≤−25` ou (`BAIXA` e `tsb_fim≤−10`); PROGRESS se `ALTA` e `tsb_fim≥−10` e `dadosSuficientes` e sem crítico faltando; senão MAINTAIN — [CA2, CA2b, CA2c, CA3b]
  - verify: teste parametrizado cobrindo os 3 ramos + default + `tsb_fim` nulo → MAINTAIN.

## 3. Geração no encerramento & congelamento

- [ ] 3.1 Hook em `EncerramentoSemanaService`: ao `CONCLUIDO`, gerar+persistir a `RevisaoSemanal` (upsert idempotente por `plano_semanal_id`) sob `TenantContext` — [CA1, CA6, CA7]
  - verify: encerrar um plano → 1 `RevisaoSemanal`; encerrar de novo → segue 1 (upsert).
- [ ] 3.2 Congelamento: os campos derivados são gravados no encerramento; a leitura devolve a coluna `recommendation_type` persistida e **não** recomputa — [CA-Congelamento]
  - verify: persistir uma `RevisaoSemanal` cujo `recommendationType` contradiz o que a regra atual produziria; reler → devolve o persistido (sem externalizar limiares).
- [ ] 3.3 Validação: `./mvnw clean test`

## 4. Leitura

- [ ] 4.1 Endpoint `GET` read-only da revisão do atleta, `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")`; antes do `CONCLUIDO` → **HTTP 404** (corpo vazio) — [CA1, CA7]
  - verify: MockMvc 200 TECNICO/ADMIN, 403 ATLETA; 404 antes do encerramento.
- [ ] 4.2 `weekOverWeekDelta` computado na leitura (vs. `PlanoSemanal` anterior; `PRIMEIRA_SEMANA` sem anterior) — [CA9]
  - verify: teste com/sem plano anterior.
- [ ] 4.3 Validação: `./mvnw clean test`

## 5. Testes (rastreados a CA)

- [ ] 5.1 Geração no encerramento cria RevisaoSemanal 1:1 completa [CA1]
- [ ] 5.2 Cortes de aderência ALTA/MEDIA/BAIXA por contagem + crítico faltando [CA1b]
- [ ] 5.3 RECOVERY em `tsb_fim ≤ −25` e em (`BAIXA` e `tsb_fim ≤ −10`) [CA2]
- [ ] 5.4 PROGRESS só com `ALTA` + `tsb_fim ≥ −10` + `dadosSuficientes` + sem crítico faltando [CA2b]
- [ ] 5.5 MAINTAIN no default (intermediário, `dadosSuficientes = false`, e `tsb_fim` nulo → MAINTAIN) [CA2c, CA3b]
- [ ] 5.6 `dadosSuficientes = false` → `recommendationType ≠ PROGRESS` [CA3]
- [ ] 5.7 **Congelamento**: leitura devolve `recommendationType` persistido mesmo contradizendo a regra atual (sem recompute) [CA-Congelamento]
- [ ] 5.8 Idempotência: re-encerrar não duplica (upsert por `plano_semanal_id`) [CA6]
- [ ] 5.9 Isolamento multi-tenant + endpoint coach-only (200 TECNICO/ADMIN, 403 ATLETA) [CA7]
- [ ] 5.10 `weekOverWeekDelta` computado vs. anterior; `PRIMEIRA_SEMANA` sem anterior [CA9]
- [ ] 5.11 Validação final: `./mvnw clean test`
