# Proposal: gerar-plano-individual-assincrono

**Tamanho:** S · **Trilha:** Fast (só `apps/menthoros-front`; reusa endpoint backend que já existe;
sem contrato novo, sem schema, sem multi-tenancy — o `gerar-lote` já é tenant-aware. Muda **de
qual endpoint** o botão chama, não a regra.)

## Status

- Proposta inicial (2026-09-08) — derivada do ensaio de validação em produção do mesmo dia.
- **DoR (2026-09-08): NOT READY na 1ª passada, corrigido nesta revisão.** spec-reviewer + Codex,
  achados convergentes e um BLOCKER, todos folded aqui e nas tasks. Premissas centrais
  **confirmadas**: `BatchPlanProcessor` chama o mesmo `gerarPlanoTreino(atletaId, modo)`, `modo`
  propagado, role TECNICO/ADMIN idêntica, terminal traz `planoId` por atleta.

## Why

No ensaio de produção (2026-09-08), o coach clicou em **gerar plano** de um atleta e recebeu
**504** na tela. Causa medida nos logs: a geração roda **síncrona** (`POST /api/v1/planos/atletas/
{id}/gerar`) e leva **~35s**; para atleta **cold-start** (sem histórico) o plano degenera na
validação e o `PlanoResilienceService` re-gera, indo a **~70s** (medido: `duration_ms=70598`,
status 200). O nginx do front corta `/api/` em **60s** (`proxy_read_timeout 60s`) → 504 antes de o
backend responder. O Cloudflare (100s) só repassou.

**Por que dói no lançamento:** atleta sem treino anterior é a **maioria** na turma fundadora. Cada
primeira geração é o pior caso de latência — a exata que estoura o teto. Geração de plano por LLM é
incompatível com qualquer timeout de proxy num caminho síncrono.

**A infra assíncrona já existe e é usada** pela geração em lote: `POST /api/v1/coach/planos/
gerar-lote` responde **202 + jobId** (aceita 1–20 atletas), `GET /api/v1/coach/planos/lote/{jobId}`
faz polling, e o front tem `useBatchPlanGeneration`/`BatchPlanService`/`BatchPlanDialog`. O LLM já
roda fora da transação, com `LlmConcurrencyLimiter`. Só o **gerar-de-um-atleta** do `planosDialog`
ficou no endpoint síncrono.

## What Changes

Só `apps/menthoros-front`:

- O disparo de geração de um atleta no `planosDialog.tsx` (hoje `usePlanoSemanal.gerarPlanoSemanal`
  → endpoint síncrono) passa a usar o fluxo assíncrono existente: **lote de 1 atleta** via
  `useBatchPlanGeneration.gerarLote([atletaId], modo)` + polling do job, com estados
  loading/erro/sucesso.
- Ao concluir o job com sucesso, recarregar o plano do atleta (o `planosDialog` já relista) — sem
  bloquear a UI durante os ~35–70s; o coach vê progresso em vez de tela travada.
- Não remover o endpoint síncrono do backend nesta change (outros caminhos podem usá-lo; a remoção,
  se couber, é follow-up após confirmar zero consumidores).

## Non-goals

- **Qualidade do plano cold-start** (o plano degenerado que causa o retry e dobra a latência) —
  follow-up separado, é o Cenário C do `athlete-onboarding-baseline` (heurística sem histórico).
  Esta change remove o **504**; não muda o tempo de geração em si.
- Mexer no `proxy_read_timeout` do nginx — vira irrelevante com o assíncrono (band-aid descartado).
- Alterar o fluxo de geração em lote (N atletas), que já funciona.

## Critérios de aceite

1. **Given** um coach gerando o plano de um atleta cold-start (geração > 60s), **when** ele dispara
   pela UI, **then** a requisição volta **imediatamente** (202) e a tela mostra progresso — **sem
   504**, independente de a geração levar 35s ou 70s.
2. **Given** o job concluído com sucesso, **when** o polling detecta o estado terminal, **then** o
   plano gerado aparece para o coach sem refresh manual.
3. **Given** o job termina em `CONCLUIDO_COM_ERROS` (LLM indisponível, plano inválido), **when** o
   polling atinge o estado terminal, **then** a UI mostra mensagem acionável lida de
   `status.erros`/`errosDetalhes` — **não basta observar `error`** (o hook não o preenche nesse
   estado; falha silenciosa é o risco).
4. **Given** a geração em andamento, **when** o coach fecha e reabre o dialog, **then** o polling
   não vaza (sem requisições órfãs) **e uma resposta 202 tardia após o reset não reinicia o
   polling** (corrida do BLOCKER — a geração corrente tem de ser capturada antes do `await` e
   respostas obsoletas descartadas, inclusive erros).
5. **Given** um job já em acompanhamento para o atleta, **when** o coach clica em gerar de novo,
   **then** o disparo é bloqueado durante o polling (evita segundo job e chamada LLM duplicada — o
   backend só deduplica dentro de um lote, não entre requisições).
6. **Given** já existe plano para a semana-alvo, **when** o job termina, **then** a UI comunica o
   conflito (o lote devolve `MOTIVO_PLANO_JA_EXISTE` no relatório, **após** o polling — diferente
   do síncrono, que hoje estoura exceção imediata).

## Métrica de sucesso

- **Zero 504** em geração de plano individual no ambiente de produção (hoje: 100% dos cold-start
  acima de 60s estouram). Verificável no log estruturado (`status=504` some para `/planos/.../gerar`
  ou seu substituto) e no comportamento observado pelo coach.

## Open Questions & Assumptions

- **Assumido:** o `gerar-lote` com 1 atleta produz exatamente o mesmo plano do endpoint síncrono
  (mesmo `PlanoServiceImpl.gerarPlanoTreino` por baixo). Confirmar no `/implement init` lendo o
  `BatchPlanProcessor`.
- **Assumido:** o modo (`SEMANA_ATUAL`/`PROXIMA_SEMANA`) que o `planosDialog` passa hoje é aceito
  pelo `gerar-lote` (o service recebe `modo`). Verificar o contrato do `BatchLoteInput`.
- **Em aberto:** o `planosDialog` tem dois pontos de disparo (linhas ~203 e ~518) — confirmar se
  ambos passam pelo mesmo caminho ou se um deles é outro fluxo.

## Riscos e mitigações

- **BLOCKER (Codex) — corrida no `useBatchPlanGeneration`:** a geração corrente é capturada depois
  do `await` do POST; um 202 tardio após reset/unmount reinicia o polling, e o cleanup não cancela
  a requisição em voo. **Mitigação:** capturar a geração **antes** do `await`, descartar respostas
  (e erros) obsoletos, cancelar/ignorar in-flight no cleanup; teste de corrida. Corrige o hook, que
  também é usado pelo `BatchPlanDialog` — regressão a cobrir lá.
- **Convergente — `CONCLUIDO_COM_ERROS` não preenche `error`:** ler `status.erros`/`errosDetalhes`
  para a mensagem; observar só `error` é falha silenciosa. Coberto pelo AC3.
- **Redisparo durante o acompanhamento gera segundo job + LLM duplicado** (dedup é intra-lote).
  **Mitigação:** bloquear o botão enquanto o job está em andamento (AC5).
- **Trade-off aceito — perda da reserva interativa:** o síncrono usava a faixa interativa do
  `LlmConcurrencyLimiter`; pelo lote, o gerar-de-um passa a disputar a fila batch e pode esperar
  atrás de um lote grande. Aceito: async+espera é muito melhor que 504. Registrar; se a espera
  incomodar, avaliar depois uma faixa interativa para lote de 1.
- **Recovery de job órfão só no startup e > 30 min** (`BatchPlanRecoveryService`): reinício antes
  disso deixa o job órfão, e o timeout de 5 min do front só encerra o acompanhamento. Fora do
  escopo desta change — é o follow-up já no radar `batch-plan-recovery-by-state`; registrado como
  limitação conhecida.
- **Risco:** UX confusa (spinner infinito). **Mitigação:** reusar o padrão de estado terminal do
  `BatchPlanDialog`.
