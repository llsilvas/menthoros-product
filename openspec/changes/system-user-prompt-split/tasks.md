# Tasks: system-user-prompt-split

**Status:** Proposed
**Tamanho:** S · Trilha: Fast
**Repos:** menthoros-backend (apenas)
**Dependências:** nenhuma

---

## 1. Separar o template em system + user

- [ ] 1.1 Criar `src/main/resources/prompts/plano-treino-system.txt` — **100% estático** (sem `%s`/`%d`): persona (linhas 1–4 do original) + todo o bloco de regras/estrutura/enums/checklist/instruções de saída (linhas 32–522). Ordem: persona primeiro, depois as regras.
  - `verify:` `grep -c "%s\|%d"` no arquivo retorna 0 (CA3).
- [ ] 1.2 Criar `src/main/resources/prompts/plano-treino-user.txt` — **dinâmico**: `### PERFIL DO ATLETA` + `### HISTÓRICO RECENTE` (linhas 5–30 do original), preservando exatamente os 8 placeholders na mesma ordem que `buildOptimizedPrompt` formata (Nome %s, Idade %d, Objetivo %s, Nível %s, Dias %s, Dia preferido %s, Provas %s, Histórico %s).
  - `verify:` união de system+user cobre todas as seções `###` do original (CA2) — diff manual das seções.
- [ ] 1.3 Manter `plano-treino-otimizado-claude.txt` original **até** o golden-master ser re-baselined (evita quebrar o build no meio). Remover só após 3.x, se não houver outro consumidor.
  - `verify:` `grep -rl "plano-treino-otimizado-claude" src/main` — confirmar consumidores antes de remover.

## 2. `PlanoTreinoPromptBuilder` retorna system + user

- [ ] 2.1 Estender o retorno de `buildOptimizedPrompt` para expor **as duas partes**: system (carregado do novo recurso estático, sem `String.format`) + user (formatado com os 8 args via `templateLoader.loadAndFormat("plano-treino-user.txt", ...)`). Ex.: `PromptGerado` ganha `systemPrompt()` além de `prompt()`/`userPrompt()`, ou novo record `PromptSystemUser(system, user, regras)`.
  - System não passa por `String.format` (sem placeholders → sem escaping); user mantém o `escapeTemplate` + format atuais.
- [ ] 2.2 Teste unitário do builder: `buildOptimizedPrompt` retorna system sem `%s/%d` e user com o perfil/histórico formatados; a concatenação preserva o conteúdo esperado.
- [ ] 2.3 Validação: `./mvnw clean test` do builder.

## 3. `IaServiceImpl` envia `.system(...).user(...)`

- [ ] 3.1 Em `geraPlanoSemanalAvancado`: trocar `chatClient.prompt().user(p)...` por `chatClient.prompt().system(system).user(user).options(...).call()...`. Manter `defaultJsonSchemaOptions()`, o `PlanoResilienceService` e o `ModelRouter.route(TaskComplexity.PLANO)` (segue GPT-4o).
- [ ] 3.2 `IaServiceImpl.gerarPlanoSemanal` (legado) **não** é alterado (CA5).
- [ ] 3.3 Validação: `./mvnw clean test`.

## 4. Golden-master + não-regressão

- [ ] 4.1 Re-baseline do `PlanoTreinoPromptBuilderGoldenTest` para a nova estrutura (system + user por arquétipo). **Revisar manualmente** o diff — a mudança é intencional (reordenação estático→system), não deve haver perda de seção. Documentar no commit o que mudou.
- [ ] 4.2 Confirmar que `IaServiceImplFcValidationTest` (validação pós-geração) continua verde.
- [ ] 4.3 Validação de ponta-a-ponta (manual, se houver ambiente com chave OpenAI): gerar 1–2 planos reais → schema `PlanoSemanalLlmDto` válido, qualidade equivalente (deferível para staging se sem chave local).
- [ ] 4.4 `./mvnw clean test` — suíte inteira verde.

## 5. QA e entrega

- [ ] 5.1 `./mvnw clean test` verde.
- [ ] 5.2 QA (Fast track): `code-reviewer` + `clean-code-reviewer` sobre o diff; opcional `/codex:review`. Atenção especial ao CA2 (nenhuma instrução perdida) e ao golden re-baseline.
- [ ] 5.3 Abrir PR (`feature/system-user-prompt-split`) → `develop`.
