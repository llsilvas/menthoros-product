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
`ApprovedWorkoutEditContext`) recebe atleta e tenant e resolve, uma vez, `hoje`, `hasWatch` e a
conexão ativa. Ele expõe `avaliar(plano, treino)`, que devolve "não se aplica" (plano não
`APROVADO` ou `CONCLUIDO`), "editável" ou a recusa. "Não se aplica" é distinto de "editável": o
retorno não é `Optional<EditRejection>`. O perfil passa a usar o mesmo helper, mantendo o
comportamento atual para plano em revisão (ele trata revisão por `isAguardando` no front).

**D2. Enriquecimento só na listagem do coach.** `listarSemanasDoAtleta` aplica o contexto de D1 depois
de `montarOutputDto`, via `toBuilder`. `buscarPlanoPorAtleta` não recebe o contexto e continua
idêntico; teste de regressão garante que o JSON do atleta não ganha os campos.

**D3. Campos.** No DTO de treino: `editable` (`Boolean`), `editRejection` (`String`, nome do enum),
`editedAfterApprovalAt` (`Instant`), todos `null` por padrão e omitidos pelo `NON_NULL` já usado no
DTO. No DTO do plano: `conexaoCanal`, o mesmo tipo do perfil. O MapStruct não mapeia
automaticamente `editedAfterApprovalAt` (ignorar no mapper; só o enriquecimento preenche), para não
vazar no caminho do atleta.

**D4. Adapter sem perda no front.** Função pura `toEditorTreino(TreinoPlanejado):
TreinoPlanejadoDto` em `src/components/features/planos/`, coberta por testes com payloads reais da
listagem: duração numérica → ISO; enums de etapa (`{ value, label }`) → string; preserva
observações, TSS, alvos de etapa, `alvoPrimario` e blocos de repetição. Sem casts para `any`. Se o
`toDialogTreino` do `CurrentWeekPlan` puder ser trocado por ela sem perda, fazer; senão, ficam
separados.

**D5. Estado do editor fora do painel.** O `PlanosDialog` (não o `PlanoSemanaPanel`) guarda
`{ atletaId, planoId, treinoId, treino }` capturado ao abrir e renderiza o `TreinoEditDialog`. O
painel só emite `onEditar(treino, planoId)`. O reload da lista usa um token de requisição para
descartar respostas de outro atleta/semana. O handler de salvar distingue falha do PATCH (editor
aberto, mensagem) de PATCH ok + falha no reload (editor fecha, aviso "Treino salvo; não foi
possível atualizar a lista").

**D6. Aviso de canal.** `conexaoCanal` presente → aviso com canal e "Salvar e reenviar" (mesma
prop `aviso` do `TreinoEditDialog`). Ausente → texto neutro novo, passado pela mesma prop. O
`TreinoEditDialog` ganha um terceiro estado ("desconhecido") em vez de inferir "só no app" de
`canal: null` nesta superfície.

## Riscos e mitigações

- **N+1 / overhead:** D1 resolve tudo uma vez por requisição; teste com três semanas aprovadas e
  números diferentes de treinos, contexto de persistência limpo, separando o overhead novo.
- **Divergência lápis × PATCH:** mesma policy (D1); o PATCH continua a autoridade e o erro aparece no
  editor.
- **Plano concluído editável:** guarda explícita em D1 e teste de plano `APROVADO` + `CONCLUIDO`.
- **Vazamento ao atleta:** D2/D3 e teste de regressão do JSON do atleta.
- **Perda de dados ao editar:** D4 com teste "muda só a duração, o resto não muda".
- **Edição no treino errado:** D5 captura o alvo e descarta respostas atrasadas.
- **Promessa falsa de entrega:** D6, sem "só no app" quando o canal é desconhecido.

## Rollback

Reverter o PR do front remove lápis, cadeado e selo. Reverter o backend remove os campos, e o front
volta a não mostrar nada (campos ausentes). Sem migration.
