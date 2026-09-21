# Tasks — add-contrato-atleta-mensalidade

Validação por bloco: backend `./mvnw clean test` (IT classes exigem `./mvnw clean verify` no
gate final); frontend `npm run lint && npm run build && npm test`. Branch
`feature/add-contrato-atleta-mensalidade` nos dois repos antes de qualquer código. Backend
mergeia antes do front.

## 1. Backend — modelo e aritmética

- [ ] 1.1 Migration `V96__create_tb_contrato_atleta_e_tb_mensalidade.sql` (design D1 + backfill
      só de contrato, D7; sem DROP, sem mensalidade). Enums `PeriodicidadeContrato`,
      `StatusMensalidade`. Entidades `ContratoAtleta` (com `@Version`) e `Mensalidade` com
      `tenant_id` e filtro de tenant no padrão das demais.
      *verify:* IT Testcontainers — tabelas, índice parcial, `UNIQUE`, backfill a partir de um
      atleta com e sem `data_vencimento_plano`; zero linhas em `tb_mensalidade` após a migration.
- [ ] 1.2 `CalendarioVencimento` (classe pura, design D2): `primeiroVencimento`,
      `proximoVencimento` com clamp por dia do contrato.
      *verify:* teste parametrizado — dia 31 em fev/mar, dia 10 com início dia 9 e dia 11, ano
      bissexto, periodicidades.
- [ ] 1.3 Repositórios: `ContratoAtletaRepository` (`findAtivoByAtletaId`, `findByIdForUpdate`
      com `PESSIMISTIC_WRITE`, `findTenantIdsComContratoAtivo`, `findAtivosByTenantId`) e `MensalidadeRepository` (`findByContratoIdOrderByVencimentoDesc`,
      `findEmAbertoByTenantIdAndAtletaIdIn`, `findTopByContratoIdOrderByVencimentoDesc`).
      *verify:* IT de isolamento — atleta do tenant B invisível ao tenant A.

## 2. Backend — serviço e renovação

- [ ] 2.1 `ContratoAtletaService.criarOuAtualizar` / `encerrar` (design D2). Criar gera a
      primeira mensalidade via `garantirProximaMensalidade`. Editar não toca mensalidades
      existentes. Encerrar só seta `encerradoEm`.
      *verify:* CA2, CA9, CA10.
- [ ] 2.2 `garantirProximaMensalidade` (lock no contrato, releitura por id+tenant, primeira
      mensalidade nunca no passado, teto 24 com `WARN`) + `MensalidadeRenovacaoScheduler`
      (design D3), cron `${mensalidade.renovacao.cron:0 0 4 * * *}`, por tenant com
      `TenantContext` e `clear()` em `finally`, falha isolada por tenant e por contrato.
      *verify:* CA4, CA5, CA13 (data legada passada e futura), CA16 (corrida scheduler × encerrar
      e × editar), CA17 (dois tenants, falha no primeiro), contrato encerrado não gera, `UNIQUE`
      tratado, atraso > 24 períodos completa em duas execuções.
- [ ] 2.3 Transições de mensalidade (design D6): `darBaixa`, `desfazerBaixa`,
      `cancelarMensalidade`; `409` para transição inválida.
      *verify:* CA7, CA8, tabela de transições completa.
- [ ] 2.4 `StatusCobrancaAtleta` (renomeia `StatusVencimentoPlano`, design D4) e
      `resolverStatus`; `proximoVencimento`.
      *verify:* teste do enum com listas de vencimentos; sem contrato → ausente.

## 3. Backend — API e DTOs

- [ ] 3.1 `ContratoAtletaController`: `GET/PUT /api/v1/atletas/{id}/contrato`,
      `POST .../contrato/encerrar`, `POST/DELETE /api/v1/mensalidades/{id}/baixa`,
      `POST /api/v1/mensalidades/{id}/cancelar`. `@PreAuthorize("hasAnyRole('PROPRIETARIO','ADMIN')")`
      na classe. DTOs `ContratoAtletaInputDto`/`OutputDto`, `MensalidadeOutputDto`,
      `BaixaMensalidadeInputDto`. Validação: `diaVencimento` 1–31, `valor` ≥ 0.
      *verify:* `@WebMvcTest` — CA11 (403 para TECNICO), CA12 (404 cross-tenant), happy paths.
- [ ] 3.2 DTOs de atleta: remover `tipoPlanoAtleta`/`dataVencimentoPlano` de
      `AtletaInputDto`, `AtletaOutputDto`, `AtletaPerfilCoachOutputDto`, `CoachAtletaResumoDto`;
      `statusVencimentoPlano` → `statusCobranca`; adicionar `proximoVencimento`. Ajustar
      `AtletaMapper`, `CoachDashboardServiceImpl.montarResumo` (uma query, design D4) e
      `CoachAthleteProfileServiceImpl`.
      *verify:* CA1, CA6; teste de serialização garantindo ausência de campo `valor*` nos DTOs de
      atleta (design D5). Suíte completa verde.
- [ ] 3.3 Remover `tipoPlanoAtleta`/`dataVencimentoPlano` da entidade `Atleta` (colunas ficam no
      banco, não mapeadas — o `DROP` é a task 0.1 de `add-aviso-mensalidade`).
      *verify:* `./mvnw clean verify` verde; nenhuma referência às colunas fora de migrations.

## 4. Frontend — proprietário

- [ ] 4.1 Tipos e cliente: `types/ContratoAtleta.ts`, `api/services/ContratoAtletaService.ts`;
      atualizar `types/Atleta.ts`, `types/Coach.ts`, `types/AtletaPerfilCoach.ts` (campos
      novos, remoção dos antigos). `billingPlanAdapters.ts` → `cobrancaAdapters.ts`.
      *verify:* `npm run build` verde.
- [ ] 4.2 `CobrancaAtletaSection` (design D8): formulário do contrato (periodicidade, valor,
      dia, início, aviso ao atleta), encerrar, lista de mensalidades com baixa / desfazer /
      cancelar, estados vazio/erro. Montada em `CoachAthleteProfilePage` só com role
      `PROPRIETARIO` (`useUserInfo`).
      *verify:* testes RTL — CA14 (renderiza para proprietário, não renderiza e não chama API
      para técnico), baixa com valor default, cancelar desabilitado quando PAGA.

## 5. Frontend — todo treinador

- [ ] 5.1 `AtletaDialog.tsx` perde os dois campos (CA15). `CoachAthletesPage.tsx` coluna
      "Vencimento" lê `proximoVencimento` + `statusCobranca`. Cabeçalho do perfil lê os mesmos.
      *verify:* testes existentes ajustados; `npm run lint && npm run build && npm test`.

## 6. Integração e encerramento

- [ ] 6.1 Gate backend completo (`./mvnw clean verify`), gate front, `/qa` nos dois repos.
- [ ] 6.2 Validação manual em `develop` (Railway): criar contrato numa fundadora, rodar o job
      com data forçada, dar baixa, conferir roster com usuário técnico não proprietário.
- [ ] 6.3 Arquivar `athlete-billing-plan` em `openspec/specs/` se existir; `tasks.md` atualizado.
