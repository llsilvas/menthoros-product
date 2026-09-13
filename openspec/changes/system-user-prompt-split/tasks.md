# Tasks: system-user-prompt-split

**Status:** Reaberta 2026-09-13 (Fase 1 · Sprint 24) — pronta para implementação
**Tamanho:** S · Trilha: Fast
**Repos:** menthoros-backend (apenas), branch `feature/system-user-prompt-split` em **worktree**
**Dependências:** `add-plan-generation-ledger` (F0) ✅ arquivada, PR `menthoros-backend#117`
mergeado — só necessária para medir o gate (CA6); código desta change é independente
**DoR 2026-09-13, 2ª rodada (spec-reviewer + Codex em paralelo):** achados reais fechados nesta
revisão — placeholder `%3$s` na linha 167 do template original (bloco tratado como estático não era
100% estático), `loadRaw` inexistente (é `loadTemplate`), gate CA6 comparava retries em vez de
atletas distintos do lote, CA7 sem limiar de alerta precoce/rollback explícito. Ver `proposal.md`
para o detalhe de cada correção.

---

## 1. Separar o template em system + user (CA2, CA3)

- [x] 1.1 Criar `src/main/resources/prompts/plano-treino-system.txt`: persona (linhas 1–4) + regras
      (linhas 32–523) do original, **em PT-BR como estão**, com duas correções: (a) normalizar as
      **11 ocorrências** de `%%%` para `%` (linhas 91, 102, 153, 154, 156, 167, 169, 187, 189, 275,
      276, 277, 465, 505 do original — não só a 505); (b) reescrever a linha 167
      (`O objetivo "%3$s" determina o treino-chave da semana`) removendo o placeholder posicional
      `%3$s` — vira `O objetivo do atleta determina o treino-chave da semana` (o valor concreto já
      chega pelo `user`, seção PERFIL DO ATLETA; hoje esse placeholder já não interpola nada — vira
      o literal quebrado `%3$s` em produção, achado do Codex no DoR).
  - `verify:` teste `PromptTemplateLoaderTest`/golden falha se o arquivo contiver `%s`, `%d`, `%%`
    ou qualquer placeholder posicional (`%\d+\$`); grep confirma zero `%%%` restante no arquivo.
- [x] 1.2 Criar `src/main/resources/prompts/plano-treino-user.txt`: `### PERFIL DO ATLETA` +
      `### HISTÓRICO RECENTE` (linhas 5–30), 8 placeholders na ordem Nome, Idade, Objetivo, Nível,
      Dias, Dia preferido, Provas, Histórico.
  - `verify:` união system+user cobre todas as seções `###`/`##` do original (lista no PR).
- [x] 1.3 Poda segura das "INSTRUÇÕES CRÍTICAS - FORMATO DE SAÍDA": removidas 5 linhas, cada uma
      coberta por propriedade do schema `strict` (`buildSchemaTightInlineOrDefs`,
      `IaServiceImpl.java:156`). Tabela para o PR:

      | Linha removida | Propriedade do schema |
      |---|---|
      | "Responda APENAS com 1 objeto JSON válido / Sem texto antes ou depois / Sem explicações" | `response_format.type=JSON_SCHEMA` + `strict:true` — a API já restringe a geração a exatamente o schema, não há como o modelo emitir texto fora do JSON |
      | "NÃO inclua campos extras além dos listados" | `additionalProperties:false`, exigido pela própria OpenAI para `strict:true` funcionar |
      | "Máximo 5 treinos, mínimo 3 treinos" (dentro de "Garantia de completude") | `treinosPlanejados.minItems=3` / `maxItems=5` |
      | "Array etapas NUNCA vazio" | `etapas.minItems=2` |
      | "Cada etapa com todos os campos obrigatórios" | `enforceAllRequired(etapaItems)` → `required` com todas as chaves |
      | "repeticoes: 1 em cada etapa da série" | `reps.put("const", 1)` |

      **Mantido de propósito** (achado do Codex no DoR — `required` permite string vazia,
      `ritmoAlvo` da etapa aceita `null` via `anyOf`): "NÃO deixe campos vazios", "NÃO use null",
      "NÃO use travessão", "NÃO use reticências", "100% completos (último treino também)", formato
      de números (schema não valida casas decimais), mínimo de 7 etapas no intervalado (schema só
      garante `minItems=2` genérico), `ordem` sequencial (schema só garante `minimum=1`), expansão
      de tiros (contagem, não estrutura JSON).
  - `verify:` `IaServiceImplSchemaTest` continua verde (schema inalterado nesta task — só o
      template mudou); `PlanoTreinoPromptTemplatesTest` novo confirma CA2/CA3.
- [ ] 1.4 Manter `plano-treino-otimizado-claude.txt` até o golden ser re-baselined; remover depois
      de 4.1 (`grep -rl` para confirmar ausência de consumidores).

## 2. Builder retorna system + user (CA1)

**Refinado contra o código real (init 2026-09-13):** `PromptGerado` hoje é um record aninhado em
`PlanoTreinoPromptBuilder` — `record PromptGerado(String prompt, List<Constraint> regras) {}`
(linha 394), único consumidor é `IaServiceImpl.geraPlanoSemanalAvancado` (linhas 339, 370). O `%s`
de "Histórico" (linha 23 do template, 8º argumento de `loadAndFormat`) já recebe TODO o contexto
dinâmico computado em Java (`historicoFinal` — regras, slots do planner, alertas obrigatórios,
hierarquia de decisão, evento competitivo, restrições, dados fisiológicos, readiness, métricas,
histórico de treinos, etc.), não só uma lista curta de treinos — confirma que as linhas 5–30 do
arquivo são de fato o bloco 100% dinâmico e 32–523 é o único candidato a `system`.
`PromptHashCalculator` já lê o nome do template de `app.llm.plano.template` (`@Value` com default
`plano-treino-otimizado-claude.txt`, sem override em nenhum `application*.yml`) — não precisa de
mudança de código, só de config (task 2.4).

- [ ] 2.1 `PromptGerado(String system, String user, List<Constraint> regras) {}`;
      `buildOptimizedPrompt` carrega o `system` cru via `PromptTemplateLoader.loadTemplate(...)`
      (método público já existente — lê e cacheia sem `escapeTemplate`/`String.format`; **não**
      existe `loadRaw` na classe, não criar) e formata só o `user` via
      `templateLoader.loadAndFormat("plano-treino-user.txt", nome, idade, objetivo, nivel, dias,
      diaPreferidoLongo, provas, historicoFinal.toString())` — mesmos 8 argumentos, mesma ordem, só
      troca o nome do arquivo-fonte.
  - `verify:` teste unitário: `system` sem placeholders; `user` com perfil/histórico formatados.
- [ ] 2.2 `PromptVersion.CURRENT = "plano-v2"` (constante da Fase 0; criar aqui se a Fase 0 ainda
      não estiver em `develop` — **já está**, ver header desta task.md).
- [ ] 2.3 `application.yml`: `app.llm.plano.template: plano-treino-system.txt` (hoje sem entrada,
      usa o default da `@Value` em `PromptHashCalculator`; sem isso o hash continuaria do arquivo
      antigo depois do split).
  - `verify:` `PromptHashCalculatorTest` (se existir) ou log de startup `[llm-ledger] prompt_hash`
      aponta para `plano-treino-system.txt`.
- [ ] 2.4 `./mvnw clean test` do pacote `services/prompt`.

## 3. IaServiceImpl e resiliência (CA1, CA4)

**Refinado contra o código real:** `PlanoResilienceService.gerarComResiliencia` recebe hoje
`Function<Tentativa, PlanoSemanalLlmDto> gerar` + `String promptBase`; `Tentativa(int numero,
String prompt)` carrega só o texto que varia por tentativa. **Não precisa mudar a assinatura
pública de `PlanoResilienceService`** — `promptBase` passa a ser só o `user` (o que já hoje é
"o prompt", já que não existe `system`); o `system` fica capturado por variável local no escopo de
`geraPlanoSemanalAvancado` (que já monta o `promptGerado` antes do lambda) e vai direto no
`chatClient.prompt().system(...)` dentro do lambda `gerar`, sem passar pelo `PlanoResilienceService`
— exatamente o que CA4 pede (`system` nunca entra no que o retry reescreve) com a menor mudança de
contrato possível.

- [ ] 3.1 `geraPlanoSemanalAvancado`: capturar `promptGerado.system()` em variável local; dentro do
      lambda de `sessao.chamar(...)` (linha ~354), trocar `chatClient.prompt().user(t.prompt())`
      por `chatClient.prompt().system(promptGerado.system()).user(t.prompt())`; chamar
      `gerarComResiliencia(gerar, validar, promptGerado.user())` (era `prompt` → agora `user()`).
      `defaultJsonSchemaOptions()`, `ModelRouter`, `ledgerHook.novaSessao()` inalterados.
- [ ] 3.2 `PlanoResilienceService` **sem alteração de assinatura** — o feedback de correção
      (`## CORRECAO OBRIGATORIA`, linha 111-114 do serviço) já é concatenado só ao `promptBase`, que
      agora é o `user`; o `system` nunca passa pelo `PlanoResilienceService`, então já nasce
      byte-idêntico entre tentativas por construção.
  - `verify:` `PlanoResilienceServiceTest` continua verde sem alteração (contrato não mudou); teste
      novo em `IaServiceImplTest` (ou onde for adicionado) confirma `.system(...)` chamado com o
      mesmo valor nas duas tentativas do lambda.
- [ ] 3.3 Caminho legado `gerarPlanoSemanal` (linha 296) intocado (CA8) — continua usando
      `promptBuilder.buildRequest(...)` (método separado, já retorna `String`, não `PromptGerado`).
      `./mvnw clean test`.

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
- [ ] 5.3 Pós-merge (gate CA6): após o primeiro lote de ≥ 5 atletas **distintos** em produção,
      executar a consulta em `tb_llm_call` que pega a **1ª tentativa** (`tentativa = 1`) da rota
      `plano` de cada atleta do lote, ordena por `created_at` e calcula a mediana de
      `cached_tokens/prompt_tokens` a partir da 2ª linha em diante (**não** agrupar por
      `generation_request_id`, que isolaria retries do mesmo atleta em vez de comparar atletas
      distintos). Registrar também a duração/cadência real do lote (intervalo entre chamadas
      consecutivas do mesmo tenant, para checar se ficou dentro do TTL de cache de ~5 min). Anotar
      o resultado no `SPRINTS.md`. Se < 0,60, investigar prefixo (byte diff do `system` entre
      chamadas) antes de qualquer próxima fase.
- [ ] 5.4 Pós-merge (alerta precoce CA7, não esperar as duas semanas completas): nos primeiros 2–3
      dias, comparar taxa de retry e de `REJEITADO` de `plano-v2` contra a baseline de `plano-v1`
      (mesma janela). Se piorar ≥ 20% relativo, investigar antes do prazo de duas semanas. Sem flag
      nesta change — a reversão, se necessária, é `git revert` do PR de merge.
