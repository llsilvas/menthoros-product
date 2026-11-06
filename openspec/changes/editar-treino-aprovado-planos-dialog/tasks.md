> **Execução (`/implement init` 2026-11-05):** worktrees
> `.worktrees/backend-editar-treino-aprovado-planos-dialog` (base `e451e58`) e
> `.worktrees/front-editar-treino-aprovado-planos-dialog` (base `9b45273`), branch
> `feat/editar-treino-aprovado-planos-dialog` nos dois. Sequência: backend 1.1→1.8 (1.1/1.2 antes de
> 1.3/1.4, porque o enriquecimento usa o helper); front 2.1→2.9 pode correr em paralelo ao backend
> (fixtures com o JSON do contrato da spec; 2.8 precisa do backend da branch rodando). Merge em 3.1.
>
> **Run 2026-11-05:** backend `8b98657`, `00d0a1d`, `69f0312` (`clean verify`: 6486 unit + 315 IT, 0 falhas;
> listagem +1 statement: 9→10 com 1 semana, 23→24 com 3). Front `f46326c`…`0e0073e` (8 commits; lint, build,
> 2817 testes, E2E 3/3 com rotas mockadas). JSON real conferido contra as fixtures. Desvios: o perfil
> mantém `hasWatch` como query separada (3 testes existentes esperam a chamada; JSON do perfil igual) e só
> o canal sai do helper; `mensagemDeErroAoSalvar` movido para `src/features/coach/adapters/`; descarte de
> PATCH em voo por contador de sessão (cobre fechar e reabrir o mesmo atleta); E2E entra por
> `/#/atletas` como ADMIN, entrada pelo shell novo do coach (TECNICO) sem E2E.

## 1. Backend (`apps/menthoros-backend`, branch `feat/editar-treino-aprovado-planos-dialog`)

- [x] 1.1 Teste primeiro: helper de contexto (D1) resolve `hoje` e a integração numa única query (`hasWatch` = presente, ativa ou revogada; `ConexaoCanalDto` com o mapeamento do perfil); `avaliar` devolve "não se aplica" para plano em revisão e para `APROVADO` + `CONCLUIDO`, "editável" e cada recusa (`PAST_DAY`, `NOT_PENDING`, `TODAY_ON_WATCH`)
  - verify: `./mvnw test -Dtest=ApprovedWorkoutEditContextTest` verde; mock do repositório de integração chamado 1 vez para N treinos
- [x] 1.2 Implementar o helper e trocar `recusaDeEdicao` e `resolverConexaoCanal` do `CoachAthleteProfileServiceImpl` por ele, sem mudar o JSON do perfil: testes do perfil verdes + testes novos de plano `AGUARDANDO_REVISAO` (`editable: true`) e `APROVADO` + `CONCLUIDO` (resultado da policy, como hoje)
  - verify: `./mvnw test -Dtest=CoachAthleteProfileServiceImplTest` verde, incluindo os 2 casos novos; nenhum teste do perfil alterado
- [x] 1.3 Teste primeiro: `listarSemanasDoAtleta` devolve `editable`/`editRejection` só em plano `APROVADO` não `CONCLUIDO`; `editedAfterApprovalAt` em plano `APROVADO`, inclusive `CONCLUIDO`; `conexaoCanal` igual ao do perfil (ativa, revogada com `ativo: false`, ausente sem conexão); revogada + treino de hoje = `TODAY_ON_WATCH`; omitidos (não `false`) fora da condição
  - verify: `./mvnw test -Dtest=PlanoServiceImplTest` vermelho antes de 1.4 pelos campos ausentes
- [x] 1.4 Campos no DTO de treino e `conexaoCanal` (`AtletaPerfilCoachOutputDto.ConexaoCanalDto`) no DTO do plano (D3); mapper ignora os campos novos; enriquecimento só em `listarSemanasDoAtleta` (D2), casando treino do DTO com a entidade por `id`
  - verify: `PlanoServiceImplTest` verde; `buscarPlanoPorAtleta` não chama o helper
- [x] 1.5 Teste de regressão: `GET /atletas/{id}/plano` com `ROLE_ATLETA` não contém nenhum campo novo
  - verify: teste falha se qualquer um dos 4 campos aparecer no JSON do atleta
- [x] 1.6 Teste de integração do endpoint: serialização (`editedAfterApprovalAt` ISO), outro tenant sem acesso, `ROLE_ATLETA` recebe 403 na listagem, `conexaoCanal` ativa × revogada (`ativo: false`) × ausente
  - verify: IT novo verde com Testcontainers; JSON real conferido por `jsonPath` (`$.[0].conexaoCanal.ativo`, ausência com `doesNotExist()`)
- [x] 1.7 Teste de queries: três semanas aprovadas em andamento com quantidades diferentes de treinos, contexto limpo; overhead desta change = +1 query de integração por requisição, 0 por plano ou treino
  - verify: contagem de statements (Hibernate `Statistics`) da listagem com a change − sem a change = 1, igual para 1 e 3 semanas
- [x] 1.8 Validação: `./mvnw clean verify`
  - verify: `./mvnw clean verify` BUILD SUCCESS no worktree do backend

## 2. Frontend (`apps/menthoros-front`, branch `feat/editar-treino-aprovado-planos-dialog`)

- [x] 2.1 Tipos: campos opcionais de treino (`editable`, `editRejection`, `editedAfterApprovalAt`) e `alvoPrimario` em `EtapaTreino`, em `src/types/TreinoPlanejado.ts`; `conexaoCanal?: ConexaoCanalDto` (de `src/types/AtletaPerfilCoach.ts`) em `src/types/PlanoSemanal.ts`
  - verify: `npm run build` (tsc) verde; nenhum cast novo
- [x] 2.2 Teste primeiro: `toEditorTreino` (D4) com fixtures do JSON real da listagem preserva observação, TSS, alvos de etapa, `alvoPrimario`, descrições e repetições; converte `"01:05:00"` → `PT65M` (mesmo formato do `toIso8601` do editor), `"45:30"` → `PT46M`, texto inválido → `undefined`; enums objeto → `value`; sem `any`; fixa o caso de bloco com descrições diferentes (limitação herdada de `itensFromEtapas`)
  - verify: `npx vitest run src/components/features/planos/toEditorTreino.test.ts` vermelho → verde
- [x] 2.3 Teste primeiro: `TreinoCard` mostra lápis, cadeado (mesmos textos da aba Plano, incluindo `TODAY_ON_WATCH`), selo "Editado após aprovação", e nada sem os campos
  - verify: `npx vitest run src/components/features/planos/TreinoCard.test.tsx` verde; testes atuais intactos
- [x] 2.4 Teste primeiro: `TreinoEditDialog` com o estado neutro (D6) mostra "Se o atleta usa relógio, a versão nova será reenviada.", botão "Salvar", nunca "A mudança aparece só no app"; regressão: `canal: null` (aba Plano) segue "só no app"
  - verify: `npx vitest run src/features/coach/components/TreinoEditDialog` verde; testes da aba Plano intactos
- [x] 2.5 Teste primeiro: `usePlanoSemanal.fetchPlanosPorAtleta` devolve `'ok'`/`'falha'`/`'obsoleta'` e só a última requisição grava `planos`/`error`/`loading` (resposta atrasada de outro atleta descartada, devolve `'obsoleta'`)
  - verify: `npx vitest run src/hooks/usePlanoSemanal` verde (teste novo do hook)
- [x] 2.5b Teste primeiro (PlanosDialog): lápis abre o editor com motivo; mudar só a duração manda PATCH para `planoId`/`treinoId` capturados com `duracaoMin` e `editReason`, sem observação/TSS/tipo/zona; abrir e salvar sem mexer em nada não manda `duracaoMin` (nem com duração `"01:05:00"` ou `"45:30"`); reload em segundo plano e troca de semana não fecham o editor; canal Garmin ativo → "Salvar e reenviar"; revogada/ausente → texto neutro
  - verify: `npx vitest run src/components/features/planos/planosDialog.test.tsx` vermelho → verde após 2.7
- [x] 2.6 Teste primeiro: 422/409 mantém o editor aberto com a mensagem; PATCH ok + reload `'falha'` fecha o editor e mostra "Treino salvo; não foi possível atualizar a lista"; reload `'obsoleta'` (fetch concorrente, ex.: fim de geração) não mostra aviso; fechar o dialog ou trocar de atleta fecha o editor, descarta a edição e ignora o resultado de PATCH em voo (D7)
  - verify: idem `planosDialog.test.tsx`, casos de erro e D7
- [x] 2.7 Implementar D4, D5, D6 e D7; mocks existentes de `fetchPlanosPorAtleta` (`planosDialog.test.tsx:17`) passam a resolver `'ok'`
  - verify: 2.2–2.6 verdes; `npm run lint` sem warning novo
- [x] 2.8 E2E em `tests/e2e/coach/`: abrir PlanosDialog, editar treino pendente de plano aprovado de atleta com Garmin ("Salvar e reenviar"), ver o selo; treino passado com cadeado; plano concluído com selo e sem lápis
  - verify: `npx playwright test tests/e2e/coach/editar-treino-planos-dialog.spec.ts` verde
- [x] 2.9 Validação: `npm run lint && npm run build && npm run test:run`; `editar-treino-aprovado.spec.ts` segue verde
  - verify: os três comandos verdes no worktree do front; `editar-treino-aprovado.spec.ts` verde

## 3. Ordem

- [ ] 3.1 Merge do backend antes do front (o front sem os campos não mostra lápis, então a ordem inversa é segura, só inútil)
  - verify: PR do backend mergeado em `develop` antes de abrir o do front
