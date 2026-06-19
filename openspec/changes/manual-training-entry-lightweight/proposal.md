# Proposal: manual-training-entry-lightweight

**Tamanho:** S · **Trilha:** Full

## Status

Proposed

## Why

Toda a inteligência do Menthoros — TSB, fila de atenção, debrief, sugestões — depende de dado de treino. O `first-party-ingestion-architecture` (Sprint 22) é a solução completa: upload de `.fit`, dedup cross-source, compute-on-import. É uma change L que não chegará por muitos sprints.

Enquanto isso, o sistema está **funcionalmente cego**: a fila de atenção avalia aderência sem saber o que o atleta efetivamente fez, o TSB não se move, e o inbox de sugestões dispara alertas de "sem treinos recentes" que são reais mas vazios de conteúdo.

A infraestrutura backend existe: `TreinoRealizado` já tem `percepcaoEsforco`, `fonteDados` (enum com `MANUAL`), `distanciaKm`, `tssCalculado`. O `TssCalculatorService` já calcula TSS por RPE como fallback. O `TreinoService.lancarTreino()` já persiste, publica evento e atualiza TSB — mas está exposto apenas para `TECNICO`/`ADMIN`. O que falta é **expor essa capacidade para o atleta** via um endpoint próprio e um formulário no shell.

Esta change é um **desbloqueador de MVP**: com dado real fluindo, a fila de atenção reflete a realidade, o debrief tem conteúdo, e o coach começa a ver valor nos painéis entregues.

É **substituída naturalmente** pelo `first-party-ingestion-architecture`: os registros manuais convivem com os importados via campo `fonteDados`.

## What Changes

### Backend

- **Novo record de input** `TreinoManualInputDto`: `tipo` (TipoTreino), `data` (≤ hoje), `duracaoMinutos` (Integer — convertido para `Duration` no mapper), `distanciaKm` (BigDecimal, opcional), `percepcaoEsforco` (1–10), `observacoes` (String opcional). `fonteDados` e `status` são fixados em `MANUAL` e `REALIZADO` respectivamente — não expostos no input.

- **Novo método** `TreinoService.registrarTreinoManualAtleta(UUID atletaId, TreinoManualInputDto)`:
  - Resolve tenant de `TenantContext.getRequiredTenantId()`
  - Valida atletaId pertence ao tenant
  - Converte `duracaoMinutos` → `Duration.ofMinutes(n)` no mapper
  - Seta `fcMedia = null`, `paceMedia = null` (nullable — confirmado na investigação de schema)
  - Chama `TssCalculatorService` existente (método RPE) — sem duplicar fórmula
  - **Best-effort match**: busca `TreinoPlanejado` por `(atletaId, data, tipo)` com status `PERDIDO` ou sem realizado vinculado; se encontrado, atualiza `statusTreino = REALIZADO` e vincula via `treinoPlanejadoId`. Se não encontrado, persiste standalone (sem vínculo)
  - Seta `criadoPor = "ATLETA"` e `fonteDados = MANUAL`
  - Publica `TreinoRegistradoEvent` (já existente)
  - Atualiza TSB via `TsbService.atualizarTsbDia()`

- **Novo endpoint** `POST /api/v1/atletas/me/treinos` — `@PreAuthorize("hasRole('ATLETA')")`. Resolve `atletaId` internamente via cadeia JWT → `AuthenticatedPrincipalResolver` → `Usuario` → `Atleta` (padrão existente em `TreinoRealizadoController`). Retorna `TreinoRealizadoOutputDto` (201).

- **Novo endpoint** `GET /api/v1/atletas/me/treinos?dias=7` — `@PreAuthorize("hasRole('ATLETA')")`. Retorna lista dos últimos `dias` dias (default 7, max 30). Usa método de repositório por `(atletaId, dataInicio, dataFim)`.

- **Migration V37**: apenas se DDL de `fc_media` ou `pace_media` for `NOT NULL` — nesse caso, tornar nullable. Os campos `percepcao_esforco` e `fonte_dados` já existem desde V1. Nenhuma tabela nova.

### Frontend

- **Nova rota** `/atleta/treinos/registrar` → `ManualTrainingFormPage`.
- **`ManualTrainingForm`**: seletor de tipo (chips com os valores do enum `TipoTreino` — running-specific, v1); date picker com default = hoje; campo de duração em minutos; campo de distância em km (opcional, oculto para tipo REGENERATIVO); slider de RPE 1–10 com label textual ("1–3 Leve / 4–6 Moderado / 7–8 Intenso / 9–10 Máximo"); campo de observações (opcional); **preview de TSS estimado em tempo real** (calculado client-side: `(duracaoMin/60) × (rpe/10)² × 100`); botão "Registrar treino".
- **`RecentTrainingsList`**: últimos 7 dias — tipo + duração + distância + RPE + TSS estimado + data. Exibido abaixo do formulário. Badge `MANUAL` em cada item.
- Entrada na navegação do atleta: "Registrar treino" como ação rápida na `AtletaHomePage`.
- **Novo hook** `useManualTraining` + **`ManualTrainingService`** (POST + GET no cliente curado).

## Capabilities

### New Capabilities

- `manual-training-entry`: atleta registra treino manualmente (sem GPS/dispositivo); dados fluem para TSB, fila de atenção e debrief. Best-effort match com treino planejado elimina falsos positivos de aderência.

### Modified Capabilities

- `coach-attention-queue`: sinal de "inatividade" e "aderência baixa" passa a ter dado real — treino manual com match bem-sucedido atualiza status do planejado para REALIZADO.
- `plan-adherence-tracking`: aderência avaliada sobre treinos realizados reais, não apenas planejados sem contraparte.

## Impact

**Banco de dados:**
- Verificar DDL de `fc_media` e `pace_media` em V1: se `NOT NULL`, migration V37 torna nullable.
- Todos os outros campos necessários já existem desde V1 (`percepcao_esforco`, `fonte_dados`, `distancia_km`, `duracao_min`, `criado_por`).
- Nenhuma tabela nova.

**APIs novas:**
- `POST /api/v1/atletas/me/treinos` — `@PreAuthorize("hasRole('ATLETA')")`
- `GET /api/v1/atletas/me/treinos?dias=7` — `@PreAuthorize("hasRole('ATLETA')")`

**Endpoint existente não alterado:**
- `POST /api/v1/treinos/{atletaId}/lancar-treino` (TECNICO/ADMIN) permanece; a lógica do service será parcialmente compartilhada via extração de método.

**Dependências:**
- `add-current-user-endpoint` ✅ — resolução de identidade.
- `add-assessoria-onboarding` ✅ — tenant resolution.
- Desbloqueia: `add-post-workout-debrief`, `athlete-profile-drilldown` (9f usa `GET /atletas/me/treinos`).
- Substituído futuramente por `first-party-ingestion-architecture` (Sprint 22).

**Multi-tenancy:**
- `atletaId` resolvido da cadeia JWT → `Usuario` → `Atleta` do mesmo tenant. Sem path param exposto.

## Critérios de Aceite

**CA1 — Atleta registra treino e inatividade some da fila:**
- Given: atleta sem treinos nos últimos 14 dias
- When: `POST /atletas/me/treinos` com tipo=CONTINUO, data=hoje, duracaoMinutos=45, percepcaoEsforco=6
- Then: (1) resposta 201 com `id` e `fonteDados=MANUAL` no body; (2) `GET /atletas/me/treinos?dias=7` retorna o registro; (3) `GET /api/v1/coach/attention-queue` não inclui sinal `INATIVIDADE` para esse atleta

**CA2a — Best-effort match com planejado PERDIDO atualiza aderência:**
- Given: atleta tem `TreinoPlanejado` para hoje com tipo=CONTINUO, `statusTreino=PERDIDO`, sem realizado vinculado
- When: registra treino manual com tipo=CONTINUO, data=hoje
- Then: `TreinoPlanejado` do mesmo dia tem `statusTreino=REALIZADO`; `treinoPlanejadoId` no treino manual aponta para ele; avaliador de aderência não conta esse treino como perdido

**CA2b — Best-effort match com planejado ainda PLANEJADO atualiza aderência:**
- Given: atleta tem `TreinoPlanejado` para hoje com tipo=CONTINUO, `statusTreino=PLANEJADO`, sem realizado vinculado
- When: registra treino manual com tipo=CONTINUO, data=hoje
- Then: `TreinoPlanejado` do mesmo dia tem `statusTreino=REALIZADO`; `treinoPlanejadoId` vinculado

**CA3 — Treino manual sem planejado correspondente é standalone:**
- Given: atleta não tem treino planejado para hoje
- When: registra treino manual
- Then: treino persiste com `treinoPlanejadoId = null`; sistema não lança erro

**CA4 — Validações de entrada:**
- Given: dados inválidos (RPE=11, data futura, duração=0)
- Then: 422 com mensagem descritiva para cada caso

**CA5 — Isolamento: atleta A não registra pelo atleta B:**
- Given: endpoint usa `/me` (resolução via JWT)
- Then: sem parâmetro de atletaId exposto; registro sempre vai para o atleta do token

**CA6 — TSS calculado via pipeline de evento existente:**
- Given: duração=60min, RPE=7 (sem fcMedia nem paceMedia)
- When: treino manual é salvo e `TreinoRegistradoEvent` é processado
- Then: `tssCalculado` persistido é não-nulo e `metodoCalculoTss = 'RPE'` — calculado pelo handler do evento, não por fórmula duplicada no service

**CA7 — Dado manual identificado visualmente:**
- Given: coach abre o shell e há itens da fila derivados de treino manual
- Then: itens exibem indicador `fonte=MANUAL` (badge ou label) para o coach distinguir de dado de dispositivo

**CA8 — GET com limite de dias respeitado:**
- Given: `GET /atletas/me/treinos?dias=100`
- Then: retorna no máximo 30 dias de histórico (max hard cap)

## Métrica de Sucesso

**Primária (coach):** sinais de inatividade na fila de atenção caem ≥ 50% em atletas que usam o formulário ao menos 1×/semana.
- Medido via: `SELECT COUNT(*) FROM tb_sinal_atencao WHERE motivo='INATIVIDADE' AND atleta_id IN (SELECT DISTINCT atleta_id FROM tb_treino_realizado WHERE fonte_dados='MANUAL' AND data_treino >= NOW() - 7)` — comparar semana pré vs. pós-entrega.
- Baseline: não coletado pré-entrega (sprint 0 desta métrica); coletar no dia do deploy e 7 dias depois.
- Janela: 14 dias após disponibilização do formulário.

**Secundária (adoção):** ≥ 1 treino manual registrado por atleta ativo por semana após 2 semanas de uso.
- Medido via: `SELECT atleta_id, COUNT(*) FROM tb_treino_realizado WHERE fonte_dados='MANUAL' AND data_treino >= NOW() - 7 GROUP BY atleta_id`.
- Baseline: 0 (nenhum registro MANUAL existe antes desta change).

**Terciária (IA):** ≥ 60% das sugestões geradas no inbox têm pelo menos 1 treino realizado (qualquer fonte) nos 14 dias anteriores como insumo.
- Medido via: verificar `tb_sinal_atencao` — sinais do tipo INATIVIDADE diminuem após ingestion de dado manual.
- Baseline: não coletado; observar após 30 dias de uso.

## Riscos e Mitigações

| Risco | Prob | Impacto | Mitigação no v1 |
|---|:---:|:---:|---|
| RPE sistemático alto (=10) infla CTL/ATL, corrompendo futuro histórico | HIGH | HIGH | Preview TSS no form com label "estimativa (±30%)"; campo `metodoCalculoTss='RPE'` já salvo — usar para filtro no coach shell |
| Backfill retroativo mascara inatividade real | MEDIUM | HIGH | Limitar `data` a no máximo 7 dias no passado no endpoint |
| Aderência falsa se match não ocorrer | HIGH | HIGH | Best-effort match por data+tipo obrigatório no serviço — não é follow-up |
| `duracaoMin` é `Duration`, form envia Integer | HIGH | MEDIUM | Conversão no mapper (`Duration.ofMinutes(n)`) — testada na suíte |
| UPDATE retroativo de `fonte_dados` pode bloquear tabela | MEDIUM | HIGH | Não executar UPDATE retroativo — valores existentes com NULL ficam como NULL; código Java trata NULL como IMPORTADO |
| Dois treinos no mesmo dia somam TSS elevado | HIGH | MEDIUM | Soft-warning no form se já existe treino na data selecionada |
| Observações visíveis na IA sem sanitização | LOW | MEDIUM | Truncar observações a 200 chars antes de injetar em contexto LLM (follow-up Sprint 22) |

## Open Questions & Assumptions

**Premissas confirmadas pelo levantamento de código (2026-06-19):**
- `TreinoRealizado` tem todos os campos necessários: `percepcaoEsforco`, `fonteDados` (enum com MANUAL), `distanciaKm`, `duracaoMin` (Duration), `criadoPor`.
- `FonteDados.MANUAL` já existe no enum.
- `TssCalculatorService` já implementa cálculo por RPE — não duplicar lógica.
- `TreinoService.lancarTreino()` já persiste, publica evento e atualiza TSB — reutilizar lógica.
- Próxima migration disponível: V37.
- `TipoTreino` é running-specific (sem musculação/natação/bicicleta) — usar como está no v1.

**Decisões de produto tomadas:**
- v1 running-only: formulário usa `TipoTreino` existente. Tipos de cross-training (musculação, natação, bicicleta) entram em change futura com expansão do enum.
- v1 append-only: sem edição ou exclusão de registros manuais.
- v1 atleta registra o próprio treino; coach registra pelo atleta usando endpoint existente (TECNICO/ADMIN).
- Observações não aparecem no coach shell no v1 — apenas no shell do atleta.

**Confirmações adicionais do levantamento de código (2026-06-19):**
- `fc_media` e `pace_media` são **NULLABLE** no DDL real (V1, linhas 218/221). Migration V37 para nullable **não é necessária**. O que existe é divergência entre DDL (nullable) e anotação JPA (`@Column(nullable = false)`) — corrigir a anotação na entidade como task 1.1.
- `TreinoService.lancarTreino()` **não chama `TssCalculatorService` diretamente** — TSS é calculado via handler do `TreinoRegistradoEvent`. O service salva e dispara o evento; o cálculo ocorre assincronamente no listener.
- `matchByAtletaAndDateAndType()` existe em `TreinoPlanejadoRepository` mas **sem filtro "sem realizado"** — necessário criar novo método `findFirstByAtletaIdAndDataTreinoAndTipoTreinoAndTreinoRealizadoIsNull()` (task 1.3).
- `TreinoRealizadoOutputDto.duracaoMin` é `String` no DTO de saída (formato "HH:MM:SS" ou "MM:SS") — frontend deve exibir assim ou converter para minutos.
- `@PreAuthorize("hasRole('ATLETA')")` é o padrão correto (confirmado em `AtletaProgressController`).

**Decisão de rollback:**
- Esta change não tem migration DDL (nenhuma coluna nova, nenhuma tabela nova — os campos já existem). Rollback = reverter commit no backend + redeploy. Registros manuais já persistidos ficam no banco com `fonte_dados='MANUAL'` — são inofensivos e invisíveis ao atleta após rollback (endpoint some), visíveis apenas em queries diretas.
- Rollback do frontend = reverter commit + rebuild. Formulário some da navegação.
- Não é necessária migration de down-rollback.

**Em aberto:**
- O form deve exibir `TipoTreino` com label amigável (ex: "Corrida Contínua" para CONTINUO)? Mapear labels no frontend — sim, definido na tabela do design.md D3.
- Limite de 7 dias retroativos: decision tomada (task 1.3 valida); endpoint TECNICO existente cobre backfill ilimitado para coaches.
