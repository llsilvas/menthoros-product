## ADDED Requirements

### Requirement: Persistir execuções de skill para auditoria
O sistema SHALL persistir o resultado de cada execução de skill relevante em `tb_skill_execution`, incluindo versão, severidade, confiança, payload integral e evidências.

#### Scenario: Persistência após execução bem-sucedida
- **WHEN** uma skill executar com sucesso e produzir resultado com `severity != NONE`
- **THEN** o sistema SHALL persistir uma `SkillExecution` com todos os campos preenchidos
- **THEN** `payload_json` SHALL conter o resultado completo serializado da skill

#### Scenario: Execução associada a treino realizado
- **WHEN** o contexto da skill incluir um `TreinoRealizado`
- **THEN** `SkillExecution.treinoRealizadoId` SHALL ser preenchido para rastreabilidade

#### Scenario: Execução associada a geração de plano
- **WHEN** a skill for executada durante a geração de plano semanal
- **THEN** `SkillExecution.planoSemanalId` SHOULD ser preenchido após persistência do plano

#### Scenario: Skill não aplicável
- **WHEN** `DomainSkill.isApplicable()` retornar `false`
- **THEN** o sistema NÃO SHALL persistir execução (sem registro de não-aplicabilidade por padrão)

---

### Requirement: Isolamento multi-tenant nas execuções de skill
O sistema SHALL garantir que execuções de skill sejam isoladas por tenant.

#### Scenario: Query de execuções por atleta
- **WHEN** qualquer serviço buscar execuções de skill de um atleta
- **THEN** a query SHALL filtrar por `tenant_id` além de `atleta_id`

---

### Requirement: Suportar versionamento de skills
O sistema SHALL registrar `skill_key` e `skill_version` em cada execução para permitir comparação entre versões.

#### Scenario: Evolução de uma skill
- **WHEN** uma skill evoluir da versão `1.0.0` para `1.1.0`
- **THEN** as execuções antigas (v1.0.0) SHALL permanecer no banco sem alteração
- **THEN** execuções novas SHALL registrar `skill_version = "1.1.0"`
- **THEN** será possível comparar resultados das duas versões via query em `tb_skill_execution`
