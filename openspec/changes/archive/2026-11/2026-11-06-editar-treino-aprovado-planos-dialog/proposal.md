**Tamanho:** M · **Trilha:** Full (dois repos, campos novos no contrato de `GET /api/v1/planos/atletas/{atletaId}/semanas`, estado de edição no PlanosDialog; reusa a regra já entregue)

> **Revisão 2026-11-05:** nasceu S. Product review (Refine) e pre-mortem do Codex (NO-GO no design
> inicial) mostraram que faltavam o selo, o canal do relógio, a guarda de plano concluído, o adapter
> sem perda para o editor e o estado de edição sobrevivendo ao reload. Com isso passa a M.
>
> **Revisão DoR 2026-11-05 (`/implement init`):** spec-reviewer e Codex deram NOT READY sem Critical.
> Conferido no código e corrigido: duração da listagem é texto `MM:SS`/`HH:MM:SS`, não número
> (`TreinoMapper.java:82`); o `conexaoCanal` do perfil inclui conexão revogada com `ativo: false`
> (`CoachAthleteProfileServiceImpl.java:230`), então a listagem segue a mesma semântica em vez de
> omitir; `fetchPlanosPorAtleta` engole o erro (`usePlanoSemanal.ts:28`), então o reload precisa
> devolver sucesso/falha e descartar resposta obsoleta no próprio hook; o PATCH é diff e o backend
> recalcula TSS ao mudar a duração (`TreinoPlanejadoServiceImpl.java:501`); o selo continua em plano
> concluído; ciclo de vida do editor ao fechar o dialog ou trocar de atleta definido (D7).

## Dependências

- `coach-editar-treino-aprovado` (backend #221, front #194), em `develop` desde 2026-11-05: policy,
  PATCH com `editReason`, `TreinoEditDialog` com `aviso`, rótulos do cadeado em `watchChannel.ts`.

## Why

`coach-editar-treino-aprovado` (PRs backend #221 e front #194, em `develop` desde 2026-11-05) deixou o
treinador editar treino pendente de plano aprovado, mas só na aba Plano (`CurrentWeekPlan`, no
perfil e na Caixa de entrada). O treinador também abre os planos pela lista de Atletas, no
**PlanosDialog** (`PlanoSemanaPanel` > `TreinoCard`), e ali só tem "Detalhes" e "Realizado". Na
validação em develop, o treinador procurou a edição primeiro nesse dialog e concluiu que a feature
não existia.

O PlanosDialog não estava nos non-goals da change anterior: ele simplesmente não foi considerado.

## What Changes

- **Backend**, só na listagem do coach (`listarSemanasDoAtleta`); o caminho do atleta
  (`buscarPlanoPorAtleta`) não muda:
  - Por treino, em plano `reviewStatus = APROVADO` **e** `status != CONCLUIDO`: `editable`
    (boolean) e `editRejection` (`NOT_PENDING`, `PAST_DAY`, `TODAY_ON_WATCH`). Fora dessa condição,
    os dois campos são omitidos do JSON (`NON_NULL`), nunca enviados como `false`.
  - Por treino, em plano `reviewStatus = APROVADO` (concluído ou não): `editedAfterApprovalAt`
    (timestamp) quando o treino foi editado após a aprovação. O selo é histórico e não depende de o
    treino ainda ser editável.
  - Por plano, `conexaoCanal`: o mesmo DTO e a mesma resolução do perfil
    (`AtletaPerfilCoachOutputDto.ConexaoCanalDto`: conexão Garmin ou intervals.icu mais recente,
    ativa primeiro, com `ativo: false` quando revogada), ou omitido quando o atleta nunca conectou.
  - Dia do atleta, `hasWatch` e conexão resolvidos **uma vez por requisição**, não por plano nem por
    treino.
- **Frontend**, no PlanosDialog:
  - `TreinoCard`: lápis "Editar" quando `editable === true`; cadeado com o mesmo texto da aba Plano
    quando `editable === false`; nada quando o campo não vem. Selo "Editado após aprovação" quando
    `editedAfterApprovalAt` existe.
  - O lápis abre o mesmo `TreinoEditDialog` da aba Plano, com aviso de plano aprovado, motivo
    opcional (Dor/lesão, Agenda, Carga, Outro) e o mesmo PATCH
    (`CoachPlanoReviewService.editarTreino`), levando `editReason`.
  - Aviso do canal: com `conexaoCanal.ativo === true`, cita o canal e o botão é "Salvar e
    reenviar" (mesmo `buildWatchChannelFromConexao` do perfil). Com conexão revogada ou sem
    `conexaoCanal`, texto neutro: "Se o atleta usa relógio, a versão nova será reenviada." O texto
    "A mudança aparece só no app" **não** é usado nesta superfície.
  - Adapter sem perda da lista (`TreinoPlanejado`) para o editor (`TreinoPlanejadoDto`): duração
    `MM:SS`/`HH:MM:SS` para ISO em minutos, enums de etapa objeto para string, preservando
    observações, TSS, alvos de etapa, `alvoPrimario` e blocos de repetição.
  - O alvo da edição (`atletaId`, `planoId`, `treinoId`) é capturado ao abrir; o estado do editor
    fica fora do painel que recarrega; respostas atrasadas são descartadas no hook dono da lista.
    Erro do PATCH mantém o editor aberto com a mensagem; PATCH ok seguido de falha no reload mostra
    "Treino salvo; não foi possível atualizar a lista" e não reabre o editor. Fechar o PlanosDialog
    ou trocar de atleta fecha o editor e descarta a edição não salva (D7).
- **Fora de escopo:** tudo que já era non-goal em `coach-editar-treino-aprovado` (adicionar,
  excluir ou mover treino; notificar o atleta; histórico de edições); editar plano em revisão por
  este dialog (continua na tela de Revisão de planos, que já é non-goal da change anterior); mudar o
  layout do `TreinoCard` além de lápis, cadeado e selo; registrar a superfície de origem da edição
  (coluna `source`), ver Métrica; segundos na duração do treino (ver `add-etapa-duracao-segundos`);
  a detecção de série do editor (`itensFromEtapas`), que agrupa repetições ignorando a descrição e,
  ao salvar o bloco, replica a descrição da primeira janela. É comportamento já existente na aba
  Plano; esta change não piora nem corrige, e o teste do adapter fixa o caso.

## Capabilities

### New Capabilities
<!-- Nenhuma. -->

### Modified Capabilities
<!-- Comportamento já descrito por coach-editar-treino-aprovado; esta change estende a superfície. -->

## Critérios de aceite

Backend:
- Dado um plano `APROVADO` em andamento com treino pendente de amanhã, quando o treinador lista as
  semanas do atleta, então esse treino vem com `editable: true` e sem `editRejection`.
- Dado o mesmo plano, então treino de ontem vem `editable: false, editRejection: "PAST_DAY"`; treino
  realizado vem `"NOT_PENDING"`; treino de hoje de atleta com relógio vem `"TODAY_ON_WATCH"`.
- Dado treino editado após a aprovação, então `editedAfterApprovalAt` vem preenchido, também
  depois de o plano ficar `CONCLUIDO`.
- Dado um plano `AGUARDANDO_REVISAO`, então `editable`, `editRejection` e `editedAfterApprovalAt`
  não aparecem no JSON dos treinos. Dado um plano `APROVADO` com `status = CONCLUIDO`, então
  `editable` e `editRejection` não aparecem.
- Dado atleta com conexão Garmin ativa, então cada plano traz `conexaoCanal` com
  `plataforma: GARMIN, ativo: true`; com conexão revogada, `ativo: false`; sem nenhuma conexão,
  `conexaoCanal` não aparece. O valor é igual ao `conexaoCanal` do perfil do mesmo atleta.
- Dado atleta com conexão revogada e treino de hoje, então o treino vem
  `editRejection: "TODAY_ON_WATCH"` (a conexão caída não tira o treino do relógio), e
  `conexaoCanal.ativo` é `false`.
- Dado o perfil do atleta com plano `AGUARDANDO_REVISAO`, então os treinos continuam com
  `editable: true`, como hoje (o perfil não muda de comportamento com o helper novo).
- Dado `ROLE_ATLETA` lendo o próprio plano (`GET /atletas/{id}/plano`), então nenhum dos campos novos
  aparece (teste de regressão).
- Dado um treino de outro tenant, então o endpoint continua sem acesso como hoje.
- Dadas três semanas aprovadas em andamento com quantidades diferentes de treinos, então o overhead
  de queries desta change é constante por requisição (medido com contexto de persistência limpo,
  separado das queries que o mapper já faz).

Frontend:
- Dado treino `editable: true` com observação, TSS, etapas com alvos e `alvoPrimario` (fixture com
  o JSON real da listagem, duração `"01:05:00"`), quando o treinador clica no lápis, então o editor
  abre com 65 min e todos esses valores; quando muda só a duração e salva, então o PATCH vai para
  `planoId`/`treinoId` capturados na abertura e não contém observação, TSS, tipo nem zona (o PATCH
  é diff). O TSS pode mudar no servidor pela regra já existente de recálculo por duração.
- Dado treino com duração `"45:30"` (segundos ≠ 0), então o editor abre com 46 min (arredonda;
  segundos ficam para `add-etapa-duracao-segundos`) e o PATCH só leva duração se o treinador mexer
  nela.
- Dado o editor aberto, quando a lista recarrega em segundo plano ou o treinador troca de semana,
  então o editor continua aberto com as edições e salva no treino original.
- Dado o editor aberto, quando o treinador fecha o PlanosDialog ou abre o de outro atleta, então o
  editor fecha, a edição não salva é descartada e nenhuma mensagem do atleta anterior aparece.
- Dado atleta com `conexaoCanal` Garmin `ativo: true`, então o aviso cita Garmin Connect e o botão é
  "Salvar e reenviar"; com `ativo: false` ou sem `conexaoCanal`, o aviso é o texto neutro e o botão
  é "Salvar".
- Dado treino de plano `CONCLUIDO` com `editedAfterApprovalAt`, então o card mostra o selo e não
  mostra lápis nem cadeado.
- Dado o editor aberto pelo PlanosDialog, então o seletor de motivo está presente e `editReason` vai
  no PATCH.
- Dado treino `TODAY_ON_WATCH`, então o cadeado mostra o mesmo texto da aba Plano.
- Dado treino sem `editable` no payload, então o card não mostra lápis nem cadeado.
- Dado erro 422/409 no PATCH, então o editor continua aberto com a mensagem do backend; dado PATCH ok
  e falha no reload, então aparece "Treino salvo; não foi possível atualizar a lista".

## Métrica de sucesso

Métrica **aproximada, assumida como tal**: sem coluna `source`, o backend não sabe de qual
superfície veio a edição. Nos 14 dias após o deploy em produção:

- Uso (proxy): número de edições pós-aprovação (log `Treino editado após aprovação`) por semana,
  comparado às duas semanas anteriores ao deploy. Alvo: crescer. Atribuição ao PlanosDialog só
  indireta (edição precedida de `GET /planos/atletas/{id}/semanas` do mesmo usuário em até 10 min).
- Qualidade: taxa de 422 no PATCH não maior que a das duas semanas anteriores.
- Validação qualitativa: o treinador que não achou a edição confirma que agora acha pelo dialog.

Medir por superfície de forma confiável exige `source`, fora de escopo; se virar pergunta de
produto, abrir change própria.

## Open Questions & Assumptions

- **Premissa:** o PATCH (`/coach/planos/{planoId}/treinos/{treinoId}`) é a autoridade; o `editable`
  da listagem é só para o lápis, como no perfil.
- **Decidido:** `conexaoCanal` reusa o tipo aninhado `AtletaPerfilCoachOutputDto.ConexaoCanalDto`
  e a mesma resolução do perfil (inclui revogada com `ativo: false`); sem extrair o tipo. O front
  usa tipos manuais (`src/types`, `src/services/PlanoSemanasService.ts`); nada de cliente gerado a
  regenerar.
- **Decidido:** canal desconhecido ou revogado usa texto neutro; nunca "só no app" nesta superfície.
- **Decidido:** o selo "Editado após aprovação" aparece também em plano concluído.
- **Decidido:** sem coluna `source`; métrica fica em uso e taxa de 422.
- **Mapeado:** superfícies que mostram treino de plano aprovado: aba Plano (perfil e Caixa de
  entrada, com lápis), PlanosDialog (esta change), tela de Revisão de planos (só plano em revisão,
  non-goal), Home e Plano do atleta (não editam por definição). Não há uma quarta superfície do
  treinador.
