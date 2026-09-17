# fix-plano-volume-nao-atualiza-ao-editar-treino — volume do plano fica desatualizado quando o coach edita a distância de um treino

**Tamanho:** S · **Trilha:** Fast
**Status:** proposta
**Criado:** 2026-09-17

> Origem: bug relatado em 2026-09-17 — na tela de revisão do plano semanal, o treinador altera a
> distância de um treino (direto ou reestruturando as etapas) e a distância/volume planejado do
> **plano** não reflete a mudança.

## Why

`TreinoPlanejadoServiceImpl.editarTreino()` (`apps/menthoros-backend/.../services/impl/TreinoPlanejadoServiceImpl.java:103-140`)
aplica o patch no treino e recalcula o TSS do treino, mas nunca ajusta o agregado do plano.

Compare com os dois outros fluxos que mexem em `TreinoPlanejado.distanciaKm`:

- `adicionarTreino` (`:59-91`) chama `ajustarVolumePlano(plano, salvo.getDistanciaKm(), true)` e
  `planoSemanalRepository.save(plano)` (`:86-87`).
- `excluirTreino` (`:144-168`) faz o mesmo na subtração (`:164-165`).
- `editarTreino` (`:103-140`) captura `distanciaAnterior` (`:127`, já existe — hoje só é usado para
  decidir se recalcula o TSS) mas **não chama `ajustarVolumePlano` nem salva o plano**.

`ajustarVolumePlano` (`:170-181`) é o único ponto que escreve em
`PlanoSemanal.volumePlanejadoKm`/`volumeAlvoKm` (`PlanoSemanal.java:55-62`) — um campo persistido,
separado da soma de `TreinoPlanejado.distanciaKm` dos treinos do plano. Sem essa chamada no fluxo de
edição, o campo do banco fica congelado no valor de quando o plano foi gerado/criado, e nunca mais
reflete uma distância alterada pelo coach.

### Impacto observável

O front já descobriu esse desvio e contornou em duas telas — `PlanoDetalhePanel.tsx:429-433`
("Derivado dos treinos individuais — reflete edições sem depender do campo estático do backend") e
`PlanoPendenteItem.tsx:24-27` — recalculando o volume client-side a partir da soma dos treinos. Mas
várias outras telas confiam direto em `plano.volumePlanejadoKm`/`volumeAlvoKm`, sem esse workaround,
e mostram o valor desatualizado depois de qualquer edição do coach: `AthletePlanPage.tsx:44,86`,
`WeekOverviewCard.tsx:50-51,70-71`, `buildWeekOverview.ts:78`, `planosDialog.tsx:526,613` — inclusive
telas do **atleta**, que não tem como saber que o número está errado.

O treino individual (`TreinoPlanejado.distanciaKm`) grava correto — o front já manda o total certo
no patch (`TreinoEditDialog.tsx:464`, somando as etapas). O defeito é só no agregado do plano.

## What Changes

- Em `editarTreino`, quando `treino.getDistanciaKm()` muda (comparado com `distanciaAnterior`, já
  capturada em `:127`), reajustar `plano.volumePlanejadoKm`/`volumeAlvoKm` e persistir o plano —
  reaproveitando `ajustarVolumePlano` já existente, sem mudar sua assinatura: subtrair a distância
  anterior (`adicionar=false`) e somar a nova (`adicionar=true`), na mesma transação do
  `editarTreino`. Mesma técnica que `adicionarTreino`/`excluirTreino` já usam, só que aplicada duas
  vezes (remove o valor velho, soma o novo) em vez de uma.
- Cobrir com teste que o `editarTreino` chama `planoSemanalRepository.save(plano)` e que o volume
  reflete a nova distância — hoje o teste `atualizaCamposNaoNulosESetaEditadoPeloCoach`
  (`TreinoPlanejadoServiceTest.java:691-716`) verifica só o treino, não o plano, e passaria mesmo com
  o bug presente.

### Non-goals

- Não mexer no `TreinoEditDialog.tsx` nem nos workarounds do front (`PlanoDetalhePanel.tsx`,
  `PlanoPendenteItem.tsx`) — ficam como estão; depois do fix eles passam a coincidir com o campo do
  backend, mas removê-los é decisão separada (risco de regressão se algum caso de borda ainda
  divergir).
- Não corrigir dados já persistidos incorretamente (planos com volume desatualizado hoje). Recalcular
  em massa é operação própria, fora do escopo de um fix de comportamento.
- Não tocar `aplicarEtapasPatch`/`expandirBloco` nem reaproveitar `reconciliarDistanciaComEtapas`
  (usado hoje só no pipeline de geração por IA) — o front já envia `distanciaKm` recalculado
  corretamente no patch; endurecer o backend para recalcular a partir das etapas por conta própria é
  melhoria adjacente, não o bug relatado.
- Sem migration, sem mudança de contrato de API, sem alteração no frontend.

## Critérios de aceite

**CA1 — editar distância de um treino atualiza o volume do plano**
Given um plano `AGUARDANDO_REVISAO` com `volumePlanejadoKm=10` e um treino com `distanciaKm=5`
When o coach edita o treino para `distanciaKm=8` via `PATCH`
Then `plano.volumePlanejadoKm` e `plano.volumeAlvoKm` passam a `13`, e o plano é persistido.

**CA2 — reduzir a distância também ajusta o volume (nunca abaixo de zero)**
Given um plano com `volumePlanejadoKm=10` e um treino com `distanciaKm=8`
When o coach edita o treino para `distanciaKm=3`
Then `plano.volumePlanejadoKm` passa a `5`.

**CA3 — editar campo que não é distância não mexe no volume**
Given um treino com `distanciaKm=5`
When o coach edita só a `descricao` ou `percepcaoEsforcoEsperada` (patch sem `distanciaKm`)
Then `plano.volumePlanejadoKm` permanece inalterado e `planoSemanalRepository.save(plano)` não é
chamado (evita escrita desnecessária).

**CA4 — distância nula/zero não quebra o cálculo**
Given um treino sem `distanciaKm` (null) editado para `distanciaKm=4`, ou o inverso
When o patch é aplicado
Then o volume do plano reflete corretamente o delta (nulo tratado como zero, sem `NullPointerException`).

## Métrica de sucesso

Zero divergência entre `plano.volumePlanejadoKm` e a soma de `TreinoPlanejado.distanciaKm` dos
treinos do plano, imediatamente após qualquer edição do coach na tela de revisão — verificável pelo
teste de serviço (CA1/CA2) e por inspeção manual em `develop` (editar um treino e conferir o volume
exibido nas telas do atleta, que hoje não tinham o workaround do coach).

Efeito na rotina do treinador: o número que ele vê na tela some com o que o atleta vê — hoje
divergem depois de qualquer ajuste de distância.

## Impact

- **Repositórios:** só `apps/menthoros-backend`.
- **Classe tocada:** `TreinoPlanejadoServiceImpl` (`editarTreino`), reaproveitando `ajustarVolumePlano`
  sem alterar sua assinatura.
- **API:** nenhuma mudança de contrato — o `PATCH` de treino já existe e já retorna o mesmo DTO;
  o efeito colateral extra (plano persistido) não é observável na resposta do endpoint de treino.
- **Banco:** nenhuma migration. Escreve em colunas já existentes (`volume_planejado_km`,
  `volume_alvo_km` de `tb_plano_semanal`).

## Open Questions & Assumptions

**Premissas assumidas:**
- `ajustarVolumePlano` aplicado duas vezes (subtrai o valor antigo, soma o novo) é equivalente a um
  delta puro e mantém a mesma semântica de `adicionarTreino`/`excluirTreino` — não há necessidade de
  generalizar o método para receber um delta direto.
- O front já envia `distanciaKm` recalculado corretamente no patch (confirmado na investigação:
  `TreinoEditDialog.tsx:464`), então o backend pode confiar nesse valor sem recalcular a partir das
  etapas nesta change.

**Em aberto:**
- Planos com volume já desatualizado em produção não serão corrigidos por esta change — se isso for
  necessário, é decisão de produto/operação separada (script de recálculo em massa).
