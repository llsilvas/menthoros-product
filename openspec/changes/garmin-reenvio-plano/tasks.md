# Tasks — garmin-reenvio-plano

Backend valida com `./mvnw clean verify`; frontend com `npm run lint && npm run build && npm run
test:run` e `npm run test:e2e` (fluxo do treinador que escreve no envio ao relógio).

Plano refinado no `/implement init` de 2026-11-04 (DoR: spec-reviewer NOT READY → 2 Major + 4 Minor
fechados na spec; decisões do founder: reenvio do plano inteiro aceito, push em andamento bloqueia
com 409). Ordem: 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 no backend; o front só começa com o contrato do
backend mergeado em `develop` (2.1 depende de 1.4 e 1.5).

## 1. Backend — reenvio

- [ ] 1.1 `TreinoPlanejado.reiniciarSincronizacao()` (D3): zera `tentativasSincronizacao`,
  `ultimaTentativaSincronizacao` e `erroSincronizacao`, status `AGUARDANDO_RETRY`; teste unitário
  puro (parte de `ERRO_PERMANENTE`, `ERRO_AUTENTICACAO`, `ERRO_VALIDACAO`; confere que `externalId`
  e `exportadoPara` não mudam).
  verify: teste da entidade verde; `externalId`/`exportadoPara` iguais antes e depois.
- [ ] 1.2 `TreinoPlanejadoRepository`: busca dos treinos do plano por `(planoId, tenantId)` em
  `ERRO_*` (para o reset) e checagem de push em andamento (`AGUARDANDO_RETRY`, ou `SINCRONIZANDO`
  com `ultimaTentativaSincronizacao` > agora − 10 min) (D1b); teste de repositório com treinos de
  dois tenants e um `SINCRONIZANDO` antigo que não conta. Conferir que o `GarminClient` e o cliente
  intervals.icu têm timeout HTTP de segundos (premissa do limiar de 10 min, D1b); se não tiverem,
  PARAR e levar ao founder.
  verify: teste de repositório verde; o treino do outro tenant nunca volta; timeouts citados aqui.
- [ ] 1.3 `PlanoReviewService.reenviarSincronizacao(planoId, tenantId)` (`@Transactional`, D2/D5/D1b):
  404 sem plano no tenant, 422 fora de `APROVADO`, 409 com push em andamento, reinicia os treinos em
  `ERRO_*`, publica `PlanoAprovadoEvent` só se `reenviados > 0`, devolve a contagem e loga
  planoId/tenantId/`reenviados`; testes de CA1, CA2, CA3, CA5 e CA11 (o CA4/403 é do aspect, na 1.4).
  verify: `verify(eventPublisher, never())` nos caminhos 409/422/`reenviados = 0`; CA2 conta só os em erro.
- [ ] 1.4 Endpoint `POST /{id}/reenviar-sincronizacao` no `CoachPlanoReviewController`
  (`@PreAuthorize` TECNICO/ADMIN, `@RequireTenant(resourceParamIndex = 0)`,
  `@Operation`/`@ApiResponses`) e DTO `ReenvioSincronizacaoOutputDto(reenviados)`; `@WebMvcTest`
  isolado dos 200/403/404/409/422 (rodar o teste sozinho, ver memória sobre verify local x CI).
  verify: `@WebMvcTest` verde; OpenAPI mostra os 5 códigos.
- [ ] 1.5 Item de treino do `AtletaPerfilCoachOutputDto` ganha `atletaConectadoCanal` (D4: mesmo
  nível de `atletaConectadoIntervalsIcu`, cálculo separado por `GarminConnectionService.conexaoDeCanal`,
  sem tocar o boolean de `melhoresEsforcosIntegracaoConectada`) e `erroSincronizacao` (D4b: só em
  `ERRO_VALIDACAO` e `SINCRONIZADO_PARCIAL`, `null` nos demais); teste com atleta Garmin, atleta
  intervals.icu e atleta sem conexão, treino `ERRO_VALIDACAO` com mensagem e `ERRO_PERMANENTE` com
  `null`.
  verify: teste do service verde; `melhoresEsforcosIntegracaoConectada` inalterado para atleta Garmin.
- [ ] 1.6 IT (`@TransactionalEventListener` só dispara com transação): aprovação com falha no
  canal → `ERRO_PERMANENTE` → chamada do endpoint → treino `SINCRONIZADO` (WireMock do Garmin com o
  formato real de resposta: `scheduleId` numérico); prova o caminho endpoint → commit → listener
  (CA1, CA6), e o treino já `SINCRONIZADO` do mesmo plano mantém o `externalId` (CA2).
  verify: IT verde em `./mvnw clean verify`.
- Validação: `./mvnw clean verify`.

## 2. Frontend — botão e chip

- [ ] 2.1 Portar à mão o contrato novo para `src/api` (método do serviço, `atletaConectadoCanal` e
  `erroSincronizacao` no item de treino), preservando o padrão do cliente curado; rodar o
  `generate:api` só para referência.
  verify: `npm run build` sem erro de tipo.
- [ ] 2.2 `useReenviarSincronizacao` (expõe `reenviando`, `erro`, `reenviar`; 409 vira "Envio em
  andamento"); teste do hook.
  verify: teste do hook cobre sucesso, 409 e erro genérico.
- [ ] 2.3 `CurrentWeekPlan`: botão "Reenviar ao relógio" visível só com treino em `ERRO_*` (CA7),
  desabilitado durante a chamada e, com tooltip, quando `atletaConectadoCanal` é falso (CA10) ou há
  treino em `AGUARDANDO_RETRY` (CA11; `SINCRONIZANDO` não desabilita, D1b), com feedback "Reenvio
  solicitado" e de erro; teste de componente.
  verify: teste de componente cobre CA7, CA10, CA11 e o caso `SINCRONIZANDO` com botão habilitado.
- [ ] 2.3b Motivo legível (CA9, D4b): função pura em `features/coach/adapters/` que mapeia
  `statusSincronizacao` + `erroSincronizacao` em `{ motivo, acao }` (inclui `SINCRONIZADO_PARCIAL`
  → "Enviado com ajustes"), exibida no plano da semana; teste do adapter para os cinco `ERRO_*` e o
  parcial.
  verify: teste do adapter verde.
- [ ] 2.4 `SyncStatusChip`: textos neutros de canal e uso de `atletaConectadoCanal` (CA8), inclusive
  na condição `mostraSync` do `CurrentWeekPlan` (~:61) e na prop do chip (~:88); ajustar
  `SyncStatusChip.test.tsx`.
  verify: nenhum texto "intervals.icu" no chip; atleta só-Garmin conectado não vê "Não conectado".
- [ ] 2.5 E2E (Playwright): treinador com plano de treinos em erro vê o botão, clica e a chamada
  sai; sem treino em erro o botão não aparece. Se o ambiente não permitir, registrar aqui o motivo
  como item adiado (CLAUDE.md do front).
  verify: `npm run test:e2e` verde ou adiamento registrado.
- Validação: `npm run lint && npm run build && npm run test:run`; `npm run test:e2e` na 2.5.

## 3. Fechamento

- [ ] 3.1 Teste manual no ambiente de testes (Railway, `develop`) com o atleta Garmin conectado:
  provocar um treino em `ERRO_*` (ex.: reenvio com Garmin desconectado), reconectar e reenviar pelo
  botão; repetir em produção depois do `develop → main`.
  verify: treino volta a `SINCRONIZADO` e aparece no relógio.
- [ ] 3.2 Atualizar `garmin-training-push/tasks.md` só se esta change mudar algo lá (hoje não muda).
