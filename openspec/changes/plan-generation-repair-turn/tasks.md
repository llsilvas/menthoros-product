## 0. Pré-requisitos e verificação de API

- [x] 0.1 `.messages(...)` do `ChatClient` confirmado por bytecode (1ª rodada do pré-mortem). O
      mecanismo que quebrava a igualdade de prefixo — `BeanOutputConverter` injetando `OUTPUT_FORMAT`
      na última `UserMessage` via `ChatModelCallAdvisor.augmentWithFormatInstructions` — também já
      identificado e corrigido na Decisão 1/3 (abandona `.responseEntity`, task 4.0). Esta task é a
      **dupla checagem**: capturar o `Prompt` serializado real das tentativas 1 e 2 (via `ChatModel`
      mockado no ponto de transporte, ou advisor de log temporário) e confirmar que o prefixo
      `system + user original` é byte-idêntico agora que `.call().content()` não aciona nenhum
      advisor de formato. Se ainda divergir, algo na cadeia default do `ChatClient` continua tocando
      as mensagens e a Decisão 1 precisa de outra volta.
      `verify:` teste captura o `Prompt` real das duas tentativas; prefixo comum é byte-idêntico.
      **Feito** (`ChatClientRepairTurnPrefixSpikeTest`, `config/external`): `ChatClient` real via
      `MultiModelConfig.clienteDeRota` (cadeia de advisors default incluída), só `ChatModel`
      mockado — 1 teste verde confirma prefixo `system+user` byte-idêntico sem `.responseEntity`.
- [x] 0.2 DoR: `spec-reviewer` (READY) + Codex adversarial (NOT READY → corrigido: task 4.2
      reescrita para não mockar `ChatClient` — só `ChatModel`, preservando a cadeia real de
      advisors; task 6.2 corrigida — `AssistantMessage` não desaparece, mede-se volume total vs.
      cacheado; task 6.5 nova cobrindo revalidação íntegra; Open Question do JSON completo fechada
      como Decisão 6 do design.md) — READY em 2026-09-14.

## 1. `RepairTurnMessageBuilder` — passo puro, TDD

- [ ] 1.1 `record Violacao` (reaproveitar `ai/ledger/Violacao`, sem duplicar tipo).
- [ ] 1.2 `RepairTurnMessageBuilder.construirCorrecao(List<Violacao>)` — 1 violação, N violações,
      violação com mensagem vazia (defensivo), lista vazia (não deveria ser chamado, mas não deve
      lançar).
      `verify:` `RepairTurnMessageBuilderTest` — todos os casos, sem mock.

## 2. `PlanoResilienceService` — `Tentativa` carrega histórico

- [ ] 2.1 `record Tentativa(int numero, String promptOriginal, @Nullable String jsonAnterior,
      List<Violacao> violacoesAnteriores)` substitui `record Tentativa(int numero, String prompt)`.
- [ ] 2.2 `gerarComResiliencia` para de reescrever `prompt` como string concatenada — monta o
      `Tentativa` novo com o estado bruto da tentativa anterior (json + violações), sem truncar em
      300 chars.
- [ ] 2.3 A função `gerar` passada por `IaServiceImpl` muda de `Function<Tentativa,
      PlanoSemanalLlmDto>` para `Function<Tentativa, ChamadaLlm>` (`record ChamadaLlm(PlanoSemanalLlmDto
      entidade, String jsonBruto)`) — `gerarComResiliencia` devolve `entidade` ao chamador final,
      mas repassa `jsonBruto` para a próxima `Tentativa` em caso de retry.
      `verify:` `PlanoResilienceServiceTest` adaptado — os testes existentes continuam verdes com a
      nova assinatura; teste novo: 2ª tentativa recebe `jsonAnterior` não-nulo e
      `violacoesAnteriores` não-vazia quando a 1ª falha.
- [ ] 2.4 Falha de `PARSE_ERROR`/infra na 1ª tentativa não gera 2ª tentativa nenhuma — a exceção do
      `gerar` propaga fora do `catch` de retry (`PlanoResilienceService:116`), como hoje. Correção
      de wording pós pré-mortem: não é "2ª tentativa com comportamento antigo", é "não há 2ª
      tentativa nesse caminho" — comportamento inalterado, só documentado corretamente.
      `verify:` teste existente de `PlanoResilienceServiceTest` (`:171` "falha de geração propaga")
      continua verde sem alteração de assinatura quebrar o caminho.

## 3. `PlanoLlmValidator` — coletar violações de TODOS os treinos (achado do pré-mortem)

- [ ] 3.0 `validarENormalizarPlano:60-62` troca `.stream().map(normalizar).toList()` por um laço que
      tenta `normalizar` em cada treino, acumula os que passam e coleta uma `Violacao` por treino
      que lançar `LLMException` — sem abortar no primeiro. Ao fim, se houver 1+ violação, lança
      `PlanoNaoConformeException` com a lista completa (unifica o tipo com o que o compliance do
      planner já usa, em vez de manter `LLMException` de uma violação só).
      `verify:` teste com 2 treinos inválidos no mesmo plano → exceção carrega 2 `Violacao`, uma por
      dia da semana; teste com 1 treino inválido continua funcionando (lista de 1).
- [ ] 3.1 Confirmar que `NormalizacaoDeTreino` não muda — continua abortando na 1ª violação **dentro**
      de um treino (F2.5, não reaberto).
      `verify:` `git diff --stat` não lista `NormalizacaoDeTreino.java`.

## 4. `IaServiceImpl` — monta a conversa multi-mensagem

- [ ] 4.0 Trocar `.call().responseEntity(PlanoSemanalLlmDto.class)` (`:159`) por
      `.call().content()` + `objectMapper.readValue(json, PlanoSemanalLlmDto.class)` — remove
      `BeanOutputConverter`/`ChatModelCallAdvisor` do caminho (achado da 2ª rodada do pré-mortem:
      o converter injeta texto de formato na última `UserMessage`, quebrando a igualdade de prefixo
      entre tentativas). **Guarda de nulo/vazio obrigatória** (achado da 3ª rodada): `content() ==
      null || isBlank()` não chama `readValue` — devolve entidade `null` (igual ao
      `.getEntity()` nulo de hoje, que atravessa `gerar` sem lançar e só é rejeitado, retry-elegível,
      dentro de `validar`). Só JSON não-vazio malformado lança `JsonProcessingException` dentro de
      `gerar`, sem retry — mesmo comportamento de hoje.
      `verify:` teste com resposta válida → mesmo `PlanoSemanalLlmDto` de antes; teste com
      `content()` nulo/vazio → entidade nula chega a `validar` e dispara o retry existente (não
      lança dentro de `gerar`); teste com JSON malformado não-vazio → lança sem retry (task 2.4).
- [ ] 4.1 Captura do texto bruto (`content()`, já disponível pela task 4.0) junto da entidade
      parseada; constrói `ChamadaLlm`.
- [ ] 4.2 Quando `t.numero() == 1`: comportamento atual (`system(system).user(t.promptOriginal())`).
      Quando `t.numero() > 1`: `chatClient.prompt().messages(SystemMessage(system),
      UserMessage(t.promptOriginal()), AssistantMessage(t.jsonAnterior()),
      UserMessage(repairTurnMessageBuilder.construirCorrecao(t.violacoesAnteriores())))`.
      **Atenção (achado do DoR, 2026-09-14):** o `ArgumentCaptor` aqui é um teste de **wiring**
      (confirma que `IaServiceImpl` monta a lista certa de mensagens) — mockar o `ChatClient`
      inteiro bypassa a cadeia de advisors (`ChatModelCallAdvisor`), então **não** prova a
      igualdade de prefixo serializado; isso é o que a task 0.1 prova, com `ChatModel` mockado e o
      `ChatClient`/advisor chain reais. As duas tasks são complementares, não substitutas.
      `verify:` `ArgumentCaptor<Prompt>` sobre o `ChatClient` **mockado** confirma as 4 mensagens na
      2ª tentativa, na ordem certa, com o conteúdo `system`/`user` originais idêntico ao da 1ª
      (igualdade de string, não de prefixo serializado — isso é a task 0.1).
- [ ] 4.3 Agregação de violações no `validar` (Decisão 4 do design.md, revisada): `validarENormalizarPlanoGerado`
      lança `PlanoNaoConformeException` com N violações (uma por treino malformado, task 3.0); se
      passar e `aplicarComplianceEstagio1` lançar → N violações do compliance. Sem tentar rodar os
      dois quando o primeiro já falhou.
      `verify:` teste com 2 treinos estruturalmente inválidos chegando como 2 `Violacao` ao builder
      (não mais só o primeiro); teste com 3 violações do compliance chegando completas.
- [ ] 4.4 **Revalidação íntegra do reparo** (achado do DoR, 2026-09-14 — critério de aceite do
      proposal.md que não tinha task própria): a 2ª resposta da LLM corrige o treino apontado na
      violação da 1ª, mas introduz uma violação **diferente** num **outro** treino que passava antes.
      `validar` deve rejeitar — a revalidação roda sobre o plano inteiro devolvido pela 2ª tentativa,
      sem assumir que só o treino apontado mudou. Isso já é garantido estruturalmente por `validar`
      rodar `validarENormalizarPlanoGerado` completo sobre qualquer `p` que `gerar` devolver, mas
      não havia teste determinístico provando o cenário.
      `verify:` teste: 1ª tentativa rejeitada por violação no treino de SEGUNDA; 2ª tentativa (mock)
      devolve um plano que corrige SEGUNDA mas quebra QUINTA de um jeito novo → `validar` lança de
      novo (com a violação de QUINTA, não a de SEGUNDA), e a falha final ainda é 422, não sucesso.

## 5. Ledger

- [ ] 5.1 Verificar que fica de graça: `PlanoLlmLedgerHook.Sessao.validar:93-99` já tem dois catches —
      `PlanoNaoConformeException` grava `e.violacoes()` completo; `LLMException` genérico trunca em
      300 chars (`KEY_ESTRUTURAL`). Com a task 3.0 lançando `PlanoNaoConformeException` também para
      violação estrutural, o caminho da normalização passa a cair no catch completo automaticamente
      — sem tocar `PlanoLlmLedgerHook`. Sem migration nova — coluna `violations` já é JSONB (V94).
      `verify:` teste de `PlanoLlmLedgerHook` confirma que `violations` de uma rejeição da
      normalização (2 treinos inválidos) vem completa, não truncada — sem alterar o hook.

## 6. Validação final

- [ ] 6.1 `./mvnw clean verify` verde.
- [ ] 6.2 Medição manual de tokens (corrigida 2×, achados do DoR): o `AssistantMessage` **não**
      some — integra a 2ª chamada por design, sem 3ª tentativa para "desaparecer" nele.
      `CostTrackingAdvisor.extrairTokens` grava `input_tokens = prompt - cacheRead` (só o
      **não-cacheado**) e `cache_read_tokens` separado (`ai/cost/CostTrackingAdvisor.java:264-266`)
      — total de prompt de uma linha é sempre `input_tokens + cache_read_tokens`, nunca
      `input_tokens` sozinho.
      Num plano de teste manual, comparar `tb_llm_call` das duas linhas do mesmo `generation_request_id`:
      - Total da 1ª tentativa: `total₁ = input_tokens₁ + cache_read_tokens₁` — usar `total₁`, não
        assumir `cache_read_tokens₁ ≈ 0` (achado do DoR: a 1ª tentativa não garante cache frio, o
        tenant pode já ter cache de uma geração anterior de outro atleta com prefixo compartilhado
        via F1).
      - Critério verificável: `cache_read_tokens₂ ≈ total₁` (o prompt inteiro da 1ª, cacheado ou
        não, virou o prefixo cacheado da 2ª) **e** `input_tokens₂` (não-cacheado da 2ª) é da ordem
        do tamanho só das mensagens novas (`assistant` + correção), não do prompt inteiro de novo.
      `verify:` os dois números acima, com o valor exato de cada tentativa registrado no relatório
      da task 6.3 — não é aprovação por "não explodiu" sem referência.
- [ ] 6.3 `/qa` (code-reviewer + security-reviewer + clean-code-reviewer + Codex). Pedir ao Codex:
      o `system`/`user` original permanecem byte-idênticos entre a 1ª e a 2ª tentativa (prefixo
      cacheável intacto) mesmo com as mensagens novas acrescentadas ao fim, no request real?
- [ ] 6.4 `tasks.md` atualizado; `SPRINTS.md` (F3) marcado; arquivar via `/done` após merge.
