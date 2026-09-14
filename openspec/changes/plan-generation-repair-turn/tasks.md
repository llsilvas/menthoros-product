## 0. Pré-requisitos e verificação de API

- [ ] 0.1 `.messages(...)` do `ChatClient` confirmado por bytecode (1ª rodada do pré-mortem). O
      mecanismo que quebrava a igualdade de prefixo — `BeanOutputConverter` injetando `OUTPUT_FORMAT`
      na última `UserMessage` via `ChatModelCallAdvisor.augmentWithFormatInstructions` — também já
      identificado e corrigido na Decisão 1/3 (abandona `.responseEntity`, task 4.0). Esta task é a
      **dupla checagem**: capturar o `Prompt` serializado real das tentativas 1 e 2 (via `ChatModel`
      mockado no ponto de transporte, ou advisor de log temporário) e confirmar que o prefixo
      `system + user original` é byte-idêntico agora que `.call().content()` não aciona nenhum
      advisor de formato. Se ainda divergir, algo na cadeia default do `ChatClient` continua tocando
      as mensagens e a Decisão 1 precisa de outra volta.
      `verify:` teste captura o `Prompt` real das duas tentativas; prefixo comum é byte-idêntico.
- [ ] 0.2 DoR: `spec-reviewer` + Codex adversarial sobre `proposal.md` + `design.md` pós-correções do
      pré-mortem. Resolver a Open Question restante (JSON completo vs. só treinos reprovados no
      prompt de correção) antes de abrir a branch.

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
      `verify:` `ArgumentCaptor<Prompt>` sobre o `ChatClient` mockado confirma as 4 mensagens na 2ª
      tentativa, na ordem certa, com o `system`/`user` originais byte-idênticos à 1ª.
- [ ] 4.3 Agregação de violações no `validar` (Decisão 4 do design.md, revisada): `validarENormalizarPlanoGerado`
      lança `PlanoNaoConformeException` com N violações (uma por treino malformado, task 3.0); se
      passar e `aplicarComplianceEstagio1` lançar → N violações do compliance. Sem tentar rodar os
      dois quando o primeiro já falhou.
      `verify:` teste com 2 treinos estruturalmente inválidos chegando como 2 `Violacao` ao builder
      (não mais só o primeiro); teste com 3 violações do compliance chegando completas.

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
- [ ] 6.2 Medir `tb_llm_call.input_tokens` da 2ª tentativa antes/depois num plano de teste manual —
      confirmar que não explodiu em relação à 1ª tentativa (o `AssistantMessage` some do prompt na
      próxima chamada; só a mensagem de correção é nova).
- [ ] 6.3 `/qa` (code-reviewer + security-reviewer + clean-code-reviewer + Codex). Pedir ao Codex:
      o `system`/`user` original permanecem byte-idênticos entre a 1ª e a 2ª tentativa (prefixo
      cacheável intacto) mesmo com as mensagens novas acrescentadas ao fim, no request real?
- [ ] 6.4 `tasks.md` atualizado; `SPRINTS.md` (F3) marcado; arquivar via `/done` após merge.
