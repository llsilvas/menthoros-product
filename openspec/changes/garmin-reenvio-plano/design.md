# Design — garmin-reenvio-plano

## Context

Ver `proposal.md`. Estado do código que molda o desenho (verificado em 2026-11-01):

- `PlanoReviewServiceImpl.aprovarTransicao` (`@Transactional`) publica `PlanoAprovadoEvent(planoId,
  atletaId, tenantId)`. O único ouvinte é `IntervalsIcuPushListener.onPlanoAprovado`
  (`@Async` + `@TransactionalEventListener(AFTER_COMMIT)`), que resolve a conexão de canal do
  atleta (`GarminConnectionService.conexaoDeCanal`: Garmin ou intervals.icu), carrega os treinos do
  plano e chama `IntervalsIcuPushProcessor.processar` por treino.
- O processor faz claim do treino (`@Version`, `registrarTentativaSincronizacao` que incrementa
  `tentativasSincronizacao` e grava `ultimaTentativaSincronizacao`) e, em erro,
  `marcarErroSincronizacao` + escala para `ERRO_PERMANENTE` quando `atingiuLimiteTentativas()`
  (`>= 5`).
- `IntervalsIcuRetrySchedulerImpl` (`PT15M`, atraso inicial `PT5M`) só varre `AGUARDANDO_RETRY`,
  `ERRO_TEMPORARIO` e `ERRO_LIMITE_RATE`. `ERRO_PERMANENTE`, `ERRO_AUTENTICACAO` e `ERRO_VALIDACAO`
  não têm saída automática.
- O push é idempotente por treino: com `externalId` armazenado, atualiza o workout e move ou recria
  o schedule (Garmin) ou atualiza o evento (intervals.icu).
- `CoachPlanoReviewController` já tem `POST /{id}/aprovar` com `@PreAuthorize("hasAnyRole('TECNICO',
  'ADMIN')")` e `@RequireTenant(resourceParamIndex = 0)`.
- Front: `CurrentWeekPlan` renderiza `SyncStatusChip` por treino com `statusSincronizacao` e
  `atletaConectadoIntervalsIcu`. O DTO do perfil calcula esse campo por
  `IntervalsIcuConnectionService.conexaoAtiva` (`CoachAthleteProfileServiceImpl:140`), que só olha
  intervals.icu: para o atleta só-Garmin o campo é falso.

## Decisões

### D1 — Reenvio por plano, republicando o evento existente

O endpoint reinicia a sincronização dos treinos em erro do plano e republica o
`PlanoAprovadoEvent`. Alternativas descartadas:

- **Só marcar `AGUARDANDO_RETRY` e deixar o scheduler pegar:** funcionaria, mas o treinador espera
  até 15 min sem feedback; o evento dá resposta em segundos.
- **Chamar o `WorkoutChannel` direto do service:** duplicaria a resolução de conexão, o claim e o
  tratamento de erro que o listener já tem.
- **Reenvio por treino:** exige ação por linha e novo ponto de entrada no processor; fica para uma
  change própria.

### D2 — O evento é publicado dentro de transação

`@TransactionalEventListener(AFTER_COMMIT)` descarta o evento publicado fora de transação, sem
log (foi o que obrigou o IT do `garmin-training-push` a chamar o listener direto). O método do
service é `@Transactional` e publica depois de gravar o reset. Teste de integração cobre o caminho
completo (endpoint → commit → listener).

**Mitigação para ouvintes futuros:** o evento carrega `OrigemAprovacao` hoje? Não: só ids. Se um
ouvinte que notifique o atleta na aprovação for criado, ele precisa distinguir reenvio de aprovação.
Fica registrado como premissa; hoje há um único ouvinte (verificado por busca de
`PlanoAprovadoEvent` em `src/main`).

### D3 — Reset de sincronização no domínio

`TreinoPlanejado.reiniciarSincronizacao()` grava `tentativasSincronizacao = 0`,
`ultimaTentativaSincronizacao = null`, `erroSincronizacao = null` e `statusSincronizacao =
AGUARDANDO_RETRY`. Só é chamado para treinos em `ERRO_*` (qualquer variante, inclusive
`ERRO_PERMANENTE`). `externalId` e `exportadoPara` ficam como estão: o push seguinte atualiza o
workout existente em vez de criar outro.

`AGUARDANDO_RETRY` (e não `NAO_SINCRONIZADO`) faz o treino ser pego pelo scheduler caso o evento
se perca (reinício do processo entre o commit e o listener assíncrono): rede de segurança sem custo.

### D4 — Chip de status ciente do canal

O campo `atletaConectadoIntervalsIcu` do perfil só enxerga o intervals.icu. Adiciona-se o campo
`atletaConectadoCanal` ao DTO, calculado por `GarminConnectionService.conexaoDeCanal(...)
.isPresent()`, e o front passa a usá-lo no chip. O campo antigo permanece (outros consumidores)
e nada é renomeado aqui, pela regra de não renomear campo de DTO fora de uma change que já mexe na
entidade. Os textos do `SyncStatusChip` ficam neutros ("No relógio", "Atleta sem canal conectado").

### D4b — Motivo legível do erro

A mensagem de erro do treino (`erroSincronizacao`) fica no banco e não chega ao front (nenhum DTO
a expõe). O item de treino do perfil ganha o campo `erroSincronizacao` (texto curado pelo backend:
`GarminTrainingAdapter.mensagemCurada` e as mensagens do processor, sem corpo de terceiro nem
token). O front traduz o **tipo** (`statusSincronizacao`) em motivo e ação sugerida ao treinador,
com a mensagem do backend como detalhe:

| Status | Motivo mostrado | Ação sugerida |
|---|---|---|
| `ERRO_AUTENTICACAO` | Conexão do canal precisa de autorização | Pedir ao atleta que reautorize o Garmin Connect; se persistir, é configuração do app (nosso lado) |
| `ERRO_VALIDACAO` | O canal recusou o treino | Ajustar o treino e reenviar |
| `ERRO_LIMITE_RATE` | Limite de requisições do canal | O sistema tenta de novo; reenviar se persistir |
| `ERRO_TEMPORARIO` | Falha de comunicação com o canal | O sistema tenta de novo; reenviar se persistir |
| `ERRO_PERMANENTE` | Tentativas esgotadas | Reenviar |

O botão continua habilitado em `ERRO_AUTENTICACAO` (a causa pode ser do nosso lado, como a Training
API V2 não habilitada, e voltar a funcionar sem ação do atleta), mas o texto orienta antes do
clique.

### D5 — Contrato do endpoint

`POST /api/v1/coach/planos/{id}/reenviar-sincronizacao`, sem corpo.

- 200 `{ "reenviados": <int> }` (inclusive `0`: nada em erro, nenhum evento).
- 403: sem permissão ou plano de outro tenant (`@RequireTenant`).
- 404: plano não encontrado no tenant.
- 422: plano fora de `APROVADO` (mesmo tipo de erro da transição ilegal de `aprovar`).

Busca de plano por `findByIdAndTenantId`; a busca dos treinos em erro também filtra por
`tenantId`. Log de auditoria: planoId, tenantId, `reenviados` (sem dados do atleta).

### D6 — Botão no front

O botão fica no cabeçalho do plano da semana, condicionado a `treinos.some(statusSincronizacao
começa com 'ERRO_')`, e desabilitado com tooltip quando `atletaConectadoCanal` é falso (CA10). Segue o padrão de hook do CLAUDE.md do front (`useReenviarSincronizacao`
expõe `reenviando`, `erro`, `reenviar`), não chama o serviço gerado direto do componente.
Depois do sucesso, recarrega o plano para o chip refletir o novo estado; como o push é assíncrono,
o estado pode levar alguns segundos para mudar, então a tela mostra "Reenvio solicitado" e permite
recarregar (sem polling nesta change).

## Rollback

Sem migration e sem mudança de dados de schema. Reverter o PR do backend remove o endpoint; o PR do
front remove o botão. Treinos já reiniciados continuam válidos (`AGUARDANDO_RETRY` é um estado que o
scheduler já trata).

## Ordem de entrega

1. Backend (endpoint + reset + campo `atletaConectadoCanal`) → `develop` → `main`.
2. Front (hook, botão, chip) → `develop` → `main`, depois do cliente `src/api` portado à mão.
O backend sozinho já é útil por API; o front sem o backend não é.
