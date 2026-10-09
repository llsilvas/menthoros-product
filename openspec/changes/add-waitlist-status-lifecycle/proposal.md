**Tamanho:** M · **Trilha:** Full

> Full porque toca schema (migration aditiva em `tb_waitlist`) e insere lógica nova em dois fluxos
> existentes com pilha de compensação (`FoundingInviteServiceImpl.invite`,
> `CoachSignupServiceImpl.consumirConvite`/`reabrirConvite`) — qualquer erro na simetria
> commit/rollback vira um lead com estado inconsistente.

## Why

`instagram-conversao-specs-backend.md` tem o BE-02 bloqueado desde o início da série: "não há como
medir de onde vem cada lead nem em que etapa ele está". `expand-waitlist-access-contract` (BE-01)
já resolveu a parte de **origem/qualificação** (`watchBrand`, `segment` derivado). Falta a parte de
**etapa**: hoje nada no `Waitlist` registra que um convite foi enviado ou que a pessoa já criou a
assessoria — para saber isso é preciso cruzar com `tb_founding_invite` manualmente (o que
`WaitlistFunnelServiceImpl` já faz, mas só para o agregado do funil, não por lead).

## What Changes

Somente `apps/menthoros-backend`. Migration V102, aditiva.

### 1. Status derivado de timestamps, não um enum persistido

A entidade vizinha `FoundingInvite` já documenta essa escolha explicitamente: "o estado é derivado
das datas, sem enum" (`FoundingInvite`, JavaDoc da classe). Em vez de um enum `status` armazenado
(que poderia divergir das datas que efetivamente dirigem a transição), `Waitlist` ganha três
colunas nullable — `invitedAt`, `activatedAt`, `discardedAt` — e um método
`getStatus()` que deriva `WaitlistStatus` (`NEW`/`INVITED`/`ACTIVE`/`DISCARDED`) a partir delas,
mesmo padrão de `WaitlistSegment.derivar(...)` (BE-01) e de `FoundingInvite.isActive(...)`.

**Não existe `QUALIFIED` como status.** A spec original tinha `QUALIFIED` como um dos valores do
enum de status, mas isso já é o papel do `segment` derivado em BE-01
(`QUALIFIED`/`OTHER_BRAND`/`ATLETA`) — duplicar a informação em dois campos é exatamente o tipo de
estado redundante que este desenho evita. `status` responde "em que etapa do funil o lead está"
(`NEW→INVITED→ACTIVE`, ou `DISCARDED`); `segment` responde "que tipo de lead é este". São eixos
ortogonais.

### 2. `assessoriaId` — referência solta para a assessoria criada

Campo `UUID` nullable, sem FK (mesmo padrão de `FoundingInvite.assessoriaId`, que também não tem
constraint). Preenchido quando o lead converte.

### 3. Transições automáticas, sem endpoint novo

- **`NEW` → `INVITED`**: em `FoundingInviteServiceImpl.invite()`, depois que o e-mail do convite sai
  com sucesso (mesmo ponto onde `convite.setSentAt(...)` já acontece) — `Waitlist.invitedAt` é
  carimbado. Se o SMTP falhar, o método já lança antes de chegar lá (ver JavaDoc de `invite()`), e
  o lead continua `NEW`; o reenvio tenta de novo.
- **`INVITED` → `ACTIVE`**: em `CoachSignupServiceImpl.consumirConvite(invite, assessoriaId)` —
  `Waitlist.activatedAt` e `assessoriaId` são carimbados, buscando o lead por
  `invite.getWaitlistId()`. Simetricamente, `reabrirConvite(invite)` (a compensação que desfaz
  `consumirConvite` se um passo posterior falhar) limpa os dois campos de volta — mesma disciplina
  de pilha LIFO que o resto do método já usa.

### 4. Non-Goals explícitos (ver seção própria)

Exclusão LGPD a pedido e qualquer endpoint para marcar `DISCARDED` manualmente ficam fora — ver
Non-Goals.

## Non-Goals

- **Endpoint de exclusão LGPD** — a spec original pede "endpoint ou rotina para excluir um lead a
  pedido". Levantamento no código (ver design.md) não achou nenhum precedente de hard-delete vs.
  anonimização para registros pré-signup no projeto — essa é uma decisão de produto/compliance
  (reter agregado para métricas? anonimizar e manter linha?), não uma lacuna de implementação.
  Fica para uma change própria, com a decisão confirmada antes de codar.
- **Endpoint para marcar `DISCARDED` manualmente** — a coluna/estado existem no modelo (uso
  futuro), mas nenhuma rota os seta nesta change. Quando a exclusão LGPD for desenhada, ela pode
  reaproveitar `discardedAt` como soft-delete em vez de hard-delete — decisão fica junto daquela
  change.
- **Backfill de leads já convertidos antes desta change** — `FoundingInvite` já tem
  `convertedAt`/`assessoriaId` para quem converteu no passado; não corremos um script para copiar
  esse histórico para as novas colunas de `Waitlist`. Se o funil histórico por status vier a ser
  necessário, é um `UPDATE` pontual, não parte desta change.
- **Expor `status` na resposta de `POST /api/v1/waitlist`** — o status de um lead recém-criado é
  sempre `NEW`; não há valor em devolver isso na resposta de criação. `status` fica disponível só
  para leitura administrativa (se/quando um endpoint de listagem/funil por lead for desenhado).

## Critérios de aceite

1. **`NEW` → `INVITED` automático** — Given um lead sem convite, When
   `FoundingInviteServiceImpl.invite()` roda com sucesso (e-mail enviado), Then
   `Waitlist.invitedAt` é carimbado e `getStatus()` retorna `INVITED`.
2. **Falha no envio não avança o status** — Given o `EmailSender` lança ao enviar o convite, When
   `invite()` propaga a exceção, Then `Waitlist.invitedAt` permanece `null` (`status` continua
   `NEW`).
3. **`INVITED` → `ACTIVE` automático** — Given um convite sendo consumido em
   `CoachSignupServiceImpl.cadastrar()`, When o cadastro chega ao passo `ACTIVE`, Then
   `Waitlist.activatedAt` e `assessoriaId` são carimbados e `getStatus()` retorna `ACTIVE`.
4. **Compensação simétrica** — Given `consumirConvite` já rodou e um passo posterior falha, When a
   pilha de compensação chama `reabrirConvite`, Then `Waitlist.activatedAt`/`assessoriaId` voltam a
   `null` (`status` volta a `INVITED`).
5. **Regressão** — `./mvnw clean verify` sem falhas nos testes existentes de
   `FoundingInviteServiceImpl` e `CoachSignupServiceImpl`.

## Métrica de sucesso

Proxy mecânico: os 4 critérios acima, cobertos por teste. Métrica de produto: uma consulta direta
em `tb_waitlist` responde "quantos leads estão em cada etapa" sem precisar cruzar com
`tb_founding_invite` à mão — insumo direto para uma futura tela de funil por lead individual
(hoje `WaitlistFunnelServiceImpl` só agrega por UTM).

## Open Questions & Assumptions

- **Decisão registrada:** status derivado de timestamps, não enum persistido — segue o precedente
  já estabelecido por `FoundingInvite` no mesmo domínio, evita duas fontes de verdade.
- **Decisão registrada:** `QUALIFIED` não é um status — já é o `segment` derivado de BE-01.
- **Premissa:** a branch desta change parte de `develop` fresco (migration `V102`), não da branch
  ainda não mergeada de `expand-waitlist-access-contract` (`V101`) — as colunas novas aqui
  (`invitedAt`/`activatedAt`/`discardedAt`/`assessoriaId`) não dependem de nenhum campo de BE-01.
  Se BE-01 mergear primeiro, sem conflito; se esta mergear primeiro, BE-01 só precisa confirmar que
  `V101` ainda está livre (está, nenhuma outra change reivindicou o número).
- **Aberto:** se/quando a exclusão LGPD for desenhada, decidir hard-delete vs. soft-delete via
  `discardedAt` — não resolvido aqui de propósito (ver Non-Goals).
