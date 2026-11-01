# Tasks — garmin-reenvio-plano

Backend valida com `./mvnw clean verify`; frontend com `npm run lint && npm run build && npm run
test:run` e `npm run test:e2e` (fluxo do treinador que escreve no envio ao relógio).

## 1. Backend — reenvio

- [ ] 1.1 `TreinoPlanejado.reiniciarSincronizacao()` (D3): zera `tentativasSincronizacao`,
  `ultimaTentativaSincronizacao` e `erroSincronizacao`, status `AGUARDANDO_RETRY`; teste unitário
  puro (parte de `ERRO_PERMANENTE`, `ERRO_AUTENTICACAO`, `ERRO_VALIDACAO`; confere que `externalId`
  e `exportadoPara` não mudam).
- [ ] 1.2 `TreinoPlanejadoRepository`: busca dos treinos do plano em `ERRO_*` por `(planoId,
  tenantId)`; teste de repositório com treinos de dois tenants.
- [ ] 1.3 `PlanoReviewService.reenviarSincronizacao(planoId, tenantId)` (`@Transactional`, D2/D5):
  exige `APROVADO` (422 senão), reinicia os treinos em erro, publica `PlanoAprovadoEvent` só se
  `reenviados > 0`, devolve a contagem; testes de CA1, CA2, CA3, CA4 e CA5.
- [ ] 1.4 Endpoint `POST /{id}/reenviar-sincronizacao` no `CoachPlanoReviewController`
  (`@PreAuthorize` TECNICO/ADMIN, `@RequireTenant`, `@Operation`/`@ApiResponses`) e DTO
  `ReenvioSincronizacaoOutputDto(reenviados)`; `@WebMvcTest` isolado dos 200/403/404/422 (rodar o
  teste sozinho, ver memória sobre verify local x CI).
- [ ] 1.5 `AtletaPerfilCoachOutputDto` ganha `atletaConectadoCanal` calculado por
  `GarminConnectionService.conexaoDeCanal` em `CoachAthleteProfileServiceImpl` (D4) e o item de
  treino ganha `erroSincronizacao` (D4b, só texto curado); teste com atleta Garmin, atleta
  intervals.icu e atleta sem conexão, e com treino em erro devolvendo a mensagem.
- [ ] 1.6 IT (`@TransactionalEventListener` só dispara com transação): aprovação com falha no
  canal → `ERRO_PERMANENTE` → chamada do endpoint → treino `SINCRONIZADO` (WireMock do Garmin com o
  formato real de resposta: `scheduleId` numérico); prova o caminho endpoint → commit → listener
  (CA1, CA6).
- Validação: `./mvnw clean verify`.

## 2. Frontend — botão e chip

- [ ] 2.1 Portar à mão o contrato novo para `src/api` (método do serviço e `atletaConectadoCanal`),
  preservando o padrão do cliente curado; rodar o `generate:api` só para referência.
- [ ] 2.2 `useReenviarSincronizacao` (expõe `reenviando`, `erro`, `reenviar`); teste do hook.
- [ ] 2.3 `CurrentWeekPlan`: botão "Reenviar ao relógio" visível só com treino em `ERRO_*` (CA7),
  desabilitado durante a chamada e, com tooltip, quando `atletaConectadoCanal` é falso (CA10), com
  feedback de sucesso e de erro; teste de componente.
- [ ] 2.3b Motivo legível (CA9, D4b): função pura em `features/coach/adapters/` que mapeia
  `statusSincronizacao` + `erroSincronizacao` em `{ motivo, acao }`, exibida no plano da semana;
  teste do adapter para os cinco `ERRO_*`.
- [ ] 2.4 `SyncStatusChip`: textos neutros de canal e uso de `atletaConectadoCanal` (CA8);
  ajustar `SyncStatusChip.test.tsx`.
- [ ] 2.5 E2E (Playwright): treinador com plano de treinos em erro vê o botão, clica e a chamada
  sai; sem treino em erro o botão não aparece. Se o ambiente não permitir, registrar aqui o motivo
  como item adiado (CLAUDE.md do front).
- Validação: `npm run lint && npm run build && npm run test:run`; `npm run test:e2e` na 2.5.

## 3. Fechamento

- [ ] 3.1 Teste manual em produção com o atleta Garmin conectado: provocar um treino em
  `ERRO_*` (ex.: reenvio com Garmin desconectado) e reenviar pelo botão.
- [ ] 3.2 Atualizar `garmin-training-push/tasks.md` só se esta change mudar algo lá (hoje não muda).
