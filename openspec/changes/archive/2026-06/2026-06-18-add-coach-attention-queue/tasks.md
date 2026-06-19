## Plano de execução — âncoras de código (backend)

- **Roster tenant-scoped:** `AtletaRepository.findAllByTenantIdOrderByNome(tenantId)` (linha 67) — mesma usada por `CoachDashboardServiceImpl.getRoster()` (linha 69).
- **TSB:** reusar a **mesma fonte** do dashboard — `metrica.getTsb()` (`CoachDashboardServiceImpl:165`); classificar via `FaixaTsb.nivelAlerta` (enum de domínio `enums/FaixaTsb`), **não** repetir os limiares crus -10/-20 de `deriveStatus`. Se `FaixaTsb` não cobrir o valor, tratar como sem-sinal.
- **lastActivity:** `treinoRealizadoRepository.findTopByAtletaIdOrderByDataTreinoDesc(atletaId)` (`CoachDashboardServiceImpl:154`).
- **Sobrecarga/progressão:** flags em `PlanoMetaDados` (`alertaSobrecarga/alertaRampAlto/alertaDiasConsecutivos/alertaNecessitaDescanso`); **sem plano ⇒ `SEM_PLANO`**.
- **Aderência:** `TreinoExecucaoStatus.PERDIDO`/`PARCIAL` na janela de 14 dias.
- **Zonas vencidas:** `Atleta.precisaAtualizarTestes()` (MEDIA → não exibido na v1).
- **Integração `hasAlert`:** stub fixo `false` em `CoachDashboardServiceImpl:180`.
- **Sem migration** (última = V35). Multi-tenant via `TenantContext.getRequiredTenantId()`, sem `@RequireTenant` (endpoint auto-resolvido pelo tenant — documentar a omissão como nos demais coach endpoints).

## 1. Contrato (DTO + enums)

- [x] 1.1 `CoachAttentionItemOutputDto` (record, `@JsonInclude(NON_NULL)`, `@Schema`): atletaId, athleteName, severity, priorityScore, primaryReason, suggestedAction, generatedAt, evidence[].
  - verify: `./mvnw clean compile` ok; record com os 8 campos e `@JsonInclude(NON_NULL)`.
- [x] 1.2 Enums `Severidade` (CRITICA/ALTA/MEDIA) e `MotivoAtencao` (FADIGA/SOBRECARGA/ADERENCIA/INATIVIDADE/SEM_PLANO/ZONAS_VENCIDAS); record `Evidencia(label, value)`.
  - verify: compila; enums com os valores exatos.
- [x] 1.3 Mapa de `suggestedAction` (6 templates determinísticos por motivo, tabela na proposal) e pesos de `priorityScore` por motivo/severidade.
  - verify: cada `MotivoAtencao` tem template não-vazio; mapeamento total (sem motivo sem template).
- **Validação do bloco:** `./mvnw clean compile`.

## 2. Derivação de sinais (helpers puros, testáveis)

- [x] 2.1 Fadiga/forma: TSB (mesma fonte do dashboard) → `FaixaTsb.nivelAlerta` → severity (CRITICO→CRITICA, ALTO→ALTA, ATENCAO→MEDIA); evidência com valor de TSB + faixa.
  - verify: teste cobre CRITICO/ALTO/ATENCAO + TSB null (sem item).
- [x] 2.2 Sobrecarga/progressão: `alertaSobrecarga`/`alertaNecessitaDescanso`→ALTA; `alertaRampAlto`/`alertaDiasConsecutivos`→MEDIA; evidência da flag/contagem.
  - verify: teste por flag (ativa/inativa) e severity correspondente.
- [x] 2.3 Aderência: `PERDIDO`/`PARCIAL` na janela de 14d (≥3→ALTA, 1-2→MEDIA); inatividade `lastActivity` (≥14d→ALTA, 7-13d→MEDIA, null→sem-sinal aqui).
  - verify: BVA nos cortes 1/2/3 perdidos e 6/7/13/14 dias.
- [x] 2.4 Zonas vencidas: `Atleta.precisaAtualizarTestes()`→MEDIA. Sem plano ativo (`PlanoMetaDados` nulo)→`SEM_PLANO` (ALTA).
  - verify: teste com testes vencidos vs em dia; teste com/sem plano.
- [x] 2.5 Testes unitários por helper: cada faixa/limiar (BVA -10/-20 via FaixaTsb, 7/14d, PERDIDO 1-2 vs ≥3), null/empty, e o ramo sem-plano.
  - verify: `./mvnw clean test` verde; branches de cada helper cobertos.
- **Validação do bloco:** `./mvnw clean test`.

## 3. Serviço de consolidação, priorização e dedup

- [x] 3.1 `CoachAttentionQueueService`/Impl: carrega roster tenant-scoped, aplica os helpers por atleta.
  - verify: roster vem de `findAllByTenantIdOrderByNome`; nenhum acesso a repository fora do tenant.
- [x] 3.2 Dedup por `(atletaId, primaryReason)`: motivo principal = maior severidade (desempate priorityScore); consolidar evidências.
  - verify: teste — atleta com 2 sinais mesmo motivo ⇒ 1 item; com motivos diferentes ⇒ vence maior severidade.
- [x] 3.3 Ordenação severity desc → priorityScore desc → mais recente; **filtro de corte `severity ≥ ALTA`** (MEDIA computado mas não exibido na v1); cap N=20; janela de aderência 14d.
  - verify: teste — atleta só-MEDIA não aparece; ordem determinística; cap aplicado.
- [x] 3.4 JavaDoc Idempotent: YES / Side Effects: NONE / Tenant-aware: YES em cada método público.
  - verify: JavaDoc presente nos métodos públicos.
- [x] 3.5 Testes: priorização determinística, dedup/consolidação, **corte de severidade** (MEDIA não exibido), cap N, e **isolamento de tenant (negativo)** — atleta de outro tenant não aparece.
  - verify: `./mvnw clean test` verde; teste cross-tenant garante zero vazamento.
- **Validação do bloco:** `./mvnw clean test`.

## 4. Endpoint

- [x] 4.1 `CoachAttentionQueueController` `GET /api/v1/coach/attention-queue` → `ResponseEntity<List<CoachAttentionItemOutputDto>>`; `@Tag`(ASCII `coach-attention-queue`)/`@Operation`/`@ApiResponses`; `array` no 200; injeta só o Service.
  - verify: rota responde 200; `@Tag` ASCII; só Service injetado (sem Repository).
- [x] 4.2 `@WebMvcTest` + `MockMvc`: 200 com lista, rota/JSON, severidade/ordem no payload.
  - verify: `./mvnw clean test` verde; jsonPath confere campos e ordem.
- **Validação do bloco:** `./mvnw clean test`.

## 5. Integração com o calendário do coach

- [x] 5.1 `CoachDashboardServiceImpl` preenche `CoachCalendarioDto…hasAlert` a partir da fila (atleta com item ⇒ `hasAlert=true` no dia correspondente).
  - verify: substitui o `false` fixo de `CoachDashboardServiceImpl:180`; atleta com item ⇒ `hasAlert=true`.
- [x] 5.2 Atualizar/!regredir os testes existentes do `CoachDashboard` (hasAlert deixa de ser fixo `false`).
  - verify: testes do dashboard verdes; cenário com/sem alerta.
- **Validação do bloco:** `./mvnw clean test`.

## 6. Validação final

- [x] 6.1 `./mvnw clean test` verde (suíte completa).
- [x] 6.2 Confirmar: sem migration nova, sem mutação de estado, contratos existentes intactos (só `hasAlert`).
- [x] 6.3 Atualizar este `tasks.md` (implementado vs adiado).

## 7. Follow-ups do QA gate (não-bloqueantes)

- [ ] 7.1 (segurança, defesa em profundidade) Queries de detalhe por atleta (`findLatestByAtletaId`, `findByAtletaId`, `findByAtletaIdAndDataBetween`, `findTopByAtletaIdOrderByDataTreinoDesc`) recebem só `atletaId`; isolamento ancora no roster tenant-scoped (mesmo padrão do `CoachDashboardServiceImpl` já mergeado). Adicionar variantes com `tenantId`/`assessoriaId` em ambos os serviços de agregação do coach.
- [ ] 7.2 (perf) `contarNaoCumpridos` carrega a lista e filtra em memória → `COUNT` no banco por status; filtrar `INATIVO` na query (usar método que já filtra `ativo`) em vez de em memória. Relaciona-se ao custo O(N) on-demand.
- [ ] 7.3 (DRY) Extrair `nomeCompleto(Atleta)` duplicado em `CoachAttentionQueueServiceImpl` e `CoachDashboardServiceImpl` para um helper compartilhado.
- [ ] 7.4 (type-safety) `deriveStatus` (pré-existente) retorna strings mágicas (`active/warning/danger/paused`) → enum.
- [ ] 7.5 (testes) Cobertura 401/403 nos `@WebMvcTest` do coach (lacuna do módulo — também afeta `CoachDashboardControllerTest`): testar `@PreAuthorize` com SecurityFilterChain parcial em vez de `addFilters=false`.
