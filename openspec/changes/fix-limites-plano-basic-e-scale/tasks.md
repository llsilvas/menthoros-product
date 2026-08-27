# Tasks — fix-limites-plano-basic-e-scale

Repo: `apps/menthoros-backend`. Validação a cada bloco: `./mvnw clean test`.

Branch: `feature/fix-limites-plano-basic-e-scale`, criada a partir de `develop`.

## 1. Enum e constante

- [ ] 1.1 `enums/PlanoAssessoria.java`: adicionar `SCALE` ao enum (mantém ordem
      `GRATUITO, BASIC, PRO, ENTERPRISE, SCALE`).
- [ ] 1.2 `services/impl/CoachSignupServiceImpl.java:57`: `MAX_ATLETAS_BASIC` de `10` para `20`.
      `MAX_TECNICOS_BASIC` permanece `1`.

## 2. Migration

- [ ] 2.1 `V83__widen_chk_plano_add_scale_e_gratuito.sql`: `ALTER TABLE tb_assessoria DROP CONSTRAINT
      chk_plano; ALTER TABLE tb_assessoria ADD CONSTRAINT chk_plano CHECK (plano IN ('GRATUITO',
      'BASIC', 'PRO', 'ENTERPRISE', 'SCALE'));` (nome exato da constraint e da tabela conferidos em
      `V2__Add_multi_tenancy_support.sql:52` antes de escrever — usar o nome real, não assumir).
      Aditivo — nenhuma linha existente viola o novo CHECK (só amplia os valores aceitos).

## 3. Testes

- [ ] 3.1 `CoachSignupServiceImplTest.java:155`: `assertThat(a.getMaxAtletas()).isEqualTo(10)` →
      `isEqualTo(20)`.
- [ ] 3.2 Novo teste (mesma classe ou `AssessoriaSettingsServiceImplTest`): persistir uma `Assessoria`
      com `plano = PlanoAssessoria.SCALE` e confirmar que salva sem violar o CHECK nem o
      `@Enumerated(EnumType.STRING)`.
- [ ] 3.3 Rodar `AssessoriaMapperTest`, `AssinaturaServiceImplTest`, `AssessoriaSettingsControllerTest`
      — confirmar que nenhum deles fixa `10` como valor esperado de `maxAtletas` para BASIC fora do
      teste já corrigido em 3.1 (buscar antes de rodar: `grep -rn maxAtletas.*10` na suíte).

## 4. Fechamento

- [ ] 4.1 `./mvnw clean test` — suíte completa.
- [ ] 4.2 Conferir manualmente (ou via teste de integração já existente) que um auto-cadastro público
      via `CoachSignupController` termina com `maxAtletas = 20` (AC1).
