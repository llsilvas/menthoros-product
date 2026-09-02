# Tasks — atleta-cadastra-prova

Validação por bloco: backend `./mvnw clean test` em `apps/menthoros-backend`; frontend
`npm run lint && npm run build && npm test` em `apps/menthoros-front`. Branch
`feature/atleta-cadastra-prova` nos dois repos antes de qualquer código.

## 1. Backend — domínio e derivação

- [x] 1.1 Criar `domain/planner/RacePreparationRule` (`minimoSemanas`, `distanciaNominalKm`,
      `inicioPreparacao`) com a tabela 8/10/12/16 e as faixas 7,5/15/30.
      *verify:* teste parametrizado cobre os 4 enums, os 4 limites de faixa (7,5 / 7,6 / 15 /
      15,1 / 30 / 30,1) e extremos (0,1 e 200 km); `./mvnw clean test`.
- [x] 1.1b `DistanciaProva.CUSTOMIZADA("OUTRA", "Outra", "Outra", 4)` **como último constante**, com
      comentário sobre o ordinal; casos novos nos `switch` de `PeriodizacaoPromptFormatter.resolverDistanciaKm`
      e `PlannerShadowService` (devolvem `distanciaKm`).
      *verify:* teste: `DistanciaProva.CUSTOMIZADA.ordinal() == 4` e os quatro anteriores
      inalterados; compilação dos dois `switch`; prova gravada com ordinal 2 lê `KM_21`.
- [x] 1.2 Criar `ProvaEnricher.aplicarDerivados(Prova)` e chamá-lo em `criarProva`,
      `atualizarProva` e `OnboardingServiceImpl.criarOuAtualizarProvaAlvo` antes do `save`;
      ignorar `semanasPreparacao`/`inicioPreparacao` vindos do DTO.
      *verify:* testes de service: prova 42 km em 6/dez → 16, 16/ago, 42.2; DTO com
      `semanasPreparacao = 2` é sobrescrito; teste do onboarding afirma os derivados.
- [x] 1.3 `ProvaOutputDto` ganha `preparacaoCurta` e `semanasFaltando`; mapper calcula com
      `Clock` injetado.
      *verify:* teste do mapper com data fixa: 8 semanas para maratona → `true`, 20 → `false`,
      exatamente 16 → `false`.
- [x] 1.4 Prova-alvo única em `criarProva`/`atualizarProva` (desmarca as demais via
      `findByAtletaAndProvaAlvoTrue`), devolvendo o nome da alvo anterior quando houve troca.
      *verify:* teste: A alvo, cria B alvo → A `false`; PUT em C com `provaAlvo=true` → B `false`.

## 2. Backend — autorização e CRUD do atleta

- [x] 2.1 Extrair `security/AuthenticatedAtletaResolver` do `resolverAtletaIdAtual` de
      `AtletaProgressServiceImpl` e `OnboardingServiceImpl`; os dois passam a usá-lo.
      *verify:* testes existentes desses dois services continuam verdes sem alteração.
- [x] 2.2 `ProvaServiceImpl.resolveAtletaComPosse(atletaId)`: para principal `ATLETA` sem
      `TECNICO`/`ADMIN`, `atletaId` ≠ atleta do JWT → exceção de não encontrado (`404`). Usar em
      listar, buscar, criar, atualizar, deletar/cancelar.
      *verify:* teste de integração por verbo com dois atletas do mesmo tenant: dono `200/201/204`,
      outro `404`; `TECNICO` do tenant `200`.
- [x] 2.3 `ProvaController`: `@PreAuthorize("hasAnyRole('ATLETA','TECNICO','ADMIN')")` em
      `GET` (lista e id), `POST`, `PUT`, `DELETE`; `DELETE` roteia por papel (`ADMIN` deleta,
      demais cancelam).
      *verify:* `ProvaControllerTest` cobre os três papéis em cada verbo; `ATLETA` sem `Atleta`
      vinculado recebe o mesmo erro dos endpoints `/me`.
- [x] 2.4 `ProvaAtletaInputDto` (nome, data, tipo, distância, `distanciaKm`, tempo objetivo,
      `provaAlvo`) com `@Future` em `dataProva` e validação cruzada `CUSTOMIZADA ⇒ distanciaKm > 0`;
      controller usa esse DTO quando o papel é `ATLETA`.
      *verify:* `400` para data de hoje, para `CUSTOMIZADA` sem km; campos de resultado enviados
      pelo atleta não alteram a prova.
- [x] 2.5 `cancelarProva` (soft, `statusProva = CANCELADA`) e `ProvaRealizadaImutavelException`
      (`409`) para `PUT`/`DELETE` do atleta em prova com `foiRealizada = true`; handler global
      mapeia a exceção.
      *verify:* cancelada some de `GET .../provas` e de `findByAtletaAndProvaAlvoTrue`;
      `409` nos dois verbos para prova realizada; `ADMIN` ainda deleta fisicamente.

## 3. Backend — ciência do coach e fila de atenção

- [x] 3.1 Migration `V87__add_revisao_coach_to_tb_prova.sql` (V85 e V86 já existem — conferir
      `ls db/migration | sort -V | tail -1` antes de criar): `revisada_pelo_coach boolean NOT NULL
      DEFAULT true`, `motivo_revisao varchar(20) NULL`, `alvo_anterior_nome varchar(100) NULL`,
      índice parcial em `atleta_id WHERE revisada_pelo_coach = false`; campos e enum
      `MotivoRevisaoProva` na entidade.
      *verify:* teste de migration (Testcontainers, padrão `FoundingInviteMigrationTest`, roda no
      CI); provas pré-existentes ficam `true` com motivo nulo.
- [x] 3.2 Zerar a flag e gravar `motivoRevisao` (+ `alvoAnteriorNome` em `ALVO_TROCADA`) no
      service quando o ator é `ATLETA`: criação (`NOVA`), cancelamento (`CANCELADA`), `PUT` que
      mude `provaAlvo` (`ALVO_TROCADA`) ou `dataProva`/`distancia`/`distanciaKm` (`DATA_ALTERADA`);
      edição só de nome/tempo não zera; ator `TECNICO`/`ADMIN` nunca altera.
      *verify:* teste por caso (5 zeram com o motivo certo, 2 não zeram, coach não altera).
- [x] 3.3 `PATCH /api/v1/atletas/{atletaId}/provas/{provaId}/ciente` (`TECNICO`/`ADMIN`,
      idempotente, limpa motivo e alvo anterior, devolve `ProvaOutputDto`).
      *verify:* `200` e flag `true`; segunda chamada `200`; `ATLETA` `403`; outro tenant `404`.
- [x] 3.4 `ProvaRepository.findPendentesRevisaoByAssessoria(tenantId)` e
      `findPendentesRevisaoByAtleta(atletaId)` (futuras ou canceladas com flag `false`), a primeira
      agrupada por atleta no `CoachAttentionQueueServiceImpl`, a segunda para o card do perfil.
      *verify:* teste de repositório com prova passada revisada (fora), futura pendente (dentro),
      cancelada pendente (dentro), outro tenant (fora).
- [x] 3.5 `MotivoAtencao.PROVA_ATLETA` (peso 45, ação sugerida) e
      `CoachAttentionSignalEvaluator.avaliarProvaPendente(...)`: `CRITICA` se preparação curta ou
      `ALVO_TROCADA`, senão `ALTA`; evidências Prova / Data / Distância / "N de M semanas" /
      Motivo (com alvo anterior); integrar em `montarItem`.
      *verify:* `CoachAttentionSignalEvaluatorTest` cobre os três níveis e a ausência de sinal;
      teste do service mostra o atleta na fila com o motivo e sumindo após o ciente; atleta com
      fadiga `CRITICA` mantém um item só com a prova nas evidências.
- [x] 3.6 `SugestaoCoachGeneratorJob`: conjunto `MOTIVOS_IGNORADOS = {PROVA_ATLETA}` checado antes
      de `MOTIVO_TIPO`, sem log.
      *verify:* teste do job com item `PROVA_ATLETA` não cria `SugestaoCoach` e não loga warn
      (assert no appender de teste).
- [ ] 3.7 Suíte completa do backend verde e revisão de segurança dos endpoints tocados
      (posse, tenant, papéis).
      *verify:* `./mvnw clean test`; checklist de `security-reviewer` sem item aberto.

## 4. Frontend — atleta

- [x] 4.1 Tipos e serviço: `types/Prova.ts` ganha `'CUSTOMIZADA'` em `DistanciaProva` e em
      `DISTANCIA_PROVA_LABELS` ("Outra"), `preparacaoCurta`, `semanasFaltando`, `revisadaPeloCoach`,
      `motivoRevisao`, `alvoAnteriorNome`; `OnboardingProvaAlvoStep` filtra `CUSTOMIZADA`; `ProvaService` ganha `marcarCiente`; `utils/racePreparation.ts` com a
      mesma tabela e faixas.
      *verify:* teste unitário de `racePreparation` com os mesmos casos da task 1.1; teste do
      onboarding continua mostrando quatro distâncias.
- [x] 4.2 Rotas `/athlete/races`, `/athlete/races/new`, `/athlete/races/:provaId/edit` em
      `App.tsx` + `constants/routes.ts`; hook `useAthleteRaces` (CRUD sobre
      `/api/v1/atletas/{meuId}/provas`).
      *verify:* teste de rota renderiza a página para `ATLETA` e redireciona outros papéis.
- [x] 4.3 `AthleteRacesPage`: prova-alvo em destaque (semanas faltando × recomendadas, aviso de
      preparação curta), demais provas com chips (Planejada / Preparação curta), ações Editar e
      Cancelar (confirmação), prova realizada sem ações, estado vazio, botão "Cadastrar prova",
      voltar para o Plano.
      *verify:* testes de componente: lista com alvo e secundárias, estado vazio, cancelar chama
      `DELETE` e remove da lista, prova realizada sem botões.
- [x] 4.4 `AthleteRaceFormPage`: nome, data (`min` amanhã), chips de distância (+ "Outra" com
      km), chips de terreno, tempo objetivo, switch de prova-alvo com aviso de troca; mensagem da
      regra recalculada ao mudar data/distância; `tipoProva` derivado; criar e editar.
      *verify:* testes: maratona em 8 semanas mostra "Preparação curta" e ainda salva; 20
      semanas mostra "Dentro do recomendado"; "Outra" 30 km usa faixa de 21; switch com alvo
      existente mostra o aviso; payload do `POST` não envia campos derivados.
- [x] 4.5 `RaceTargetBanner` na `AthletePlanPage` com três estados (alvo / provas sem alvo /
      nenhuma prova) e `WeekOverviewCard` com "Sem próxima prova · Cadastrar".
      *verify:* testes dos três estados da faixa e do novo texto da home; snapshot antigo
      "peça ao seu coach" removido.
- [x] 4.6 Lint, build e suíte do front verdes.
      *verify:* `npm run lint && npm run build && npm test`.

## 5. Frontend — coach

- [x] 5.1 `types/Coach.ts` `AttentionReason += 'PROVA_ATLETA'`; `coachInboxHelpers.ts`
      `REASON_LABEL` e `MOTIVO_TEXTO` com "Prova do atleta".
      *verify:* `tsc` sem erro nos mapas exaustivos; teste do `AttentionOnlyRow` renderiza o
      motivo e as evidências da prova.
- [x] 5.2 `SectionCard` "Provas" na `CoachAthleteProfilePage` com `useProvas()` (`atletaId` por
      chamada) + pendentes de `findPendentesRevisaoByAtleta`: provas futuras + canceladas
      pendentes, chips Alvo / Preparação curta / Nova / Data alterada / Alvo trocada (antes X) /
      Cancelada, botão "Ciente" que chama `marcarCiente`, recarrega a lista e a attention queue.
      *verify:* teste de componente: item pendente mostra "Ciente"; clique chama o endpoint e
      remove o marcador; item revisado não mostra botão.
- [ ] 5.3 Lint, build e suíte do front verdes; E2E Playwright existente do perfil do coach
      continua passando.
      *verify:* `npm run lint && npm run build && npm test`; `npm run test:e2e` no CI.

## 6. Integração e encerramento

- [ ] 6.1 Fluxo ponta a ponta em `develop` (Railway): atleta cadastra maratona em 8 semanas →
      coach vê item `CRITICA` no Inbox com "8 de 16 semanas" → abre o perfil, card mostra a
      prova → "Ciente" → item some; atleta muda a data → item volta.
      *verify:* roteiro executado e registrado aqui com data.
- [x] 6.2 Anotar em `add-macrociclo-structure/proposal.md` a dependência da tabela
      `RacePreparationRule`; criar a change irmã `prova-no-plano-semanal` com dependência desta.
      *verify:* os dois arquivos citam esta change.
- [ ] 6.3 PRs backend e frontend (`feature/atleta-cadastra-prova` → `develop`), CI verde,
      `tasks.md` atualizado, arquivar após merge.
      *verify:* `openspec validate --change atleta-cadastra-prova`; change em
      `changes/archive/2026-09/`.
