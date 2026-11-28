# Design — add-injury-clearance-flow

## Contexto

- Estado da lesão em `tb_atleta`: `tem_lesao`, `descricao_lesao`, `data_ultima_lesao`,
  `historico_lesoes`. Consumido por `InjuryPolicyResolver` (fase), skills de elegibilidade/recuperação
  e `AlertasPromptFormatter` (prompt).
- `add-injury-clearance-coach` já aplica a liberação na transição `true → false` do
  `AtletaServiceImpl.updateAtleta`.
- A fila (`CoachAttentionQueueServiceImpl.montarItem`) monta sinais por atleta com avaliadores puros
  em `CoachAttentionSignalEvaluator`; `MotivoAtencao` carrega peso e `suggestedAction`.
- Endpoints do atleta seguem o padrão `/api/v1/atletas/me/*` com `hasRole('ATLETA')` e
  `resolverAtletaIdAtual()` (`AtletaProgressController`), sem `@RequireTenant`.

## Decisões

### D1 — Estado em `tb_atleta`, trilha em `tb_injury_event`

O estado da lesão continua onde todos os consumidores já leem. A tabela nova é append-only e guarda o
que o estado não guarda: quem fez, quando, e o pedido do atleta.

```sql
CREATE TABLE IF NOT EXISTS tb_injury_event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    athlete_id UUID NOT NULL REFERENCES tb_atleta(id) ON DELETE CASCADE,
    kind VARCHAR(30) NOT NULL CHECK (kind IN
        ('REPORTED','CLEARANCE_REQUESTED','CLEARED','CLEARANCE_DECLINED','ACKNOWLEDGED')),
    author_role VARCHAR(10) NOT NULL CHECK (author_role IN ('ATHLETE','COACH')),
    author_user_id UUID NOT NULL,
    signal VARCHAR(20) CHECK (signal IN ('SEM_DOR','LIBERADO_MEDICO')),
    text VARCHAR(500),
    request_status VARCHAR(20) CHECK (request_status IN ('PENDING','CONFIRMED','DECLINED')),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_injury_event_tenant_athlete ON tb_injury_event(tenant_id, athlete_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uk_injury_event_pending
    ON tb_injury_event(athlete_id) WHERE request_status = 'PENDING';
```

`request_status` só existe em `CLEARANCE_REQUESTED`; é a única coluna que muda depois do insert
(`PENDING → CONFIRMED | DECLINED`). O índice parcial garante um pendente por atleta; um segundo
pedido com pendente aberto responde `409`.

### D2 — Sinais da fila derivados dos eventos

- `LESAO_REPORTADA`: existe `REPORTED` de autor `ATHLETE` sem `ACKNOWLEDGED`, `CLEARED` ou
  `CLEARANCE_DECLINED` posterior do coach, e `temLesao = true`.
- `LIBERACAO_SOLICITADA`: existe pedido `PENDING`.

**Episódio:** os sinais olham só os eventos depois do `CLEARED` mais recente do atleta. Assim, um
`REPORTED` de uma lesão já encerrada não contamina a fila da lesão seguinte.

Avaliadores puros (`evaluateReportedInjury`, `evaluateClearanceRequest`) recebem records, como os
outros. A query busca os eventos do episódio aberto **sem limite de idade** (pre-mortem Codex: uma
janela de 90 dias faria pendências antigas sumirem da fila sem resolução), com `tenant_id` no
`WHERE`. Sem N+1 extra além do padrão atual de `montarItem` (conferir: se o padrão já é por atleta,
seguir; se houver batch, entrar no batch).

### D3 — Liberação compartilhada

A regra de `add-injury-clearance-coach` sai de `updateAtleta` para um método package-private
(`InjuryClearanceRule.apply(Atleta, LocalDate)`, sem Spring), chamado pelos dois caminhos:
`updateAtleta` na transição e `InjuryClearanceService.confirm`. O `confirm` também grava `CLEARED` e
resolve o pendente na mesma transação. Os dois caminhos gravam a mesma auditoria: desmarcar pelo
`AtletaDialog` também grava `CLEARED` com o `user_id` do coach, com ou sem pedido, e resolve o
pendente como `CONFIRMED` se houver. Sem isso, a liberação pelo cadastro ficaria sem trilha e o
episódio não fecharia (D2).

### D4 — Reporte do atleta é seguro sem o coach

`POST /me/lesao` grava `temLesao = true` direto. Só reduz carga (fase `RECOVERY`), então não
precisa de aprovação. A semana atual não é reaberta (decisão de produto, 28/11); o coach vê o item
`CRITICA` e decide.

### D5 — Cache e consistência

`updateAtleta` faz `@CacheEvict` de `atletas`, `atletas-list` e `metadados-atleta`. Os caminhos novos
que mudam `tb_atleta` (reporte, confirmação) fazem o mesmo evict — senão a fila e o planner leem o
estado antigo.

### D6 — Erros

- `409` com `code` (`LESAO_JA_ATIVA`, `SEM_LESAO_ATIVA`, `SEM_PEDIDO_PENDENTE`): reusar a exceção com
  `code` se `add-pain-attention-signal` já tiver criado; senão criar aqui e o outro reusa.
- `404` para atleta de outro tenant (lookup por `findByIdAndTenantId`).

### D7 — Concorrência entre o diálogo do coach e o reporte do atleta

`Atleta` não tem `@Version`, e reler o atleta ao abrir o diálogo não basta: o reporte pode chegar
com o diálogo aberto. Pôr `@Version` em `Atleta` afetaria todos os escritores da entidade, um
escopo grande demais. A checagem é só onde o risco existe:

- `AtletaOutputDto` ganha `lesaoVistaEm`: o `created_at` do último evento de lesão do atleta.
- `AtletaInputDto` ganha `lesaoVistaEm` opcional; o `AtletaDialog` devolve o valor que recebeu.
- Na transição `true → false`, o serviço trava a linha do atleta (`SELECT ... FOR UPDATE` no
  `findByIdAndTenantId` desse caminho). Se houver `REPORTED` com `created_at > lesaoVistaEm`, ele
  responde `409 LESAO_REPORTADA_DEPOIS`. O reporte do atleta também trava a linha, então os dois não
  se cruzam.
- Payload sem `lesaoVistaEm` (cliente antigo): a transição segue, como hoje. É o único caso não
  coberto, e some quando o front novo sobe.

`confirm`/`decline` do coach e `requestClearance` do atleta usam a mesma trava, e o índice parcial
do pendente (D1) segura o resto.

### D8 — Onboarding concluído não escreve lesão

`concluirOnboarding` com perfil já `COMPLETO` não copia `temLesao`, `descricaoLesao`,
`dataUltimaLesao` nem `historicoLesoes`; o restante segue como hoje. `salvarRascunho` continua
aceitando os campos (o rascunho é staging), mas eles não têm efeito depois da primeira conclusão.
Sem isso, o atleta se libera sozinho salvando outro rascunho (`OnboardingServiceImpl.java:225-228,
295-298`).

## Riscos e mitigações

- **Dois escritores do mesmo estado:** D7.
- **Autoliberação pelo onboarding:** D8.
- **Pedido órfão**: lesão desmarcada por outro caminho deixa `PENDING` → D3 resolve no mesmo commit.
- **Texto clínico do atleta no prompt e retenção**: o reporte vira `descricaoLesao`, que já vai ao
  prompt; o comentário do pedido não vai (CA13). `deleteAtleta` é soft delete, então o `CASCADE`
  nunca dispara: os textos de `tb_injury_event` são anonimizados no `deleteAtleta`, no padrão do
  ledger. A cobertura do consentimento é bloqueante (proposal, Open Questions).
- **Fila inflada**: `LESAO_REPORTADA` some com ciência; `LIBERACAO_SOLICITADA` some com decisão.

## Rollback

Revert dos PRs (piloto fechado; sem flag, por decisão da revisão de produto). A tabela fica; o
`DROP` não é necessário. Linhas de `tb_atleta` alteradas por reporte ou liberação continuam
coerentes com o fluxo só-coach.
