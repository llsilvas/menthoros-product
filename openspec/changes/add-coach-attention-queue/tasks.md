## 1. Contrato (DTO + enums)

- [ ] 1.1 `CoachAttentionItemOutputDto` (record, `@JsonInclude(NON_NULL)`, `@Schema`): atletaId, athleteName, severity, priorityScore, primaryReason, suggestedAction, generatedAt, evidence[].
- [ ] 1.2 Enums `Severidade` (CRITICA/ALTA/MEDIA) e `MotivoAtencao` (FADIGA/SOBRECARGA/ADERENCIA/INATIVIDADE/SEM_PLANO/ZONAS_VENCIDAS); record `Evidencia(label, value)`.
- [ ] 1.3 Mapa de `suggestedAction` (6 templates determinísticos por motivo, tabela na proposal) e pesos de `priorityScore` por motivo/severidade.
- **Validação:** `./mvnw clean compile`.

## 2. Derivação de sinais (helpers puros, testáveis)

- [ ] 2.1 Fadiga/forma: `FaixaTsb` ← `PlanoMetaDados.tsbAtual` → item (severity via `nivelAlerta`).
- [ ] 2.2 Sobrecarga/progressão: `alertaSobrecarga`/`alertaRampAlto`/`alertaDiasConsecutivos`/`alertaNecessitaDescanso` (+contadores) → item.
- [ ] 2.3 Aderência: contagem de `TreinoExecucaoStatus.PERDIDO`/`PARCIAL` na janela → item; inatividade por `lastActivity` (≥7/≥14d).
- [ ] 2.4 Zonas vencidas: `Atleta.precisaAtualizarTestes()` → item (MEDIA). Sem plano ativo (`PlanoMetaDados` nulo) → item `SEM_PLANO` (ALTA).
- [ ] 2.5 Testes unitários por helper: cada faixa/limiar (BVA nos cortes -10/-20, 7/14d, PERDIDO 1-2 vs ≥3), null/empty, e o ramo sem-plano.
- **Validação:** `./mvnw clean test`.

## 3. Serviço de consolidação, priorização e dedup

- [ ] 3.1 `CoachAttentionQueueService`/Impl: carrega roster tenant-scoped (`AtletaRepository.findAllByTenantId…`), aplica os helpers por atleta.
- [ ] 3.2 Dedup por `(atletaId, primaryReason)`: motivo principal = maior severidade (desempate priorityScore); consolidar evidências.
- [ ] 3.3 Ordenação severity desc → priorityScore desc → mais recente; **filtro de corte `severity ≥ ALTA`** (MEDIA computado mas não exibido na v1); cap N=20; janela de aderência 14d.
- [ ] 3.4 JavaDoc Idempotent: YES / Side Effects: NONE / Tenant-aware: YES em cada método público.
- [ ] 3.5 Testes: priorização determinística, dedup/consolidação, **corte de severidade** (MEDIA não exibido), cap N, e **isolamento de tenant (negativo)** — atleta de outro tenant não aparece.
- **Validação:** `./mvnw clean test`.

## 4. Endpoint

- [ ] 4.1 `CoachAttentionQueueController` `GET /api/v1/coach/attention-queue` → `ResponseEntity<List<CoachAttentionItemOutputDto>>`; `@Tag`/`@Operation`/`@ApiResponses`; `array` no 200; injeta só o Service.
- [ ] 4.2 `@WebMvcTest` + `MockMvc`: 200 com lista, rota/JSON, severidade/ordem no payload.
- **Validação:** `./mvnw clean test`.

## 5. Integração com o calendário do coach

- [ ] 5.1 `CoachDashboardServiceImpl` preenche `CoachCalendarioDto…hasAlert` a partir da fila (atleta com item ⇒ `hasAlert=true` no dia correspondente).
- [ ] 5.2 Atualizar/!regredir os testes existentes do `CoachDashboard` (hasAlert deixa de ser fixo `false`).
- **Validação:** `./mvnw clean test`.

## 6. Validação final

- [ ] 6.1 `./mvnw clean test` verde (suíte completa).
- [ ] 6.2 Confirmar: sem migration nova, sem mutação de estado, contratos existentes intactos (só `hasAlert`).
- [ ] 6.3 Atualizar este `tasks.md` (implementado vs adiado).
