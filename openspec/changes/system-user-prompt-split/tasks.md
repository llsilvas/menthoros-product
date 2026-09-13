# Tasks: system-user-prompt-split

**Status:** Reaberta 2026-09-13 (Fase 1 · Sprint 24) — pronta para implementação
**Tamanho:** S · Trilha: Fast
**Repos:** menthoros-backend (apenas), branch `feature/system-user-prompt-split` em **worktree**
**Dependências:** `add-plan-generation-ledger` só para medir o gate (CA6); código independente

---

## 1. Separar o template em system + user (CA2, CA3)

- [ ] 1.1 Criar `src/main/resources/prompts/plano-treino-system.txt`: persona (linhas 1–4) + regras
      (linhas 32–523) do original, **em PT-BR como estão**; corrigir `100%%%` → `100%`.
  - `verify:` teste `PromptTemplateLoaderTest` falha se o arquivo contiver `%s`, `%d` ou `%%`.
- [ ] 1.2 Criar `src/main/resources/prompts/plano-treino-user.txt`: `### PERFIL DO ATLETA` +
      `### HISTÓRICO RECENTE` (linhas 5–30), 8 placeholders na ordem Nome, Idade, Objetivo, Nível,
      Dias, Dia preferido, Provas, Histórico.
  - `verify:` união system+user cobre todas as seções `###`/`##` do original (lista no PR).
- [ ] 1.3 Poda segura das "INSTRUÇÕES CRÍTICAS - FORMATO DE SAÍDA": remover só o que o schema
      `strict` garante, com tabela no PR `linha removida → propriedade do schema`
      (`buildSchemaTightInlineOrDefs`). Manter hífen/travessão, reticências, mínimo de 7 etapas,
      expansão de tiros, `ordem` sequencial.
  - `verify:` `IaServiceImplSchemaTest` confirma cada propriedade citada na tabela.
- [ ] 1.4 Manter `plano-treino-otimizado-claude.txt` até o golden ser re-baselined; remover depois
      de 4.1 (`grep -rl` para confirmar ausência de consumidores).

## 2. Builder retorna system + user (CA1)

- [ ] 2.1 `PromptGerado(String system, String user, List<Constraint> regras)`;
      `buildOptimizedPrompt` carrega o `system` cru (`PromptTemplateLoader.loadRaw`) e formata só o
      `user` (`loadAndFormat` + `escapeTemplate`).
  - `verify:` teste unitário: `system` sem placeholders; `user` com perfil/histórico formatados.
- [ ] 2.2 `PromptVersion.CURRENT = "plano-v2"` (constante da Fase 0; criar aqui se a Fase 0 ainda
      não estiver em `develop`).
- [ ] 2.3 `./mvnw clean test` do pacote `services/prompt`.

## 3. IaServiceImpl e resiliência (CA1, CA4)

- [ ] 3.1 `geraPlanoSemanalAvancado`: `chatClient.prompt().system(system).user(user).options(...)`.
      `defaultJsonSchemaOptions()`, `PlanoResilienceService` e `ModelRouter` inalterados.
- [ ] 3.2 `PlanoResilienceService.gerarComResiliencia` passa a receber `system` e `user` separados
      (ou o `PromptGerado`) e anexa o feedback de correção ao **fim do `user`**.
  - `verify:` `PlanoResilienceServiceTest`: `system` byte-idêntico nas duas tentativas; feedback
      presente só no `user` da 2ª.
- [ ] 3.3 Caminho legado `gerarPlanoSemanal` intocado (CA8). `./mvnw clean test`.

## 4. Golden-master (CA5)

- [ ] 4.1 `PlanoTreinoPromptBuilderGoldenTest`: um `golden/plano-prompt/system.txt` + cinco
      `<arquetipo>.user.txt`; chamar a sobrecarga de **8 argumentos** com `decisaoProgressao`,
      `revisaoConsumida` e `skeleton` nulos; gerar `prompt.sha256` do `system`. Regenerar com
      `-Dgolden.update=true`, **revisar o diff manualmente** e documentar no commit.
- [ ] 4.2 `IaServiceImplFcValidationTest`, `IaServiceImplComplianceEstagio1Test` e
      `PlanQualityCheckerTest` verdes sem alteração.
- [ ] 4.3 Validação ponta a ponta local (chave OpenAI de dev): 2 planos reais → DTO válido; segunda
      geração do mesmo tenant em < 10 min mostra `cachedTokens > 0` no `[llm-usage]`.
- [ ] 4.4 `./mvnw clean verify` verde.

## 5. QA e entrega

- [ ] 5.1 `/qa` Fast: `code-reviewer` + `clean-code-reviewer`; atenção ao CA2 (tabela de poda) e ao
      diff do golden.
- [ ] 5.2 PR `feature/system-user-prompt-split` → `develop`; corpo com a tabela de poda e o diff
      resumido do golden.
- [ ] 5.3 Pós-merge (gate CA6): após o primeiro lote de ≥ 5 atletas em produção, executar a
      consulta em `tb_llm_call` (mediana `cached_tokens/prompt_tokens` das chamadas 2..N por
      `generation_request_id` ordenado por `created_at`) e registrar o resultado no `SPRINTS.md`.
      Se < 0,60, investigar prefixo (byte diff do `system` entre chamadas) antes de qualquer
      próxima fase.
