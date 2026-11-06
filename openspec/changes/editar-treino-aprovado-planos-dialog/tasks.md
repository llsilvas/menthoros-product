## 1. Backend (`apps/menthoros-backend`, branch `feat/editar-treino-aprovado-planos-dialog`)

- [ ] 1.1 Teste primeiro: helper de contexto (D1) resolve `hoje` e a integração numa única query (`hasWatch` = presente, ativa ou revogada; `ConexaoCanalDto` com o mapeamento do perfil); `avaliar` devolve "não se aplica" para plano em revisão e para `APROVADO` + `CONCLUIDO`, "editável" e cada recusa (`PAST_DAY`, `NOT_PENDING`, `TODAY_ON_WATCH`)
- [ ] 1.2 Implementar o helper e trocar `recusaDeEdicao` e `resolverConexaoCanal` do `CoachAthleteProfileServiceImpl` por ele, sem mudar o JSON do perfil: testes do perfil verdes + testes novos de plano `AGUARDANDO_REVISAO` (`editable: true`) e `APROVADO` + `CONCLUIDO` (resultado da policy, como hoje)
- [ ] 1.3 Teste primeiro: `listarSemanasDoAtleta` devolve `editable`/`editRejection` só em plano `APROVADO` não `CONCLUIDO`; `editedAfterApprovalAt` em plano `APROVADO`, inclusive `CONCLUIDO`; `conexaoCanal` igual ao do perfil (ativa, revogada com `ativo: false`, ausente sem conexão); revogada + treino de hoje = `TODAY_ON_WATCH`; omitidos (não `false`) fora da condição
- [ ] 1.4 Campos no DTO de treino e `conexaoCanal` (`AtletaPerfilCoachOutputDto.ConexaoCanalDto`) no DTO do plano (D3); mapper ignora os campos novos; enriquecimento só em `listarSemanasDoAtleta` (D2), casando treino do DTO com a entidade por `id`
- [ ] 1.5 Teste de regressão: `GET /atletas/{id}/plano` com `ROLE_ATLETA` não contém nenhum campo novo
- [ ] 1.6 Teste de integração do endpoint: serialização (`editedAfterApprovalAt` ISO), outro tenant sem acesso, `ROLE_ATLETA` recebe 403 na listagem, `conexaoCanal` ativa × revogada (`ativo: false`) × ausente
- [ ] 1.7 Teste de queries: três semanas aprovadas em andamento com quantidades diferentes de treinos, contexto limpo; overhead desta change = +1 query de integração por requisição, 0 por plano ou treino
- [ ] 1.8 Validação: `./mvnw clean verify`

## 2. Frontend (`apps/menthoros-front`, branch `feat/editar-treino-aprovado-planos-dialog`)

- [ ] 2.1 Tipos: campos opcionais de treino (`editable`, `editRejection`, `editedAfterApprovalAt`) e `alvoPrimario` em `EtapaTreino`, em `src/types/TreinoPlanejado.ts`; `conexaoCanal?: ConexaoCanalDto` (de `src/types/AtletaPerfilCoach.ts`) em `src/types/PlanoSemanal.ts`
- [ ] 2.2 Teste primeiro: `toEditorTreino` (D4) com fixtures do JSON real da listagem preserva observação, TSS, alvos de etapa, `alvoPrimario`, descrições e repetições; converte `"01:05:00"` → `PT1H5M`, `"45:30"` → `PT46M`, texto inválido → `undefined`; enums objeto → `value`; sem `any`; fixa o caso de bloco com descrições diferentes (limitação herdada de `itensFromEtapas`)
- [ ] 2.3 Teste primeiro: `TreinoCard` mostra lápis, cadeado (mesmos textos da aba Plano, incluindo `TODAY_ON_WATCH`), selo "Editado após aprovação", e nada sem os campos
- [ ] 2.4 Teste primeiro: `TreinoEditDialog` com o estado neutro (D6) mostra "Se o atleta usa relógio, a versão nova será reenviada.", botão "Salvar", nunca "A mudança aparece só no app"; regressão: `canal: null` (aba Plano) segue "só no app"
- [ ] 2.5 Teste primeiro: `usePlanoSemanal.fetchPlanosPorAtleta` devolve `'ok'`/`'falha'`/`'obsoleta'` e só a última requisição grava `planos`/`error`/`loading` (resposta atrasada de outro atleta descartada, devolve `'obsoleta'`)
- [ ] 2.5b Teste primeiro (PlanosDialog): lápis abre o editor com motivo; mudar só a duração manda PATCH para `planoId`/`treinoId` capturados com `duracaoMin` e `editReason`, sem observação/TSS/tipo/zona; reload em segundo plano e troca de semana não fecham o editor; canal Garmin ativo → "Salvar e reenviar"; revogada/ausente → texto neutro
- [ ] 2.6 Teste primeiro: 422/409 mantém o editor aberto com a mensagem; PATCH ok + reload `'falha'` fecha o editor e mostra "Treino salvo; não foi possível atualizar a lista"; reload `'obsoleta'` (fetch concorrente, ex.: fim de geração) não mostra aviso; fechar o dialog ou trocar de atleta fecha o editor, descarta a edição e ignora o resultado de PATCH em voo (D7)
- [ ] 2.7 Implementar D4, D5, D6 e D7; mocks existentes de `fetchPlanosPorAtleta` (`planosDialog.test.tsx:17`) passam a resolver `'ok'`
- [ ] 2.8 E2E em `tests/e2e/coach/`: abrir PlanosDialog, editar treino pendente de plano aprovado de atleta com Garmin ("Salvar e reenviar"), ver o selo; treino passado com cadeado; plano concluído com selo e sem lápis
- [ ] 2.9 Validação: `npm run lint && npm run build && npm run test:run`; `editar-treino-aprovado.spec.ts` segue verde

## 3. Ordem

- [ ] 3.1 Merge do backend antes do front (o front sem os campos não mostra lápis, então a ordem inversa é segura, só inútil)
