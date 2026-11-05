**Tamanho:** M · **Trilha:** Full (dois repos, campos novos no contrato de `GET /api/v1/planos/atletas/{atletaId}/semanas`, estado de edição no PlanosDialog; reusa a regra já entregue)

> **Revisão 2026-11-05:** nasceu S. Product review (Refine) e pre-mortem do Codex (NO-GO no design
> inicial) mostraram que faltavam o selo, o canal do relógio, a guarda de plano concluído, o adapter
> sem perda para o editor e o estado de edição sobrevivendo ao reload. Com isso passa a M.

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
    (boolean), `editRejection` (`NOT_PENDING`, `PAST_DAY`, `TODAY_ON_WATCH`) e
    `editedAfterApprovalAt` (timestamp). Fora dessa condição, os três campos são omitidos do JSON
    (`NON_NULL`), nunca enviados como `false`.
  - Por plano, `conexaoCanal`: o mesmo DTO do perfil (canal ativo do atleta, Garmin Connect ou
    intervals.icu), ou omitido quando não há conexão ativa.
  - Dia do atleta, `hasWatch` e conexão resolvidos **uma vez por requisição**, não por plano nem por
    treino.
- **Frontend**, no PlanosDialog:
  - `TreinoCard`: lápis "Editar" quando `editable === true`; cadeado com o mesmo texto da aba Plano
    quando `editable === false`; nada quando o campo não vem. Selo "Editado após aprovação" quando
    `editedAfterApprovalAt` existe.
  - O lápis abre o mesmo `TreinoEditDialog` da aba Plano, com aviso de plano aprovado, motivo
    opcional (Dor/lesão, Agenda, Carga, Outro) e o mesmo PATCH
    (`CoachPlanoReviewService.editarTreino`), levando `editReason`.
  - Aviso do canal: com `conexaoCanal`, cita o canal e o botão é "Salvar e reenviar". Sem
    `conexaoCanal` confirmado no payload, texto neutro: "Se o atleta usa relógio, a versão nova será
    reenviada." O texto "A mudança aparece só no app" **não** é usado nesta superfície.
  - Adapter sem perda da lista (`TreinoPlanejado`) para o editor (`TreinoPlanejadoDto`): duração
    numérica para ISO, enums de etapa objeto para string, preservando observações, TSS, alvos de
    etapa, `alvoPrimario` e blocos de repetição.
  - O alvo da edição (`atletaId`, `planoId`, `treinoId`) é capturado ao abrir; o estado do editor
    fica fora do painel que recarrega; respostas atrasadas de outro atleta/semana são descartadas.
    Erro do PATCH mantém o editor aberto com a mensagem; PATCH ok seguido de falha no reload mostra
    "Treino salvo; não foi possível atualizar a lista" e não reabre o editor.
- **Fora de escopo:** tudo que já era non-goal em `coach-editar-treino-aprovado` (adicionar,
  excluir ou mover treino; notificar o atleta; histórico de edições); editar plano em revisão por
  este dialog (continua na tela de Revisão de planos, que já é non-goal da change anterior); mudar o
  layout do `TreinoCard` além de lápis, cadeado e selo; registrar a superfície de origem da edição
  (coluna `source`), ver Métrica.

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
- Dado treino editado após a aprovação, então `editedAfterApprovalAt` vem preenchido.
- Dado um plano `AGUARDANDO_REVISAO`, ou um plano `APROVADO` com `status = CONCLUIDO`, então
  `editable`, `editRejection` e `editedAfterApprovalAt` não aparecem no JSON dos treinos.
- Dado atleta com conexão Garmin ativa, então cada plano traz `conexaoCanal` com o canal; com
  conexão revogada ou sem conexão, `conexaoCanal` não aparece.
- Dado `ROLE_ATLETA` lendo o próprio plano (`GET /atletas/{id}/plano`), então nenhum dos campos novos
  aparece (teste de regressão).
- Dado um treino de outro tenant, então o endpoint continua sem acesso como hoje.
- Dadas três semanas aprovadas em andamento com quantidades diferentes de treinos, então o overhead
  de queries desta change é constante por requisição (medido com contexto de persistência limpo,
  separado das queries que o mapper já faz).

Frontend:
- Dado treino `editable: true`, quando o treinador clica no lápis, muda só a duração e salva, então o
  PATCH leva `planoId` e `treinoId` capturados na abertura e todos os outros campos do treino
  inalterados.
- Dado o editor aberto, quando a lista recarrega em segundo plano ou o treinador troca de semana,
  então o editor continua aberto com as edições e salva no treino original.
- Dado atleta com `conexaoCanal` Garmin, então o aviso cita Garmin Connect e o botão é "Salvar e
  reenviar"; sem `conexaoCanal`, o aviso é o texto neutro.
- Dado o editor aberto pelo PlanosDialog, então o seletor de motivo está presente e `editReason` vai
  no PATCH.
- Dado treino `TODAY_ON_WATCH`, então o cadeado mostra o mesmo texto da aba Plano.
- Dado treino sem `editable` no payload, então o card não mostra lápis nem cadeado.
- Dado erro 422/409 no PATCH, então o editor continua aberto com a mensagem do backend; dado PATCH ok
  e falha no reload, então aparece "Treino salvo; não foi possível atualizar a lista".

## Métrica de sucesso

Uso e qualidade, sem coluna nova: nos 14 dias após o deploy em produção, ao menos uma edição
pós-aprovação feita pelo PlanosDialog em ao menos uma assessoria (log `Treino editado após
aprovação` com o `treinoId`, cruzado com o acesso ao endpoint de semanas na mesma sessão), e taxa de
422 no PATCH não maior que a das duas semanas anteriores. Comparar superfícies exigiria registrar a
origem da edição (`source`), deixado fora de escopo; se a comparação virar pergunta de produto,
abrir change própria.

## Open Questions & Assumptions

- **Premissa:** o PATCH (`/coach/planos/{planoId}/treinos/{treinoId}`) é a autoridade; o `editable`
  da listagem é só para o lápis, como no perfil.
- **Premissa:** o DTO `conexaoCanal` do perfil pode ser reusado na listagem, mantendo a mesma regra
  de "conexão ativa".
- **Decidido:** canal desconhecido usa texto neutro; nunca "só no app" nesta superfície.
- **Decidido:** sem coluna `source`; métrica fica em uso e taxa de 422.
- **Mapeado:** superfícies que mostram treino de plano aprovado: aba Plano (perfil e Caixa de
  entrada, com lápis), PlanosDialog (esta change), tela de Revisão de planos (só plano em revisão,
  non-goal), Home e Plano do atleta (não editam por definição). Não há uma quarta superfície do
  treinador.
