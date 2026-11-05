## 1. Backend (`apps/menthoros-backend`, branch `feat/editar-treino-aprovado-planos-dialog`)

- [ ] 1.1 Teste primeiro: helper de contexto (D1) resolve `hoje`, `hasWatch` e conexão ativa uma vez; `avaliar` devolve "não se aplica" para plano em revisão e para `APROVADO` + `CONCLUIDO`, "editável" e cada recusa (`PAST_DAY`, `NOT_PENDING`, `TODAY_ON_WATCH`)
- [ ] 1.2 Implementar o helper e trocar `recusaDeEdicao` do `CoachAthleteProfileServiceImpl` por ele, sem mudar o comportamento do perfil (testes do perfil verdes)
- [ ] 1.3 Teste primeiro: `listarSemanasDoAtleta` devolve `editable`/`editRejection`/`editedAfterApprovalAt` por treino e `conexaoCanal` por plano só quando aplicável; omitidos (não `false`) fora da condição
- [ ] 1.4 Campos no DTO de treino e `conexaoCanal` no DTO do plano (D3); mapper ignora os campos novos; enriquecimento só em `listarSemanasDoAtleta` (D2)
- [ ] 1.5 Teste de regressão: `GET /atletas/{id}/plano` com `ROLE_ATLETA` não contém nenhum campo novo
- [ ] 1.6 Teste de integração do endpoint: serialização, outro tenant sem acesso, `ROLE_ATLETA` recebe 403 na listagem, conexão ativa × revogada × ausente
- [ ] 1.7 Teste de queries: três semanas aprovadas em andamento com quantidades diferentes de treinos, contexto limpo; overhead desta change constante por requisição
- [ ] 1.8 Validação: `./mvnw clean verify`

## 2. Frontend (`apps/menthoros-front`, branch `feat/editar-treino-aprovado-planos-dialog`)

- [ ] 2.1 Tipos: campos opcionais de treino (`editable`, `editRejection`, `editedAfterApprovalAt`) em `src/types/TreinoPlanejado.ts` e `conexaoCanal` em `src/types/PlanoSemanal.ts`
- [ ] 2.2 Teste primeiro: `toEditorTreino` (D4) com payloads reais da listagem preserva observações, TSS, alvos de etapa, `alvoPrimario` e repetições; converte duração e enums; sem `any`
- [ ] 2.3 Teste primeiro: `TreinoCard` mostra lápis, cadeado (mesmos textos da aba Plano, incluindo `TODAY_ON_WATCH`), selo "Editado após aprovação", e nada sem os campos
- [ ] 2.4 Teste primeiro: `TreinoEditDialog` com canal desconhecido mostra o texto neutro e nunca "A mudança aparece só no app" (D6); comportamento da aba Plano inalterado
- [ ] 2.5 Teste primeiro (PlanosDialog): lápis abre o editor com motivo; salvar muda só a duração e leva `planoId`/`treinoId` capturados e `editReason`; reload em segundo plano e troca de semana não fecham nem redirecionam o editor; resposta atrasada de outro atleta é descartada
- [ ] 2.6 Teste primeiro: 422/409 mantém o editor aberto com a mensagem; PATCH ok + falha no reload fecha o editor e mostra "Treino salvo; não foi possível atualizar a lista"
- [ ] 2.7 Implementar D4, D5 e D6
- [ ] 2.8 E2E em `tests/e2e/coach/`: abrir PlanosDialog, editar treino pendente de plano aprovado de atleta com Garmin ("Salvar e reenviar"), ver o selo; treino passado com cadeado
- [ ] 2.9 Validação: `npm run lint && npm run build && npm run test:run`; `editar-treino-aprovado.spec.ts` segue verde

## 3. Ordem

- [ ] 3.1 Merge do backend antes do front (o front sem os campos não mostra lápis, então a ordem inversa é segura, só inútil)
