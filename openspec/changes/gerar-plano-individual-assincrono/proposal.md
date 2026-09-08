# Proposal: gerar-plano-individual-assincrono

**Tamanho:** S · **Trilha:** Fast (só `apps/menthoros-front`; reusa endpoint backend que já existe;
sem contrato novo, sem schema, sem multi-tenancy — o `gerar-lote` já é tenant-aware. Muda **de
qual endpoint** o botão chama, não a regra.)

## Status

- Proposta inicial (2026-09-08) — derivada do ensaio de validação em produção do mesmo dia.

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
3. **Given** o job falha (ex.: LLM indisponível), **when** o estado terminal é de erro, **then** a
   UI mostra mensagem acionável, não trava em "gerando".
4. **Given** a geração em andamento, **when** o coach fecha e reabre o dialog, **then** o polling
   não vaza (sem requisições órfãs) — o `useBatchPlanGeneration` já encadeia e tem timeout de
   segurança; garantir o `reset`/cleanup no unmount.

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

- **Risco:** UX de "gerar um" piora se o polling for confuso (spinner infinito). **Mitigação:** o
  `BatchPlanDialog` já tem UI de progresso de lote; reusar o mesmo padrão de estado terminal.
- **Risco:** dois disparos concorrentes do mesmo atleta. **Mitigação:** o backend deduplica no lote
  e o hook reseta o polling anterior a cada `gerarLote`.
