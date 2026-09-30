# Design — add-sync-health-signal

## D0. Gate de medição

Consulta no homelab (somente leitura) cruzando, para os atletas com lacuna ≥ 10 dias sem TSS ou sinal
`INATIVIDADE` nos últimos 60 dias, o estado das conexões em `tb_integracao_externa` (`ativo`,
`last_sync_error`, `ultima_sincronizacao`). Resultado em tabela no `tasks.md`. Abaixo de 20% de lacunas
com conexão com erro/desativada entre atletas com integração, a change para.

## D1. `ultimo_pull_sucesso_em`

Migration aditiva (`V98__...` ou a próxima livre): `ALTER TABLE tb_integracao_externa ADD COLUMN
ultimo_pull_sucesso_em TIMESTAMP NULL`. Sem backfill.

Gravação:
- `IntervalsIcuActivitySyncScheduler`: ao terminar a janela do atleta sem exceção (inclusive sem
  atividades novas). O cursor continua em `ultimaSincronizacao`.
- Strava (`StravaActivitySyncScheduler` e o webhook): ao processar sem erro.
- Push (`IntervalsIcuPushListener`, `IntervalsIcuRetrySchedulerImpl`): **não** grava.

## D2. Saúde por atleta

`SyncHealthResolver.resolver(atletaId, tenantId)` sobre as conexões ativas intervals.icu e Strava do tenant:

| Situação | Status |
|---|---|
| nenhuma conexão (ativa ou não) | `SEM_INTEGRACAO` |
| alguma conexão com pull ok nos últimos 10 dias | `OK` |
| senão, alguma conexão com `lastSyncError` ou desativada por erro | `COM_ERRO` |
| senão (ativa, sem erro, sem pull recente — ex.: recém-conectada) | `OK` |

`lastSuccessfulPullAt` = o mais recente entre as conexões; `plataforma` = a da conexão com erro.
`lastError` = categoria (`TOKEN_REVOGADO`, `FALHA_CONEXAO`, `DESCONHECIDO`) derivada de `lastSyncError`,
nunca o texto cru.

## D3. Perfil e front

`AtletaPerfilCoachOutputDto.syncHealth` (campo novo, identificadores em inglês — ADR-0007), via
`buscarNullable` (degrada com aviso). Front: `formatGapCaption` recebe a saúde; lacuna **aberta** com
`COM_ERRO` → "Sem sincronização com o <plataforma> desde dd/MM" + dica "peça ao atleta para reconectar";
lacuna fechada segue como hoje (o sync voltou). ACWR: o motivo de baixa confiança cita a sincronização no
mesmo caso.

## Riscos

- **Hipótese falsa** — gate D0.
- **Pull "sem erro" falso** (scheduler engole exceção). Mitigação: teste do scheduler com 401 e com
  exceção transitória.
- **Strava desativa a conexão no erro** (`ativo=false`): "desativada por erro" precisa de `lastSyncError`
  não nulo para não confundir com desconexão voluntária.

## Rollback

Reverter os PRs; a coluna nova fica (aditiva, nula) ou sai numa migration de limpeza.
