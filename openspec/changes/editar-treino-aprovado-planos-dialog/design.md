## Contexto

A regra de editabilidade já existe e é única: `ApprovedWorkoutEditPolicy.avaliar(treino, hoje,
hasWatch)`, com `hoje` de `AtletaHojeResolver.hojeDe(atleta)` e `hasWatch` de
`PostApprovalEditCoordinator.hasWatch(atletaId, tenantId)` (conta conexão ativa **ou revogada**, de
propósito: conexão caída não tira o treino antigo do relógio). Hoje ela é aplicada ao perfil por um
método privado, `CoachAthleteProfileServiceImpl.recusaDeEdicao(plano, atleta, tenantId)`, que devolve
`Optional.empty()` também para plano não aprovado.

O PlanosDialog lê `GET /api/v1/planos/atletas/{atletaId}/semanas` →
`PlanoServiceImpl.listarSemanasDoAtleta` → `montarOutputDto`, que também serve
`buscarPlanoPorAtleta` (atleta). `findAtivosPorAtleta` pode devolver mais de uma semana em andamento;
a unicidade é só por atleta e semana. `status` e `reviewStatus` são campos independentes: um plano
pode estar `APROVADO` e `CONCLUIDO`.

## Decisões

**D1. Contexto de edição resolvido uma vez por requisição.** Um helper em `services/helper` (ex.:
`ApprovedWorkoutEditContext`) recebe atleta e tenant e resolve, uma vez, `hoje` e a integração do
atleta com **uma** chamada a
`integracaoExternaRepository.findFirstByAtletaIdAndPlataformaInAndTenantIdOrderByAtivoDescAtualizadoEmDesc`
— a mesma query de `PostApprovalEditCoordinator.hasWatch` e de
`CoachAthleteProfileServiceImpl.resolverConexaoCanal`. Dela saem `hasWatch` (presente, ativa ou
revogada) e o `ConexaoCanalDto` (mesmo mapeamento do perfil, movido para o helper). Ele expõe
`avaliar(plano, treino)`, que devolve "não se aplica" (plano não `APROVADO` ou `CONCLUIDO`),
"editável" ou a recusa. "Não se aplica" é distinto de "editável": o retorno não é
`Optional<EditRejection>`.

O perfil passa a usar o mesmo helper sem mudar o JSON: plano em revisão continua com
`editable = true` e `editRejection = null`, que é o que `recusaDeEdicao` devolve hoje (o front trata
revisão por `isAguardando`). O `conexaoCanal` do perfil passa a vir do helper, com o mesmo
valor. A guarda de `CONCLUIDO` vale só para a listagem: para não mudar o perfil, o helper expõe
também a recusa crua da policy (`recusa(treino)`, sem olhar o plano), e o perfil continua chamando
"revisão → editável; aprovado → policy", exatamente como `recusaDeEdicao` faz hoje. Testes explícitos
do perfil em `AGUARDANDO_REVISAO` e em `APROVADO` + `CONCLUIDO` fixam o comportamento atual.

**D2. Enriquecimento só na listagem do coach.** `listarSemanasDoAtleta` aplica o contexto de D1 depois
de `montarOutputDto`, via `toBuilder`. `buscarPlanoPorAtleta` não recebe o contexto e continua
idêntico; teste de regressão garante que o JSON do atleta não ganha os campos.

**D3. Campos.** No DTO de treino: `editable` (`Boolean`), `editRejection` (`String`, nome do enum),
`editedAfterApprovalAt` (`Instant`), todos `null` por padrão e omitidos pelo `NON_NULL` já usado no
DTO. No DTO do plano: `conexaoCanal` do tipo `AtletaPerfilCoachOutputDto.ConexaoCanalDto` (aninhado,
sem extrair; o schema OpenAPI já existe com esse nome). O MapStruct ignora os três campos de treino
e `conexaoCanal` (`@Mapping(target = ..., ignore = true)`), para não vazar no caminho do atleta.

O enriquecimento percorre a entidade `PlanoSemanal` já carregada em `listarSemanasDoAtleta` e monta
um `Map<UUID, TreinoPlanejado>` por plano; cada `TreinoPlanejadoOutputDto` do DTO mapeado é casado
pelo `id` e reconstruído com `toBuilder` (`editable`/`editRejection` só se não `CONCLUIDO`;
`editedAfterApprovalAt` de `TreinoPlanejado.getEditedAfterApprovalAt()` sempre que o plano é
`APROVADO`). Treino do DTO sem par na entidade fica como veio (não deve ocorrer; sem exceção).

**D4. Adapter sem perda no front.** Função pura `toEditorTreino(TreinoPlanejado):
TreinoPlanejadoDto` em `src/components/features/planos/`, coberta por testes com fixtures do JSON
real da listagem:

- Duração: a listagem manda `duracaoMin` como texto `MM:SS` ou `HH:MM:SS` (`TreinoMapper.durationToString`);
  o editor só entende ISO em minutos (`parseDuracaoMinutos` aceita `PT#H#M`). Converte para
  `PT{h}H{m}M`, arredondando segundos ao minuto mais próximo (segundos ≠ 0 são raros na duração do
  treino; suporte real fica para `add-etapa-duracao-segundos`). Texto inválido → `undefined` (o
  editor já trata ausência).
- Enums de etapa (`{ value, label }`) → `value`.
- Preserva observação, `tssPlanejado`, `zonaAlvo`, `percepcaoEsforcoEsperada`, alvos de etapa
  (`fcAlvoEtapa`, `ritmoAlvo`), `alvoPrimario`, `descricaoEtapa`, `blocoId`/`blocoRepeticoes`.
  `alvoPrimario` entra no tipo `EtapaTreino` de `src/types/TreinoPlanejado.ts`.
- Sem casts para `any`. O `toDialogTreino` do `CurrentWeekPlan` fica como está (fora de escopo).

O PATCH do editor já é diff (`TreinoEditDialog` só põe no patch o que mudou), então "sem perda"
significa: abrir e salvar mudando só a duração não envia observação, TSS, tipo nem zona; as etapas
só vão se o editor as considerar mudadas. Valores derivados que **podem** mudar no servidor: TSS,
recalculado por `TreinoPlanejadoServiceImpl.recalcularTssSeNecessario` quando a duração muda e o TSS
não veio no patch (regra existente). Limitação herdada e fora de escopo: `itensFromEtapas` agrupa
repetições sem olhar a descrição; o teste do adapter fixa o comportamento atual com um bloco de
descrições iguais e registra o caso de descrições diferentes como limitação conhecida.

**D5. Estado do editor fora do painel; reload com resultado.** O `PlanosDialog` (não o
`PlanoSemanaPanel`) guarda `{ atletaId, planoId, treinoId, treino }` capturado ao abrir e renderiza
o `TreinoEditDialog`. O painel só emite `onEditar(treino, planoId)`.

A proteção contra resposta obsoleta fica no dono do estado, `usePlanoSemanal.fetchPlanosPorAtleta`:
um `useRef` com contador de requisição; só a última requisição grava `planos`, `error` e `loading`
(as anteriores retornam sem tocar o estado). `fetchPlanosPorAtleta` passa a devolver
`Promise<boolean>` (`true` = lista gravada, `false` = falha ou obsoleta), mantendo o `setError`
atual para os outros consumidores (que ignoram o retorno). O handler de salvar:

- PATCH falha → editor aberto, mensagem do backend (409/422) ou genérica, mesmo
  `mensagemDeErroAoSalvar` da aba Plano.
- PATCH ok → fecha o editor e recarrega; reload `false` → aviso "Treino salvo; não foi possível
  atualizar a lista".

**D6. Aviso de canal.** O `PlanosDialog` deriva o canal com `buildWatchChannelFromConexao`
(`ativo` obrigatório) do plano do treino. Canal → aviso com canal e "Salvar e reenviar". Sem canal
(revogada ou ausente) → texto neutro. A prop muda de `aviso?: { canal: WatchChannel | null }` para
aceitar também `canal: 'DESCONHECIDO'` (ou `aviso.neutro: true`, o que der o menor diff no
componente): `null` continua sendo "só no app" para a aba Plano, sem mudar aquele caminho; o
PlanosDialog nunca passa `null`. Teste de regressão da aba Plano com `canal: null`.

**D7. Ciclo de vida do editor.** O `PlanosDialog` é uma instância reusada para todos os atletas
(`planosDialog.tsx:110`). O effect que já reseta geração ao fechar ou trocar de atleta também zera
o estado do editor (alvo, `saveErrorMessage`, aviso pós-reload). PATCH em voo quando o dialog fecha
ou troca de atleta: o resultado é ignorado se o `atletaId` capturado no alvo não for mais o atual
(nem mensagem, nem reload); o PATCH em si não é cancelado (o backend é a autoridade e a edição vale).
`TreinoEditDialog` recebe `key={treinoId}` para não carregar estado interno de um treino para outro.

## Riscos e mitigações

- **N+1 / overhead:** D1 resolve tudo uma vez por requisição; teste com três semanas aprovadas e
  números diferentes de treinos, contexto de persistência limpo, separando o overhead novo.
- **Divergência lápis × PATCH:** mesma policy (D1); o PATCH continua a autoridade e o erro aparece no
  editor.
- **Plano concluído editável:** guarda explícita em D1 e teste de plano `APROVADO` + `CONCLUIDO`.
- **Vazamento ao atleta:** D2/D3 e teste de regressão do JSON do atleta.
- **Perda de dados ao editar:** D4 com teste "muda só a duração, o resto não muda".
- **Edição no treino errado:** D5 captura o alvo e descarta respostas atrasadas no hook; D7 fecha o
  editor ao trocar de atleta.
- **Promessa falsa de entrega:** D6, sem "só no app" quando o canal é desconhecido ou revogado.
- **Lápis defasado (lista velha):** sem monitoramento novo; o PATCH recusa com 422 e a mensagem
  aparece no editor. A taxa de 422 da Métrica é o sinal.
- **Perfil muda sem querer ao trocar `recusaDeEdicao` pelo helper:** testes atuais do perfil verdes +
  teste novo de plano em revisão.

## Rollback

Reverter o PR do front remove lápis, cadeado e selo. Reverter o backend remove os campos, e o front
volta a não mostrar nada (campos ausentes). Sem migration. Edições feitas pelo dialog enquanto
esteve no ar continuam válidas (mesmo PATCH da aba Plano) e o selo segue visível na aba Plano.
Reverter só o backend com o front no ar é seguro: sem `editable`, o card não mostra lápis.
