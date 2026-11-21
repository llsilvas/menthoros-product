> **Épico desde 2026-11-15.** As seções 1 a 10 são implementadas pelos 10 tickets verticais `add-season-plan-*`
> (tabela "Tickets (changes filhas)" no `proposal.md`; refeito pelo `/to-tickets` em 2026-11-15). Esta lista continua como inventário; cada task é
> marcada aqui quando a change filha que a contém for arquivada.

## 0. Gate antes do `/implement init`

- [x] 0.1 Decidir D1–D4 do `proposal.md` (supersessão de `add-macrociclo-structure`, destino de `add-taper-guidance`, geração manual ou automática, fatia 6 no MVP) — resolvidas em 2026-11-15, todas pela recomendação; D4 tira a seção 6 para a S10
- [x] 0.2a Criar as pastas das changes filhas S1–S10 com `proposal.md` curto apontando para este épico — feito em 2026-11-15 e refeito no mesmo dia pelo `/to-tickets` como 10 tickets verticais, cada um com `proposal.md` e `tasks.md`
- [x] 0.2 Se D1 = supersedir: nota de supersessão em `add-macrociclo-structure/proposal.md` e arquivá-la sem implementação — feito em 2026-11-15, em `archive/2026-11/2026-11-15-add-macrociclo-structure/`
- [x] 0.3 Combinar a ordem com `migrate-plan-prompt-to-skills` (quem implementa o bloco de posição no ciclo: formatter ou skill) — resolvida em 2026-11-15: aquela change está em 0/37, sem commit desde 2026-06-17 e adiada para depois de F4 no `SPRINTS.md`; a S8 implementa o bloco no `PeriodizacaoPromptFormatter` e `migrate-plan-prompt-to-skills` o herda quando entrar
- [x] 0.5 D2: arquivar `add-taper-guidance` como superseded — feito em 2026-11-15, em `archive/2026-11/2026-11-15-add-taper-guidance/`
- [x] 0.4 Conferir se `tb_plano_treino` tem linhas em produção; se tiver, a migration 1.7 precisa preservá-las — homelab (dev) conferido em 2026-11-15: 0 linhas, 0 vínculos em `tb_plano_semanal`. Produção (Railway) conferida pelo usuário em 2026-11-16: Flyway em 115, 0 planos, 0 vínculos, nenhum tenant divergente entre plano e prova. As FKs originais já estão como `RESTRICT` (`tb_plano_treino_prova_id_fkey`) e `SET NULL` (`tb_plano_semanal_plano_treino_id_fkey`), e não como o `CASCADE` da V1: houve divergência manual, porque nenhuma migration mudou essas FKs. A V116 encontra uma FK por coluna, derruba e recria com o mesmo comportamento e nome explícito, então não há mudança efetiva em produção

## 1. Modelo e Migrations

- [x] 1.1 Criar enum `MacrocicloStatus` (PROPOSTA, ATIVO, ARQUIVADO, CONCLUIDO) em `enums/` — `add-season-plan-model-integrity` (2026-11-16), como `SeasonPlanStatus`
- [x] 1.2 Criar enum `OrigemValorSemana` (MOTOR, COACH, IA_ACEITA) em `enums/` — `add-season-plan-model-integrity` (2026-11-16), como `WeekValueSource`
- [x] 1.3 Estender `PlanoTreino` com `totalSemanas`, `versao`, `macrocicloStatus` (nulo no legado; `status`/`PlanoStatus` existente fica intocado e não é lido pelo macro), `motivoVersao`, `ctlInicial`, `volumePicoKm`, `longaoMaximoKm`, `preparacaoCurta`, `aprovadoPor`, `aprovadoEm` — `add-season-plan-model-integrity` (2026-11-16)
- [x] 1.3a Remapear `PlanoTreino`: `prova` de `@OneToOne` para `@ManyToOne`; mapear `tenant_id` (NOT NULL desde a V45); tirar `orphanRemoval` de `planoSemanalList` — `add-season-plan-model-integrity` (2026-11-16)
- [x] 1.3b Preencher `nome`, `descricao` e `objetivo` (NOT NULL) a partir da prova na geração do macro — `add-season-plan-generate-tracer` (2026-11-18)
- [x] 1.3c Criar `PlanoTreinoRepository` (não existe) com consultas filtradas por `tenant_id` — `add-season-plan-model-integrity` (2026-11-16)
- [x] 1.4 Criar entidade `SemanaPlanejada` em `entity/` (`ordem`, `semanaInicio`, `fase` como `TrainingPhase` restrito a BASE/BUILD/PEAK/TAPER/RACE_WEEK, `volumeAlvoKm`, `tssAlvo`, `longaoKm`, `descarga`, `sessoesChave`, `origemValor`, `marcoProvaId`) — `add-season-plan-model-integrity` (2026-11-16), como `SeasonWeek`
- [ ] 1.5 Criar entidade `TemplateMetodologia` em `entity/` com escopo de assessoria, `versao` e flag de default global
- [ ] 1.6 Criar repositórios `SemanaPlanejadaRepository` e `TemplateMetodologiaRepository` — parcial: `add-season-plan-model-integrity` (2026-11-16) criou o repositório de `SeasonWeek`; falta o de `TemplateMetodologia`
- [x] 1.7 Criar migration `V116__add_macrociclo_plano_treino.sql`: colunas novas em `tb_plano_treino` (não há UNIQUE em `prova_id` no banco; o `@OneToOne` era só no mapeamento); trocar `tb_plano_treino.prova_id` para `ON DELETE RESTRICT` e `tb_plano_semanal.plano_treino_id` para `ON DELETE SET NULL`; índice único parcial `(atleta_id) WHERE macrociclo_status = 'ATIVO'` — `add-season-plan-model-integrity` (2026-11-16), como `V116__add_season_plan_to_plano_treino.sql`
- [x] 1.8 Criar migration `V117__create_tb_semana_planejada.sql` com `tenant_id` NOT NULL, FK `plano_treino_id ON DELETE CASCADE` e índice único por (`plano_treino_id`, `ordem`) — `add-season-plan-model-integrity` (2026-11-16), como `V117__create_tb_season_week.sql`
- [ ] 1.9 Criar migration `V118__create_tb_template_metodologia.sql` + seed do default global de maratona
- [ ] 1.10 Criar migration `V119__add_semana_planejada_to_tb_plano_semanal.sql` (`semana_planejada_id`, `desvio_alvo_percentual`)
- [x] 1.11 Atualizar `CONTEXT.md` com os termos novos (Macrociclo, Semana Planejada, Template de Metodologia, Origem do Valor) e o que evitar — `add-season-plan-model-integrity` (2026-11-16)
- [x] 1.11a Regra de prova com macro no `ProvaServiceImpl`: excluir prova referenciada por `PlanoTreino` responde 422 orientando a cancelar; cancelar ou trocar a prova-alvo arquiva o macro `ATIVO` (`motivoVersao` = "prova cancelada"), descarta as propostas e preserva semanas e planos semanais — `add-season-plan-model-integrity` (2026-11-16)
- [x] 1.11b Teste de integração: excluir prova com macro e planos semanais aprovados não apaga nenhuma linha de `tb_plano_treino`, `tb_semana_planejada` ou `tb_plano_semanal` — `add-season-plan-model-integrity` (2026-11-16) (`ProvaTemporadaIT`)
- [ ] 1.12 Validar: `./mvnw clean test` + subir a aplicação e conferir que as migrations V116–V119 aplicam em banco limpo e em banco com dados (revalidar a numeração contra `develop` no PR) — parcial: `add-season-plan-model-integrity` (2026-11-16) validou V116 e V117; a V118 virou índices em `add-season-plan-generate-tracer` e a V119 é da S8

## 2. Motor de Geração do Macrociclo

- [x] 2.1 Criar pacote `domain/macrociclo/` com `MacrocicloPlannerService` (determinístico, sem Spring AI) — `add-season-plan-generate-tracer` (2026-11-18), como `SeasonPlanner` estático em `domain/planner`
- [x] 2.2 Implementar distribuição de fases a partir do `TemplateMetodologia` e do total de semanas, reusando `RacePreparationRule` — `add-season-plan-generate-tracer` (2026-11-18), com template constante (D14); `TemplateMetodologia` não foi criado
- [x] 2.3 Implementar curva de volume com rampa limitada, descargas na cadência do template e pico antes do taper — rampa em `add-season-plan-generate-tracer`; descargas 3:1 e pico antes do taper em `add-season-plan-complete-proposal` (2026-11-19)
- [x] 2.4 Implementar progressão de longão com teto por fração do volume da semana — `add-season-plan-complete-proposal` (2026-11-19)
- [x] 2.5 Aplicar `TaperStrategy` nas semanas finais, derivando a janela pela distância da prova; o `tssAlvo` gravado é o alvo final da semana (taper e descarga embutidos), e a integração semanal não reaplica taper nem step-back sobre ele (5.7) — `add-season-plan-complete-proposal` (2026-11-19)
- [ ] 2.6 Derivar `tssAlvo` a partir do `volumeAlvoKm` e do baseline do atleta; marcar como estimado em calibração — parcial: `add-season-plan-generate-tracer` (2026-11-18) sem o caso de calibração (`add-season-plan-calibration-gate`)
- [x] 2.7 Ancorar provas preparatórias como marcos nas semanas correspondentes — `add-season-plan-complete-proposal` (2026-11-19)
- [x] 2.8 Implementar o corte ordenado de fases de D9 (por CTL, não proporcional; T1 de `add-season-plan-complete-proposal`) quando a janela é menor que o mínimo (`preparacaoCurta = true`) — `add-season-plan-complete-proposal` (2026-11-19)
- [x] 2.9 Criar `MacrocicloValidator` com as quatro regras da spec (rampa, longão/volume, cadência de descarga, taper) e severidade por alerta; distribuição de intensidade fica fora do MVP — `add-season-plan-complete-proposal` (2026-11-19)
- [ ] 2.10 Testes de `MacrocicloPlannerService`: reprodutibilidade, janela suficiente, preparação curta, atleta em calibração — parcial: `add-season-plan-complete-proposal` (2026-11-19), sem o caso de calibração (`add-season-plan-calibration-gate`)
- [x] 2.11 Testes de `MacrocicloValidator`: um caso por regra, mais caso sem alerta — `add-season-plan-complete-proposal` (2026-11-19)
- [x] 2.12 Validar: `./mvnw clean test` — `add-season-plan-complete-proposal` (2026-11-19)


## 3. Versionamento, Rascunho e Aprovação

- [ ] 3.1 Criar `MacrocicloVersionService` com criar rascunho a partir da versão ativa, salvar, aprovar e arquivar — parcial: `add-season-plan-approve-athlete-view` (2026-11-21) só aprova a proposta (PROPOSED → ACTIVE); rascunho, salvar e arquivar ficam para `add-season-plan-adjust-v2`
- [ ] 3.2 Implementar cópia imutável das semanas de ordem anterior à semana corrente
- [ ] 3.3 Implementar gate de `motivoVersao` obrigatório a partir da versão 2 (422 sem motivo)
- [ ] 3.4 Implementar unicidade de macro `ATIVO` por atleta (índice parcial da 1.7 + arquivamento do anterior na mesma transação da aprovação) — parcial: `add-season-plan-approve-athlete-view` (2026-11-21) garante uma ACTIVE por atleta (409 se houver outra); arquivar a anterior fica para a v2 (decisão A4)
- [ ] 3.5 Implementar recálculo que preserva semanas passadas e valores com `origemValor = COACH`
- [ ] 3.6 Implementar validação de soma de fases igual ao total de semanas (422 na aprovação)
- [ ] 3.7 Implementar serviço de diff entre duas versões, por semana e por campo, com origem
- [ ] 3.8 Garantir que semanas concluídas, em andamento e a da prova são somente leitura (422 na edição)
- [ ] 3.9 Testes de versionamento: segunda versão, imutabilidade do passado, conflito de versão, unicidade do ativo
- [ ] 3.10 Validar: `./mvnw clean test`


## 4. API

- [x] 4.1 `POST /api/v1/atletas/{atletaId}/macrociclo` — gerar proposta a partir da prova-alvo (ação manual do coach; sem hook no `ProvaService`, proposal D3) — `add-season-plan-generate-tracer` (2026-11-18), como `POST /season-plans`
- [x] 4.2 `GET /api/v1/atletas/{atletaId}/macrociclo/ativo` — macro ativo com semanas, marcos e validações — `add-season-plan-generate-tracer` (2026-11-18), como `GET /season-plans/current`; marcos e validações em `add-season-plan-complete-proposal`
- [ ] 4.3 `GET /api/v1/atletas/{atletaId}/macrociclo/semana-atual` — semana planejada corrente
- [ ] 4.4 `POST /api/v1/macrociclo/{id}/rascunho` — criar rascunho a partir da versão ativa
- [ ] 4.5 `PATCH /api/v1/macrociclo/{id}/semanas/{ordem}` — editar uma semana do rascunho
- [ ] 4.6 `PATCH /api/v1/macrociclo/{id}/parametros` — editar parâmetros e fases do rascunho
- [ ] 4.7 `POST /api/v1/macrociclo/{id}/recalcular` — recalcular semanas futuras do rascunho
- [ ] 4.8 `GET /api/v1/macrociclo/{id}/validacoes` — validações do rascunho
- [ ] 4.9 `GET /api/v1/macrociclo/{id}/diff?versao=N` — diff entre versões
- [x] 4.10 `POST /api/v1/macrociclo/{id}/aprovar` — aprovar o rascunho — `add-season-plan-approve-athlete-view` (2026-11-21), como `POST /season-plans/{id}/approve` sobre a proposta (v1, sem rascunho)
- [x] 4.11 `GET /api/v1/atletas/me/temporada` — visão do atleta, apenas com macro `ATIVO` — `add-season-plan-approve-athlete-view` (2026-11-21), como `GET /atletas/me/season-plan` (204 sem temporada ativa)
- [x] 4.12 Garantir isolamento por `TenantContext` em todos os endpoints e teste de vazamento entre tenants — `add-season-plan-generate-tracer` (2026-11-18)
- [x] 4.12a Guard de papel: endpoints 4.1–4.10 com `@PreAuthorize("hasAnyRole('TECNICO', 'ADMIN')")` (padrão do `CoachSugestaoController`); 4.11 só para o atleta autenticado e só com `macrocicloStatus = ATIVO` — `add-season-plan-generate-tracer` (2026-11-18) para 4.1 e 4.2; os demais endpoints entram com os tickets que os criam
- [ ] 4.12b Testes de autorização: `ATLETA` recebe 403 em 4.1–4.10; atleta com macro só em `PROPOSTA` recebe "sem plano" em 4.11 — parcial: `add-season-plan-generate-tracer` (2026-11-18) cobre o 403 de `ATLETA` em 4.1 e 4.2; `add-season-plan-approve-athlete-view` (2026-11-21) cobre o 403 em 4.10 e o "sem plano" (204) de 4.11; faltam 4.3–4.9, que ainda não existem
- [x] 4.13 Adicionar flag `macrociclo.enabled` em `application.yml` (default `false`) — `add-season-plan-generate-tracer` (2026-11-18), como `season-plan.enabled`
- [x] 4.14 Validar: `./mvnw clean test` + conferir os endpoints novos no OpenAPI (`docs/api/openapi.json`) — `add-season-plan-generate-tracer` (2026-11-18)


## 5. Integração com a Geração Semanal

- [ ] 5.1 Criar `SemanaPlanejadaSnapshot` em `domain/planner/`
- [ ] 5.2 Carregar a semana planejada no `PlanGenerationContextLoader` e expor no `PlanGenerationContext`
- [ ] 5.3 Adicionar o snapshot ao `PlannerInputSnapshot` em `PlannerShadowService.mapToSnapshot`
- [ ] 5.4 `PeriodizationPlanner`/`PlannerEngine`: fase pela ordem lesão > pós-prova > macro > heurística; manter o fallback atual sem macro
- [ ] 5.5 Adicionar métrica `macrociclo.phase.divergence.count` comparando macro e heurística (só com `planner-engine.shadow=true`, default `false`; ligar no tenant do Design Partner)
- [ ] 5.6 `SessionCompositionResolver`: receber sessões-chave e longão da semana planejada
- [ ] 5.7 `LoadTargetResolver`: usar `tssAlvo` como baseline e não aplicar step-back quando a fase vem do macro; preservar teto de rampa e cold-start; `PlannerEngine` não chama `aplicarTaperSeAplicavel` quando a fase vem do macro; com fase de lesão ou pós-prova, comportamento atual sobre o baseline do macro
- [ ] 5.8 Registrar desvio e motivo no `WeekPlanSkeleton` quando uma proteção corta o alvo do macro
- [ ] 5.9 Garantir que o alvo resolvido nunca excede o `tssAlvo` do macro
- [ ] 5.10 Estender o `PeriodizacaoPromptFormatter` existente (ou a skill, conforme 0.3): com macro, o bloco de posição no ciclo substitui a fase legada e o "TSS Alvo Semanal" (`ctlAlvo * 7`) impresso pelo `PlanoTreinoPromptBuilder`; sem macro, prompt idêntico
- [ ] 5.10a Teste do prompt: com macro, não contém o "TSS Alvo Semanal" legado nem a fase por semanas faltando; sem macro, snapshot igual ao atual
- [ ] 5.11 Compliance atrás de `planner-engine.enabled` e `macrociclo.enforcement.enabled`: volume reaproveita `TSS_FORA_DA_FAIXA` com faixa centrada no `tssAlvo`; nova chave `LONGAO_DIVERGENTE_DO_MACRO` em km; suspender `LONGO_ACIMA_TETO` quando o longão está dentro da tolerância do previsto
- [ ] 5.11a Adicionar `distanciaKm` ao `GeneratedSessionSnapshot` e ao mapper que o monta a partir do `TreinoPlanejadoLlmDto`
- [ ] 5.11b Adicionar flag `macrociclo.enforcement.enabled` em `application.yml` (default `false`)
- [ ] 5.12 Preencher `semanaPlanejadaId` e `desvioAlvoPercentual` no `PlanoSemanal` ao persistir (`(tss planejado − tssAlvo) / tssAlvo × 100`, design 10c)
- [ ] 5.13 Registrar o delta entre o alvo do macro e o plano aprovado pelo coach
- [ ] 5.14 Testes do `LoadTargetResolver`/`PlannerEngine`: alvo dentro dos tetos, proteção cortando, progressão acima do macro, calibração, semana perdida, semana de taper sem dupla redução, semana de descarga sem step-back extra, lesão e pós-prova sobrepondo o macro
- [ ] 5.15 Testes de compliance: volume fora da banda, longão divergente, longão concentrado previsto pelo macro sem `LONGO_ACIMA_TETO`, invariante de segurança, enforcement desligado
- [ ] 5.16 Teste de regressão: atleta sem macro gera plano idêntico ao comportamento atual
- [ ] 5.17 Validar: `./mvnw clean test`, com atenção ao teste de regressão 5.16


## 6. Replanejamento

- [ ] 6.0 Adicionar valor novo em `TipoSugestao` para proposta de macro (hoje só PLAN_ADJUST, RECOVERY, NEW_PLAN), com o rótulo no front
- [ ] 6.1 Criar `ReplanejamentoTriggerService` com os gatilhos de desvio acumulado, lesão e mudança de prova; o de prova-teste só depois de `add-running-field-tests`
- [ ] 6.2 Implementar desvio acumulado por janela configurável (default 3 semanas) com limite por propriedade
- [ ] 6.3 Acionar avaliação no encerramento da semana, junto da `RevisaoSemanal`
- [ ] 6.4 Gerar a proposta como `SugestaoCoach` de macro, com evidência, semanas afetadas e valores do motor
- [ ] 6.5 Garantir que a proposta altera apenas semanas futuras
- [ ] 6.6 Registrar o desfecho da proposta (aceita, editada, rejeitada)
- [ ] 6.7 Adicionar flag `macrociclo.replanejamento.enabled` (default `false`)
- [ ] 6.8 Testes: desvio acumulado, semana isolada, mudança de data, rejeição, preservação do passado (prova-teste entra com `add-running-field-tests`)
- [ ] 6.9 Validar: `./mvnw clean test`


## 7. Frontend — Coach

- [x] 7.1 Criar a seção `Temporada` em `CoachAthleteProfilePage`, no layout que estiver em `develop` (hoje `SectionCard`s, sem abas; `redesign-coach-athlete-profile` propõe abas Visão geral · Financeiro · Histórico — encaixar conforme o que tiver entrado) — `add-season-plan-generate-tracer` (2026-11-18), como aba Temporada no inbox do treinador (D6), não no perfil
- [ ] 7.2 Criar `SeasonMapChart` (faixa de fases + volume por semana, com realizado, planejado e previsto) — parcial: escopo reduzido em `add-season-plan-complete-proposal` (2026-11-19): fases, volume planejado, semana atual, descargas e marcos; realizado e previsto ficam para a integração semanal
- [x] 7.3 Criar `SeasonKpiStrip` reusando `MetricTile` — `add-season-plan-generate-tracer` (2026-11-18), com `KpiStrip`
- [x] 7.4 Criar `SeasonWeeksTable` com nível de detalhe por semana — `add-season-plan-generate-tracer` (2026-11-18), dentro do `SeasonTabPanel`
- [x] 7.5 Criar `SeasonMilestonesPanel` e `SeasonValidationsPanel` — feito em `add-season-plan-complete-proposal` (2026-11-19) como listas dentro do `SeasonTabPanel`, sem componentes próprios
- [ ] 7.6 Criar `SeasonReplanProposalCard` com `ai-highlight` e as ações aceitar, editar e rejeitar
- [ ] 7.7 Implementar os estados: sem prova-alvo, prova sem macro, macro em proposta, calibração, carregando, erro — parcial: `add-season-plan-generate-tracer` (2026-11-18) sem o estado de calibração
- [ ] 7.8 Criar `CoachSeasonAdjustPage` com parâmetros, fases, tabela editável, alterações, validações e motivo
- [ ] 7.9 Implementar marcação de campo alterado com valor anterior e bloco de diff com origem
- [ ] 7.10 Implementar travas de semana (concluída, em andamento, prova) e confirmação de recálculo
- [ ] 7.11 Implementar bloqueio de aprovação por soma de fases e tratamento de conflito de versão
- [x] 7.12 Consumir os endpoints pelo cliente curado em `src/api` (service + tipos escritos à mão, `generate:api` só como referência — `apps/menthoros-front/CLAUDE.md`), via hook — `add-season-plan-generate-tracer` (2026-11-18)
- [ ] 7.13 Testes de componente para o mapa, a tabela editável e o card de proposta — parcial: `add-season-plan-generate-tracer` (2026-11-18) (tabela e estados) e `add-season-plan-complete-proposal` (resumo acessível do mapa); faltam tabela editável e card de proposta
- [ ] 7.14 Teste e2e do fluxo: gerar proposta, ajustar, aprovar, ver na seção Temporada
- [x] 7.15 Validar: `bun lint && bun run build && bun test:run` — `add-season-plan-generate-tracer` (2026-11-18)


## 8. Frontend — Atleta

- [x] 8.1 Criar bloco `Minha temporada` na área do atleta, oculto sem macro `ATIVO` — `add-season-plan-approve-athlete-view` (2026-11-21)
- [ ] 8.2 Implementar prova-alvo com contagem de dias, fase atual segmentada e volume por semana — parcial: `add-season-plan-approve-athlete-view` (2026-11-21) mostra prova, dias e fase atual; volume por semana fica para o ticket 8 (A7)
- [ ] 8.3 Implementar resumo da semana com CTA para os treinos da semana
- [ ] 8.4 Implementar próximos marcos com a explicação do efeito — parcial: `add-season-plan-approve-athlete-view` (2026-11-21) lista até 3 próximos marcos com data, sem a explicação do efeito
- [ ] 8.5 Incluir a nota permanente de previsão e o estado de calibração — parcial: `add-season-plan-approve-athlete-view` (2026-11-21) tem a nota de previsão; o estado de calibração é do ticket 4
- [ ] 8.6 Testes de componente cobrindo ausência de macro e estado de calibração — parcial: `add-season-plan-approve-athlete-view` (2026-11-21) cobre a ausência de temporada; calibração com o ticket 4
- [x] 8.7 Validar: `bun lint && bun run build && bun test:run` — `add-season-plan-approve-athlete-view` (2026-11-21)


## 9. Acessibilidade e Qualidade Visual

- [ ] 9.1 Verificar contraste 4.5:1 em todos os rótulos das três telas
- [ ] 9.2 Verificar alvos de toque de 44 px e elementos interativos semânticos
- [ ] 9.3 Adicionar alternativa textual ao mapa e à prévia da curva de volume
- [ ] 9.4 Verificar que pares de cor diferem em luminosidade, não só em matiz
- [ ] 9.5 Verificar rolagem horizontal contida nas tabelas largas e layout em largura de telefone
- [ ] 9.6 Confirmar a disciplina do lime: reservado a prova, semana atual e bloco de IA
- [ ] 9.7 Validar: rodar o audit de acessibilidade nas três telas e registrar o resultado na change


## 10. Fechamento (QA Full track: code-reviewer + security-reviewer + test-master)

- [ ] 10.1 Executar `./mvnw clean test` e garantir 0 falhas
- [ ] 10.2 Executar `bun test:run` e `bun test:e2e` no front e garantir 0 falhas
- [ ] 10.3 Atualizar `docs/arquitetura/roadmap-features-produto.md` §Feature 6 apontando para esta change e para as divergências (entidade e geração como proposta)
- [ ] 10.4 Registrar ADR para "macro como teto, não piso" e para a precedência segurança > macro > progressão
- [ ] 10.5 Atualizar os manuais (`manual-treinador.md`, `guia-atleta.md`, hoje rascunhos em `menthoros-brain/99-Archive/manuais-rascunho-2026-10-04/`) com a temporada — se ainda estiverem arquivados, registrar o conteúdo para quando forem reativados
- [ ] 10.6 Validar rollout: `macrociclo.enabled` e `planner-engine.shadow` por tenant no Design Partner, com `macrociclo.enforcement.enabled` e `macrociclo.replanejamento.enabled` desligadas
