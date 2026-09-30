# Design — fix-sync-cursor-data-loss

## D1. Cursor exclusivo do pull

- Coluna `pull_cursor TIMESTAMP NULL` em `tb_integracao_externa`; backfill com `ultima_sincronizacao`.
- Os schedulers de pull (intervals.icu, Strava) leem `pull_cursor` para montar a janela e o avançam por
  `UPDATE tb_integracao_externa SET pull_cursor = :novo WHERE id = :id AND tenant_id = :tenant` — sem salvar a
  entidade (push/retry/webhook salvam instâncias possivelmente antigas).
- `ultimaSincronizacao` não muda de significado nem de escritores; continua servindo o `lastSync` do front,
  o cooldown do sync manual e o status da conexão.
- `calcularCursor` (intervals.icu) segue como regra, agora aplicada a `pull_cursor`.

## D2. O que é progresso confirmado

| Item | Avança o cursor? |
|---|---|
| importado (inserção ou atualização) | sim |
| modalidade não suportada / 404 | sim (permanente de fato) |
| rejeitado pelo limite de retroatividade | **não se aplica ao scheduler** (D4) |
| rate limit, 401, erro transitório | não |

## D3. Strava

- `fetchActivitiesWithHeaders` devolve a página original e as corridas; o laço termina com a original
  vazia.
- Instante da atividade = `start_date` (UTC). O overlap existente cobre empates e uploads tardios.
- Se a ordenação com `after` for ascendente (task 0), o cursor avança até a última corrida processada da
  varredura; se não for, só ao fim da varredura completa.
- Sem corrida processada, o cursor fica onde está.
- Relistar: `mergeActivityIntoTreino` não pode sobrescrever o que veio do atleta (RPE, sensações,
  feedback) — conferir e cobrir por teste; a contagem usa inserções reais (`TreinoDedupHelper.SaveResult`).

## D4. intervals.icu — retroatividade

A validação de retroatividade (90 dias) fica no caminho do **import manual** (thread do request); o
scheduler chama a ingestão sem ela. O custo de recalcular TSB para atividade antiga é assíncrono no
scheduler.

## D5. Registro do pull

Tabela `tb_sync_pull_log` (`id`, `tenant_id`, `atleta_id`, `plataforma`, `executado_em`, `resultado`,
`erro_categoria`, `insercoes`), índice por `executado_em` (expurgo) e por `(tenant_id, atleta_id,
executado_em)` (consulta). Gravado pelo orquestrador do scheduler **depois** da transação do pull, em
transação própria (`REQUIRES_NEW`): rollback do lote ainda registra `FALHA`. Webhook e push não gravam.
Expurgo diário em lotes (> 90 dias).

## Riscos

- **Ordenação do Strava desconhecida** — task 0 antes de implementar D3.
- **Enriquecimento sobrescrito ao relistar** — teste dedicado (CA7).
- **Concorrência** — update pontual do cursor (D1).
- **Backfill herda cursor adiantado** — aceito; perda antiga fora do escopo.

## Rollback

Reverter o PR: os schedulers voltam a `ultimaSincronizacao`. Migration aditiva; coluna e tabela ficam sem
uso ou saem numa limpeza.
