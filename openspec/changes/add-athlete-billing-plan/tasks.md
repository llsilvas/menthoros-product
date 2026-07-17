# Tasks — add-athlete-billing-plan

## Bloco 0 — Migration + enums + campos na entidade (backend)

- [x] 0.1 Migration `V57__add_dados_cobranca_atleta.sql` (confira `ls
      src/main/resources/db/migration/ | sort -V | tail -3` antes de criar — V57 é o próximo
      número livre no momento do DoR desta change, 2026-07-17): `ALTER TABLE tb_atleta ADD COLUMN
      tipo_plano_atleta VARCHAR(20)` + `ALTER TABLE tb_atleta ADD COLUMN data_vencimento_plano
      DATE` — ambas nullable, sem backfill. Sem down-migration (aditiva pura).
      **Rollback (achado do `spec-reviewer`):** um deploy revertido não precisa de ação — as duas
      colunas nullable ficam órfãs e inofensivas (nenhum código as lê sem o deploy que as
      introduz). Se um dia precisar remover de fato os dados (não apenas reverter o deploy), o
      caminho é uma migration nova `Vxx__remove_dados_cobranca_atleta.sql` com `DROP COLUMN` —
      registrado aqui como follow-up explícito, não uma down-migration automática desta V57.
      Verify: `./mvnw clean test` — migration aplica limpo no Testcontainers.
- [x] 0.2 Novo enum `TipoPlanoAtleta` (`enums/`): `MENSAL`, `TRIMESTRAL`, `SEMESTRAL`, `ANUAL`.
      Javadoc/comentário citando D1 do design.md (distinção de `PlanoAssessoria`, o plano SaaS da
      assessoria com a Menthoros — conceito diferente).
      Novo enum `StatusVencimentoPlano` (`enums/`): `EM_DIA`, `PROXIMO_VENCIMENTO`, `VENCIDO`, com
      o método estático `resolver(LocalDate dataVencimento, LocalDate hoje)` (D3 do design.md) —
      retorna `null` se `dataVencimento` for `null`; `VENCIDO` se `dataVencimento.isBefore(hoje)`;
      `PROXIMO_VENCIMENTO` se dentro de `DIAS_ALERTA_VENCIMENTO = 7` dias (inclusive); senão
      `EM_DIA`.
      TDD: teste unitário de `StatusVencimentoPlano.resolver` cobrindo os 4 ramos (null, vencido,
      próximo do limite exato de 7 dias, em dia) — função pura, sem mock.
      Verify: `./mvnw clean test`.
- [x] 0.3 `Atleta.java`: dois novos campos — `dataVencimentoPlano` (`LocalDate`, nullable) e
      `tipoPlanoAtleta` (`@Enumerated(EnumType.STRING)`, `@Column(name = "tipo_plano_atleta",
      length = 20)`, nullable) — mesmo padrão de outros enums `STRING` na entidade.
      Verify: `./mvnw clean test`.

## Bloco 1 — DTOs e mapper de CRUD (`AtletaInputDto`/`AtletaOutputDto`)

- [x] 1.1 `AtletaInputDto`: adiciona `LocalDate dataVencimentoPlano` e `TipoPlanoAtleta
      tipoPlanoAtleta`, ambos sem `@NotNull`/`@NotBlank` (preenchimento opcional, pode ficar para
      depois do cadastro). **Ambos com `@Schema(description=..., example=...)`** (achado do
      `spec-reviewer` — obrigatório em todo campo de DTO por convenção do `CLAUDE.md` do
      backend, seção "Swagger Documentation"; mesmo padrão já usado nos demais campos do DTO).
      `AtletaOutputDto`: adiciona os mesmos dois campos + `StatusVencimentoPlano
      statusVencimentoPlano` (derivado, não vem do input) — os três com `@Schema` também.
      `AtletaMapper` (MapStruct): `dataVencimentoPlano`/`tipoPlanoAtleta` mapeiam automaticamente
      por nome idêntico (sem `@Mapping` extra) em `toEntity`/`toOutputDto`/`updateEntity`.
      Novo `default method` no mapper (padrão já usado em `PlanoSemanalMapper
      .resolveAtletaNome`/`TreinoMapper.safeGetTreinoRealizadoId` — achado do pre-mortem, Codex,
      D3 do design.md, NÃO uma chamada estática qualificada inline):
      ```java
      default StatusVencimentoPlano resolveStatusVencimentoPlano(Atleta atleta) {
          return StatusVencimentoPlano.resolver(atleta.getDataVencimentoPlano(), LocalDate.now());
      }
      ```
      `toOutputDto` ganha `@Mapping(target = "statusVencimentoPlano", expression =
      "java(resolveStatusVencimentoPlano(atleta))")` (único ponto aceitável de `LocalDate.now()`
      direto, por não haver um `hoje` de contexto de request disponível no mapper).
      TDD: teste do mapper cobrindo: `dataVencimentoPlano` nulo → `statusVencimentoPlano` ausente
      no DTO (`@JsonInclude(NON_NULL)` já existente omite); vencido → `VENCIDO`; dentro da janela
      de 7 dias → `PROXIMO_VENCIMENTO`; fora da janela → `EM_DIA`.
      Verify: `./mvnw clean test`.
- [x] 1.2 Confirma que `PUT /api/v1/atletas/{id}` (`AtletaController.atualizarAtleta`, já
      existente) aceita os dois campos novos via `AtletaInputDto` sem mudança de assinatura —
      teste de integração/controller cobrindo update parcial (só `dataVencimentoPlano`, só
      `tipoPlanoAtleta`, os dois juntos, e nenhum dos dois — sem regressão nos demais campos do
      atleta).
      Verify: `./mvnw clean test`.

## Bloco 2 — `AtletaPerfilCoachOutputDto` (perfil do coach)

- [x] 2.1 `AtletaPerfilCoachOutputDto`: adiciona `LocalDate dataVencimentoPlano`, `TipoPlanoAtleta
      tipoPlanoAtleta`, `StatusVencimentoPlano statusVencimentoPlano` — `@Schema` com descrição,
      `@JsonInclude(NON_NULL)` (padrão já usado no DTO, ver `FonteLimiarInferencia`/
      `ConfiancaInferencia` como referência de enum aditivo).
      `CoachAthleteProfileServiceImpl` (construção manual do DTO, ~linha 114): passa os três
      valores lendo direto de `atleta.getDataVencimentoPlano()`/`getTipoPlanoAtleta()` +
      `StatusVencimentoPlano.resolver(atleta.getDataVencimentoPlano(), LocalDate.now())`.
      TDD: teste do service cobrindo os mesmos 4 ramos do Bloco 1.1 (nulo/vencido/próximo/em dia)
      no contexto do perfil agregado.
      Verify: `./mvnw clean test`.

## Bloco 3 — `CoachAtletaResumoDto` (roster do coach)

- [ ] 3.1 `CoachAtletaResumoDto`: adiciona os mesmos três campos (`dataVencimentoPlano`,
      `tipoPlanoAtleta`, `statusVencimentoPlano`).
      `CoachDashboardServiceImpl.montarResumo(Atleta atleta, LocalDate hoje, ...)` (linha
      ~235-269, já recebe `hoje` como parâmetro — D3 do design.md): chama
      `StatusVencimentoPlano.resolver(atleta.getDataVencimentoPlano(), hoje)` (usa o `hoje` do
      parâmetro, não `LocalDate.now()` — consistência com o restante do método) e passa os três
      valores no novo construtor do record.
      TDD: teste de `montarResumo`/`getRoster` cobrindo os 4 ramos + caso de múltiplos atletas
      com vencimentos diferentes no mesmo roster (garante que `hoje` é o mesmo para todos, sem
      inconsistência entre linhas).
      Verify: `./mvnw clean test` — suíte completa verde, sem regressão em
      `CoachDashboardServiceImplTest` existente.

## Bloco 4 — Frontend: tipos

- [ ] 4.1 `types/Atleta.ts`: novos tipos `TipoPlanoAtleta` (`'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL'
      | 'ANUAL'`) e `StatusVencimentoPlano` (`'EM_DIA' | 'PROXIMO_VENCIMENTO' | 'VENCIDO'`).
      Campos `dataVencimentoPlano?: string` (ISO `yyyy-MM-dd`) e `tipoPlanoAtleta?:
      TipoPlanoAtleta` em `Atleta`, `CreateAtleta`, `UpdateAtleta`; `statusVencimentoPlano?:
      StatusVencimentoPlano` só em `Atleta` (campo de saída).
      `types/Coach.ts`: `CoachAtletaResumo` ganha os mesmos três campos (importando os tipos de
      `types/Atleta.ts`, sem duplicar união).
      Cliente API curado (`src/api`): reflete os campos novos nos tipos de
      `AtletaOutputDto`/`AtletaInputDto`/`CoachAtletaResumoDto` correspondentes (gerar com `npm
      run generate:api` como referência, portar à mão para a fachada — convenção do `CLAUDE.md`
      do frontend).
      Verify: `npm run build` (typecheck).

## Bloco 5 — Frontend: edição (`AtletaDialog.tsx`)

- [ ] 5.1 `components/features/atleta/AtletaDialog.tsx`: adiciona os dois campos editáveis —
      seletor de `tipoPlanoAtleta` (MUI `Select`, opções MENSAL/TRIMESTRAL/SEMESTRAL/ANUAL, campo
      opcional) e input de `dataVencimentoPlano` (MUI date input, opcional) — segue o padrão
      visual e de validação já usado pelos demais campos opcionais do mesmo diálogo (D4 do
      design.md — único formulário de edição de atleta hoje, `CoachAthleteProfilePage.tsx` é
      somente leitura).
      Testes de componente (`*.test.tsx`, Testing Library): preencher e salvar os dois campos
      novos dispara `onSave` com os valores corretos; campos vazios não bloqueiam o save (são
      opcionais).
      Verify: `npm run lint && npm run build && npm run test:run`.
- [ ] 5.2 **Validação do critério de aceite 5** (achado do `spec-reviewer` — não havia task
      dedicada): `AtletaDialog.tsx` é aberto a partir de `pages/atletas/AtletasList.tsx` (shell
      legado), uma rota separada de `CoachAthleteProfilePage.tsx`/`CoachAthletesPage.tsx` (shell
      do coach) — não há estado client-side compartilhado entre as duas telas. "Sem reload
      manual" aqui significa: ao **navegar** para o perfil/roster do coach após editar (não dar
      F5 no navegador), os hooks `useAthleteProfile`/`useCoachRoster` já buscam dado fresco no
      `mount` da rota — nenhum mecanismo de invalidação de cache novo é necessário. Confirmar
      isso com um teste de hook (`useAthleteProfile.test.ts`/`useCoachRoster.test.ts`, já
      existentes): mock do service retornando os campos novos, hook expõe os valores atualizados
      sem intervenção adicional.
      Verify: `npm run test:run`.

## Bloco 6 — Frontend: exibição no perfil (`CoachAthleteProfilePage.tsx`)

- [ ] 6.1 `CoachAthleteProfilePage.tsx`: exibe `dataVencimentoPlano` (formatada) e
      `tipoPlanoAtleta` do `AtletaPerfilCoachDto`, com badge de `statusVencimentoPlano` (reusa
      `StatusBadge`, mesmo mapeamento de cor do Bloco 7). Ausência dos campos (atleta sem dados de
      cobrança) não renderiza nenhum badge — sem placeholder alarmante tipo "vencido" para quem
      nunca teve o dado preenchido.
      Verify: `npm run lint && npm run build`.

## Bloco 7 — Frontend: badge no roster (`CoachAthletesPage.tsx`)

- [ ] 7.1 `AthleteRow` (interface local, linha 67): adiciona `dataVencimentoPlano?: string`,
      `tipoPlanoAtleta?: TipoPlanoAtleta`, `statusVencimentoPlano?: StatusVencimentoPlano`.
      O `useMemo` que converte `roster` em `athletes` (linha ~282) repassa os três valores de `a`.
      Nova `GridColDef` no array `columns` (linha ~320): renderiza a data formatada (reusa
      `formatDate`, linha 108) + `StatusBadge` com `VENCIDO→'danger'`,
      `PROXIMO_VENCIMENTO→'warning'`, `EM_DIA→'active'`; célula vazia (`—`) quando
      `statusVencimentoPlano` ausente.
      Testes de componente cobrindo a renderização dos 4 estados (3 status + ausente).
      Verify: `npm run lint && npm run build && npm run test:run`.

## Bloco 8 — Validação final

- [ ] 8.1 Backend: `./mvnw clean test` — suíte completa, sem regressão.
- [ ] 8.2 Frontend: `npm run lint && npm run build && npm run test:run`.
- [ ] 8.3 `/qa` (code-reviewer + security-reviewer + clean-code-reviewer no backend,
      frontend-reviewer no frontend, trilha Full) — checar em especial isolamento de tenant nos
      campos novos (Bloco 3/critério de aceite 6) e ausência de dado sensível de pagamento real
      (esta change não lida com número de cartão/PIX, só data e enum).
      Corrigir achados Critical/Important antes de seguir; Minor/Low documentados se adiados.
- [ ] 8.4 `/pr add-athlete-billing-plan` → merge via CI → `/done`.
