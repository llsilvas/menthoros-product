# Tasks — add-injury-clearance-flow

Pré-requisito: `add-injury-clearance-coach` mergeada em `develop`.

## 0. Bloqueante

- [ ] 0.1 LGPD: confirmar que o consentimento de dados sensíveis do onboarding cobre texto livre de
      lesão enviado ao provedor de LLM (decisão do founder). verify: decisão escrita no proposal;
      sem ela, não iniciar o bloco 2.

## 1. Persistência e regra compartilhada (backend)

- [ ] 1.1 Migration `V<próxima livre>__create_injury_event.sql` (D1). verify: `./mvnw clean verify`
      sobe o Flyway nos `*IT`.
- [ ] 1.2 Entidade `InjuryEvent` + enums (`InjuryEventKind`, `InjuryAuthorRole`,
      `ClearanceSignal`, `ClearanceRequestStatus`) + repositório com queries tenant-scoped.
      verify: `@DataJpaTest` do índice `uk_injury_event_pending`.
- [ ] 1.3 Extrair `InjuryClearanceRule.apply` de `updateAtleta` (D3) sem mudar comportamento.
      verify: testes da `add-injury-clearance-coach` verdes.

## 2. Serviço e endpoints

- [ ] 2.1 `InjuryClearanceService`: `report`, `requestClearance`, `confirm`, `decline`,
      `acknowledge`, com JavaDoc de idempotência/efeitos/tenant e evict de cache (D5). Testes CA1, CA4–CA10.
      verify: `./mvnw test -Dtest=InjuryClearanceServiceImplTest`.
- [ ] 2.2 `updateAtleta` grava `CLEARED` e resolve o pendente na transição (D3, CA16); checa
      `lesaoVistaEm` com trava da linha (D7, CA15); `AtletaInputDto`/`AtletaOutputDto` ganham
      `lesaoVistaEm`. verify: teste unitário + `*IT` de concorrência.
- [ ] 2.2b `concluirOnboarding` com perfil `COMPLETO` não copia os campos de lesão (D8, CA14).
      verify: teste unitário de autoliberação recusada.
- [ ] 2.2c `deleteAtleta` anonimiza os textos de `tb_injury_event` (padrão do ledger).
      verify: teste unitário.
- [ ] 2.3 Endpoints `/me/lesao`, `/me/lesao/sinal-liberacao` (`ATLETA`) e `/{id}/lesao/liberacao`,
      `/{id}/lesao/sinal-liberacao/recusa`, `/{id}/lesao/ciencia` (`TECNICO`/`ADMIN`,
      `@RequireTenant`), DTOs record, `@Operation`/`@ApiResponses`, `409` com `code` (D6).
      verify: `@WebMvcTest` + `*IT` com `jwt()` para CA11 e CA12.

## 3. Fila de atenção

- [ ] 3.1 `MotivoAtencao` +`LESAO_REPORTADA`(60) +`LIBERACAO_SOLICITADA`(15); avaliadores puros (D2).
      verify: testes do `CoachAttentionSignalEvaluator`.
- [ ] 3.2 `montarItem` com os dois sinais e evidências (CA2, CA3, CA6, CA8, CA17), só com eventos do
      episódio aberto (D2). Conferir
      `MOTIVOS_IGNORADOS`/`MOTIVO_TIPO` do `SugestaoCoachGeneratorJob`. verify: `./mvnw clean verify`.
- [ ] 3.3 CA13: teste de que a observação do coach não aparece no prompt. verify: teste do
      `AlertasPromptFormatter`/builder.
- [ ] 3.4 Evidência de dor (design.md, D2): função pura sobre check-ins e realizados dos últimos 28
      dias; endpoint ou campo no perfil para a tela de decisão (histórico semanal). CA6.
      verify: testes da função + `./mvnw clean verify`.

## 4. Frontend

- [ ] 4.1 `src/api` (à mão) + tipos: endpoints novos, motivos novos em `types/Coach.ts`.
      verify: `npm run build`.
- [ ] 4.0 Ajustar o design (v7) nos pontos de "Divergências do design" do proposal antes do front.
      verify: nova versão do artifact citada no proposal.
- [ ] 4.2 Atleta: bloco de lesão no check-in (escala de 4 níveis sobre `doresMusculares`, dois sinais,
      botão vermelho) e tela de espera, com o resultado e a observação do coach.
      verify: teste Vitest + `npm run lint && npm run build && npm run test:run`.
- [ ] 4.3 Coach: `REASON_LABEL`/`MOTIVO_TEXTO`, bloco "Sinal de atenção" no inbox, tela "Liberação de
      lesão" (sinal, histórico de 4 semanas, "Sua decisão" só leitura com observação, confirmação,
      link "Ajustar temporada"), "Ciente" na dor reportada, ajuda no `AtletaDialog`. O
      `AtletaDialog` devolve `lesaoVistaEm` e trata `409 LESAO_REPORTADA_DEPOIS` (recarrega o atleta
      e avisa). verify: testes + gate do front.
- [ ] 4.4 E2E: atleta pede liberação → coach confirma → check-in do atleta sem lesão.
      verify: `E2E (Playwright)` verde.

## 5. Validação

- [ ] 5.1 Homelab (leitura): eventos e fase do plano depois de um ciclo reporte → pedido → liberação.
