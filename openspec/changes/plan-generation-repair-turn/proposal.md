**Tamanho:** M · **Trilha:** Full

## Why

Hoje o retry da geração de plano semanal (`PlanoResilienceService.gerarComResiliencia`,
`services/helper/PlanoResilienceService.java:82-132`) não é reparo — é regeneração do zero. A 2ª
tentativa reenvia `system` idêntico (cache de prefixo intacto, F1) + um `user` novo:
`promptBase + "\n\n## CORRECAO OBRIGATORIA...\nMotivo: " + motivo`, onde `motivo` é a mensagem da
**primeira** exceção truncada em 300 caracteres (`:137-142`). O JSON que a LLM gerou na 1ª tentativa
nunca volta — nem como contexto, nem para o modelo comparar contra o que pediu para corrigir. O
modelo relê o prompt base inteiro (regras, histórico, esqueleto do planner) e tenta de novo do
zero, cego ao que fez.

Duas consequências mensuráveis:

1. **Custo.** Com cache quente (F1), um turno de reparo que só acrescenta mensagens ao fim custaria
   quase só a saída — hoje a 2ª tentativa paga de novo o `user` completo (as ~12k tokens de contexto:
   histórico, zonas, esqueleto). Ainda cacheado pelo prefixo comum, mas processado de novo.
2. **Taxa de sucesso do retry.** Um motivo truncado em 300 chars perde toda violação depois da
   primeira quando `PlanoNaoConformeException` carrega várias (`domain/compliance/PlanoNaoConformeException`,
   via `List<Violacao>`) — o `PlannerComplianceChecker` frequentemente produz 2+ violações na mesma
   tentativa, e só a primeira chega ao prompt de correção. O mesmo problema existe um nível abaixo,
   de forma mais grave: `PlanoLlmValidator.validarENormalizarPlano` percorre os treinos da semana com
   `.stream().map(normalizar).toList()` (`:60-62`), que **aborta no primeiro treino inválido de toda
   a semana** — se 2 treinos estiverem malformados, o 2º nunca é avaliado nessa passada, mesmo que a
   `NormalizacaoDeTreino` continue corretamente abortando na 1ª violação **dentro** de cada treino
   (F2.5, decisão mantida). Com só 2 tentativas no total, isso pode esgotar o orçamento sem o modelo
   nunca ver o 2º treino quebrado (achado do pré-mortem desta change, 2026-09-14).

A F2.5 (`pipeline-normalizacao-treino`) preparou o terreno: a violação nasce com o nome do passo que
a detectou (`"Treino %s inválido: ..."` em `NormalizacaoDeTreino`, mensagens específicas por gate). O
tipo `Violacao(String key, String mensagem)` (`ai/ledger/Violacao.java`) já existe e já é o formato
comum entre `PlannerViolation` e `ViolacaoQualidade` — só falta ele viajar completo até o prompt.

## What Changes

**Turno de reparo, não regeneração.** Na 2ª tentativa, a conversa enviada ao modelo passa a ser
`[system, user(prompt original), assistant(JSON da 1ª tentativa), user(violações completas +
"corrija exatamente isto, mantendo o resto")]`, em vez de um novo `user` monolítico.

1. **`PlanoResilienceService.Tentativa` ganha o histórico.** Hoje é `record Tentativa(int numero,
   String prompt)`. Passa a carregar a saída da tentativa anterior (`String jsonAnterior`, nullable
   na 1ª) e a lista de violações que a reprovou (`List<Violacao>`, vazia na 1ª) — chega tipada, sem
   truncar em 300 chars.
2. **`IaServiceImpl.geraPlanoSemanalAvancado` monta a conversa por mensagens.** A chamada abandona
   `.call().responseEntity(Class)` — cujo `BeanOutputConverter` embutido injeta texto de formato na
   **última** `UserMessage` da conversa (confirmado por bytecode do Spring AI 1.1.6, pré-mortem 2ª
   rodada), o que quebraria a igualdade de prefixo assim que a 2ª tentativa passar a ter uma `user`
   depois da original — e passa a usar `.call().content()` + parse manual com `ObjectMapper` (ver
   design.md, Decisão 1 e 3). O texto bruto fica disponível de graça. `numero > 1` usa
   `chatClient.prompt().messages(system, userOriginal, [assistant, userCorrecao])` em vez de
   `.system(...).user(...)` simples.
3. **A validação de estrutura passa a percorrer TODOS os treinos antes de decidir, não abortar no
   primeiro.** `PlanoLlmValidator.validarENormalizarPlano` hoje usa `.stream().map(normalizar).toList()`
   (`:60-62`) — o `Stream` aborta no 1º treino inválido de toda a semana, e os demais nunca são
   avaliados nessa passada. Passa a percorrer todos, coletando uma `Violacao` por treino que falhar,
   e lançar `PlanoNaoConformeException` com a lista completa só ao fim (achado do pré-mortem,
   2026-09-14 — a versão original prometia "todas as violações" sem isso, o que era falso quando
   2+ treinos estavam malformados). `NormalizacaoDeTreino` continua abortando na 1ª violação **dentro**
   de um treino (F2.5, decisão mantida — não reabre a receita).
4. **Ledger:** a coluna `violations` JSONB de `tb_llm_call` já aceita `[{key,mensagem}]` — passa a
   gravar a lista completa por tentativa, não só a primeira truncada.

**Fora de escopo, de propósito:**
- **`PlanQualityChecker` dentro do loop.** A ideia original (entrar no retry só quando já havia
  violação estrutural na mesma tentativa) era logicamente inalcançável — o checker só roda depois
  que os validadores estruturais passam sem lançar, então essa condição nunca é verdadeira (achado
  do pré-mortem). Rodar o checker independente do resultado estrutural e decidir se ele sozinho
  bloqueia é decisão de produto (era a "opção A" que já estava fora de escopo). Continua exatamente
  como hoje: fora do loop, só métrica. Candidato a change própria depois de medir a F3.
- A tool `validar_plano` (auto-checagem antes do `end_turn`) — mencionada no roadmap como opcional;
  fica para depois que o turno de reparo simples estiver medido.
- Mudar o teto de 2 tentativas ou o orçamento de 100s (`PlanoResilienceService:48,59`).
- Qualquer coisa em `semantic-session-schema` (F4) — o contrato de saída (DTO v1) não muda aqui.
- **Nenhuma exposição ao coach** de que um plano passou por reparo — sem flag/badge na UI. O
  `attempt > 1` já fica no ledger (`tb_llm_call`) para auditoria interna; isso é observabilidade,
  não produto, nesta change (product-review, 2026-09-14). Se o coach precisar saber, é change própria.

## Critérios de aceite

- **Given** a 1ª tentativa gera um plano que a `NormalizacaoDeTreino` rejeita por um treino
  específico, **when** a 2ª tentativa roda, **then** o `user` da 2ª mensagem inclui o JSON completo
  da 1ª tentativa como mensagem `assistant` e a violação exata (chave + mensagem), não um resumo.
- **Given** a 2ª tentativa (reparo) devolve um plano, **when** ele é validado, **then** a validação
  roda **completa** sobre o plano inteiro (normalização + compliance), sem assumir que só os
  treinos apontados como violação mudaram — o modelo pode ter alterado algo mais ao "corrigir",
  e essa revalidação total é o que impede um falso positivo de correção chegar ao coach.
- **Given** a `PlannerComplianceChecker` produz 3 violações na mesma tentativa, **when** o prompt de
  correção é montado, **then** as 3 aparecem na mensagem de correção, não só a primeira.
- **Given** o plano tem 2 treinos estruturalmente inválidos na mesma tentativa, **when** a
  normalização roda, **then** a exceção carrega as 2 violações (uma por treino), não só a do
  primeiro treino avaliado — corrigindo o `.stream().map().toList()` que aborta cedo hoje.
- **Given** o `system` é byte-idêntico entre tentativas (invariante de F1), **when** o turno de
  reparo monta a 2ª mensagem, **then** o prefixo cacheável (`system` + `user` original) não muda de
  posição nem de conteúdo no request **serializado real** enviado ao provedor — não só na string
  Java que `IaServiceImpl` monta — confirmado por bytecode (pré-mortem, 2ª rodada) que
  `.responseEntity(Class)`/`BeanOutputConverter` injeta formato na última `UserMessage`, o que
  quebraria a igualdade; por isso a chamada abandona `.responseEntity` em favor de `.call().content()`
  + parse manual (ver design.md, Decisões 1 e 3). A task 0.1 confirma contra o request real.
- **Given** a 2ª tentativa também falha, **when** o `PlanoResilienceService` decide a falha final,
  **then** o comportamento observável (422 `DomainRuleViolationException`, métricas
  `plano_deadline_estourado`/`plano_geracao_falha_final`) não muda.
- **Given** a 1ª tentativa é rejeitada com N violações, **when** consultado
  `tb_llm_call.violations` da linha da **1ª tentativa** (`attempt=1`, não da 2ª — cada linha do
  ledger reflete o resultado da própria tentativa), **then** contém todas as N violações que
  motivaram o reparo, não apenas 300 caracteres da primeira (correção do critério original, achado
  do pré-mortem 2ª rodada: a linha da 2ª tentativa reflete o resultado dela mesma, não um eco da 1ª).

## Open Questions & Assumptions

- **Confirmado no pré-mortem, 3 rodadas (Codex, 2026-09-14):** `.messages(...)` do `ChatClient` do
  Spring AI 1.1.6 aceita a lista heterogênea. O `BeanOutputConverter` embutido em `.responseEntity(...)`
  **de fato** injeta texto de formato na última `UserMessage` (bytecode de `ChatModelCallAdvisor` +
  `Prompt.augmentUserMessage` confirma) — resolvido abandonando `.responseEntity` (task 4.0), com
  guarda explícita para `content()` nulo/vazio preservando o retry de hoje (Decisão 3 do design.md).
  Nenhum outro advisor da cadeia default mexe nas mensagens nesse caminho (verificado no pré-mortem).
  Task 0.1 continua como dupla checagem sobre o request real serializado, não mais sobre incerteza
  de API.
- **Em aberto:** o JSON da 1ª tentativa vai para o prompt de correção **completo** ou só os treinos
  que falharam? Completo é mais fiel ao "corrija isto, mantendo o resto"; parcial economiza tokens
  mas exige o modelo reconstruir o plano inteiro na resposta de qualquer forma (o schema `strict`
  exige o DTO completo).
- **Assumido:** nenhuma migration nova — a coluna `violations` já existe (V94) e já é JSONB.

## Métrica de sucesso

- `plano_retry` que termina em sucesso ≥ 80% (linha do roadmap, Sprint 27).
- `plano_geracao_falha_final` < 2%.
- Tokens de entrada da 2ª tentativa: hoje ≈ tokens da 1ª (regeneração completa); depois, só o
  incremento das mensagens novas — medir via `tb_llm_call.input_tokens` por `attempt`.
- **Ligada à rotina do treinador:** % de planos que chegam ao coach sem terem passado por reparo
  (`attempt == 1` bem-sucedido) vs. hoje — a queda no `plano_geracao_falha_final` é o que evita o
  coach ter que revisar/regenerar manualmente um plano que falhou (product-review, 2026-09-14).

## Rollback

Sem migration nem mudança de contrato de API pública — `git revert` do commit de merge. A coluna
`violations` continua compatível com o formato truncado anterior (é só texto dentro do JSON).

## Relação com o roadmap

- Depende de **F1** (`system-user-prompt-split`, cache do prefixo) e **F2**
  (`refactor-iaservice-decomposition`, porta de onde a resposta bruta é capturada) — ambas mergeadas.
- Building block reaproveitado da F2.5: `Violacao` como formato comum de violação tipada.
- Fica antes de F4 (`semantic-session-schema`): o schema v2 corta o volume de violações possíveis
  (menos campos aritméticos para errar), então medir o turno de reparo no v1 primeiro dá uma
  linha de base mais rica para comparar depois.
