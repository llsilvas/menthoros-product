# Tasks — fix-limites-plano-basic-e-scale

Repo: `apps/menthoros-backend`. Validação a cada bloco: `./mvnw clean test`.

Branch: `feature/fix-limites-plano-basic-e-scale`, criada a partir de `develop`.

## 1. Enum e constante

- [x] 1.1 `enums/PlanoAssessoria.java`: adicionar `SCALE` ao enum (mantém ordem
      `GRATUITO, BASIC, PRO, ENTERPRISE, SCALE`). **Feito em 2c03a38.**
- [x] 1.2 `services/impl/CoachSignupServiceImpl.java:57`: `MAX_ATLETAS_BASIC` de `10` para `20`.
      `MAX_TECNICOS_BASIC` permanece `1`. **Feito em 379ea5f.**

## 2. Migration

- [x] 2.1 `V83__widen_chk_plano_add_scale_e_gratuito.sql`: `ALTER TABLE tb_assessoria DROP CONSTRAINT
      chk_plano; ALTER TABLE tb_assessoria ADD CONSTRAINT chk_plano CHECK (plano IN ('GRATUITO',
      'BASIC', 'PRO', 'ENTERPRISE', 'SCALE'));` (nome exato da constraint e da tabela conferidos em
      `V2__Add_multi_tenancy_support.sql:52` antes de escrever — usar o nome real, não assumir).
      Aditivo — nenhuma linha existente viola o novo CHECK (só amplia os valores aceitos).
      **Feito em 2c03a38.**

## 3. Testes

- [x] 3.1 `CoachSignupServiceImplTest.java:155`: `assertThat(a.getMaxAtletas()).isEqualTo(10)` →
      `isEqualTo(20)`. **Feito em 379ea5f (TDD: vermelho confirmado antes do bump em 1.2).**
- [x] 3.2 **Achado do pré-mortem (Codex):** persistir `SCALE` só via JPA num teste não prova o
      caminho de verdade — o binding do JSON no controller e o fluxo do service ficam de fora. Novo
      teste em `AssinaturaServiceImplTest` (ou `AssinaturaControllerTest`, se existir) exercitando
      `AssinaturaController.atualizarTier` / `AssinaturaServiceImpl.atualizarTier` com
      `AssinaturaTierInputDto(PlanoAssessoria.SCALE, valor)` — confirma que `PlanoAssessoria` local
      vira `SCALE` sem violar `chk_plano` nem o `@Enumerated`, cobrindo o binding do enum no JSON de
      entrada, não só a persistência direta (AC2). **Feito em 2c03a38** — `atualizaTierParaScale`,
      TDD com vermelho por erro de compilação (símbolo `SCALE` inexistente) antes do enum existir.
- [x] 3.3 Rodar `AssessoriaMapperTest`, `AssinaturaServiceImplTest`, `AssessoriaSettingsControllerTest`
      — confirmar que nenhum deles fixa `10` como valor esperado de `maxAtletas` para BASIC fora do
      teste já corrigido em 3.1 (buscar antes de rodar: `grep -rn maxAtletas.*10` na suíte). **Feito:**
      só duas ocorrências restantes (`AssessoriaSettingsControllerTest.java:77`,
      `AssessoriaSettingsServiceImplTest.java:84`), ambas fixture stubada de uma assessoria já
      existente, não dependem de `MAX_ATLETAS_BASIC` — 48 testes das 4 classes passam sem alteração.

## 4. Fechamento

- [x] 4.1 `./mvnw clean test` — suíte completa. **2845 testes, 0 falhas, 0 erros.**
- [x] 4.2 Conferir manualmente (ou via teste de integração já existente) que um auto-cadastro público
      via `CoachSignupController` termina com `maxAtletas = 20` (AC1). **Coberto por 3.1**
      (`CoachSignupServiceImplTest.planoBasic`, TDD vermelho→verde) — não há teste de integração HTTP
      separado do signup público hoje; o teste de unidade já exercita o fluxo real do service.
