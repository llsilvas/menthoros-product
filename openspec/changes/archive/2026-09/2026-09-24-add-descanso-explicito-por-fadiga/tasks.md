# Tasks — add-descanso-explicito-por-fadiga

## 1. Sinal de fadiga estruturado (TDD)

- [x] 1.1 `FatigueSignal` (tipo, valor, limiar, scope WEEK/ACUTE, liberaDescanso) calculado por
      completo, independente da recomendação do intervalado — tabela da Decisão 3
      verify: cada sinal isolado e combinado; degradação do intervalado inalterada
- [x] 1.2 `PromptGerado` carrega os sinais até o `IaServiceImpl` (a materialização dos dias efetivos
      em PROXIMA_SEMANA foi para a 2.2, onde é consumida — evita código morto)
      verify: `./mvnw clean test`

## 2. Regra de cobertura (TDD)

- [x] 2.1 `WeeklyCoverageValidator` puro (Decisão 2, itens 1-8, com escopo temporal dos sinais e
      `firstEffectiveDay` pelo menor `DayOfWeek`)
      verify: tabela de cenários verde — CA1-CA7, CA2b (Leandro: TSB não libera), CA4 (BVA do teto
      por nº de dias), CA4b (escopo), CA4c (PROXIMA_SEMANA), CA12d (intensos adjacentes), CA15 (6-7 dias)
- [x] 2.1b `SEQUENCIA_ACIMA_DO_MAXIMO` calculado sobre os dias efetivos
      verify: CA12e, inclusive em PROXIMA_SEMANA (CA4c)
- [x] 2.2 `WeeklyCoverageContext` montado em `IaServiceImpl` (só com a flag ligada e sem skeleton) e
      passado a `PlanoLlmValidator` v1/v2; kill-switch `app.plano.weekly-coverage.enabled` (CA16)
      verify: violações chegam ao `PlanoResilienceService`; mensagem de reparo testada
- [x] 2.3 `./mvnw clean test`

## 3. Contrato da LLM (TDD)

- [x] 3.1 `restDays` em `PlanoSemanalLlmDto`/`V2` e no `LlmJsonSchemaBuilder` v1/v2; `minItems` 1,
      `maxItems` 7; `SessionResolver` propaga `restDays`
      verify: asserções estruturais em `LlmJsonSchemaBuilderTest` (v1 e v2); CA11
- [x] 3.2 Prompt: bloco de cobertura com os sinais ativos (valor, limiar, dia em que liberam) +
      limite; alinhar `DisponibilidadePromptFormatter:110/116` ao campo `restDays` (CA7b)
      verify: golden do prompt; eval modo candidato colado no PR
- [x] 3.3 `./mvnw clean test`

## 4. Persistência e saída (TDD)

- [x] 4.1 Migration (próximo número livre; hoje V97) `rest_days JSONB` + mapeamento na entidade
      verify: `@DataJpaTest` com Postgres (Testcontainers) — ida e volta, nulo → vazio
- [x] 4.2 `PlanGenerationPersister` grava `restDays`; `PlanoSemanalOutputDto.restDays`
      verify: CA8 — `@WebMvcTest` do GET do plano, plano antigo devolve lista vazia
- [x] 2.2b `LongRunAnchor.swap` no lambda `validar`, antes do validador; precedência do descanso
      agudo; `TIPOS_ALTA_INTENSIDADE` como constante única
      verify: CA12c
- [x] 4.3 Prova em dia de descanso remove o descanso (CA12b) — a prova vence
      verify: `PlanGenerationPersisterDescansoTest`
- [x] 4.3b **Retomada e feita em 2026-09-22** (`f233601`). Tinha sido reduzida sob o argumento de que
      plumbar o contexto até o persister duplicaria a fonte de verdade. **O adiamento estava errado**,
      e a geração real de 22/09 20:49 mostrou o custo: o check-in do atleta dizia DESCANSAR, a LLM
      prescreveu descanso na quinta e treino no sábado, a cobertura aprovou — e então a
      `RedistribuicaoTreinoHelper`, que o persister continuava chamando, levou o treino para a quinta.
      O descanso caiu (o dia passou a ter treino) e o sábado ficou vazio: o inverso exato da
      prescrição, num plano auto-aprovado entregue ao atleta.
      A Decisão 6 já dizia que a redistribuição não roda com cobertura validada; faltava o persister
      *saber*. A decisão agora mora na `CoberturaSemanalPolicy`, consultada pelo `IaServiceImpl` (que
      valida) e pelo persister (que redistribui) — uma resposta, dois pontos de uso, sem mudar a
      assinatura do `IaService` (10 call sites, incluindo o lote).
      verify: `CoberturaSemanalPolicyTest` (9 casos) + `PlanGenerationPersisterCoberturaTest`
      (regressão das 20:49) + geração real de 21:14, com o descanso preservado
- [x] 4.3c **Nova (2026-09-22, `7a5eb75`):** descanso não autorizado é resolvido sem turno de reparo.
      A regra trocou um erro silencioso por uma violação reparável, mas quando o modelo insiste o
      treinador fica **sem plano**: em 22/09 21:11 a LLM pôs treino *e* descanso na mesma quinta, o
      reparo repetiu o erro e as duas tentativas falharam. O `DescansoNaoAutorizadoConverter` roda
      antes da normalização e aplica duas conversões determinísticas — dia que já tem treino perde o
      descanso (precedência do persister), e descanso sem sinal do dia vira REGENERATIVO de 30 min,
      que é a instrução literal do bloco de cobertura. A regra continua valendo; deixa de ser cobrada
      por rejeição. Telemetria: `plano_descanso_nao_autorizado{motivo}`
      verify: `DescansoNaoAutorizadoConverterTest` (12 casos) + geração real de 21:27, com as duas
      conversões no log e plano salvo
- [x] 4.4 Treino criado pelo treinador num dia de descanso remove o descanso
      verify: CA14
- [ ] 4.5 Regra de cobertura desligada com skeleton do planner — implementado (guarda de uma linha
      no `IaServiceImpl`), **sem teste automatizado**: cobrir exigiria montar o IaServiceImpl com 16
      colaboradores. Fica para a validação real com o planner ligado
      verify: CA13 por inspeção + geração real
- [x] 4.6 Não-regressão (encerramento da semana, aderência, intervals.icu): **por construção**, não
      por teste novo — o descanso vive fora de `tb_treino_planejado`, então esses caminhos não o
      enxergam (foi o motivo da Decisão 1). A suíte inteira (4033 unit + 193 IT) segue verde
      verify: plano com descanso não gera PERDIDO nem entra no denominador
- [x] 4.7 `./mvnw clean verify`

## 5. Entrega

- [x] 5.1 Geração real para o Leandro (TSB abaixo do limiar, sem check-in): todo dia coberto, nenhum
      descanso; a quinta (dia de intensidade) vem como treino leve
      verify: `tb_plano_semanal.rest_days` vazio e 4 treinos em `tb_treino_planejado` (CA2b ao vivo)
      **Feito em 22/09 18:02** — aprovado na 1ª tentativa (42,6 s), sem turno de reparo, e salvo com
      4 treinos / 26,0 km. A LLM declarou descanso em QUARTA e SEXTA (dias em que o atleta não
      treina); o `PlanoLlmValidator` descartou os dois antes de validar, e com os 4 dias efetivos
      cobertos por treino `rest_days` fica vazio. Três defeitos apareceram só aqui, nenhum por
      teste: bloco de cobertura emitido com o planner ligado (c73299d), vocabulário de `restDays`
      (7c570a5) e coleções imutáveis no merge do Hibernate (aaf3e23, 9aafb2e).
- [x] 5.2 Geração real na SEMANA_ATUAL com check-in DESCANSAR hoje: descanso no primeiro dia efetivo
      com motivo; demais dias com treino
      verify: `rest_days` com 1 item no **primeiro dia efetivo** e motivo citando o check-in (CA2 ao vivo)
      **Feito em 22/09 21:14.** Check-in DESCANSAR inserido direto no banco (autorizado pelo founder;
      `observacoes` marca a linha como inserida para validação). Plano salvo:
      `rest_days = [{"dayOfWeek": "QUINTA", "reason": "Readiness do dia é DESCANSAR, TSB -11,8 (limiar -25)"}]`
      e treino CONTINUO 7,69 km no sábado.
      **Correção de redação:** o critério dizia "no dia de hoje". Hoje era terça, mas em SEMANA_ATUAL
      o dia corrente já não é dia efetivo (`filtrarDiasDisponiveis` tira os que passaram), então o
      primeiro efetivo era quinta — e é nela que o descanso deve cair. O comportamento está correto;
      o texto é que estava ambíguo.
      Esta mesma geração é a prova ao vivo da 4.3b: é o cenário de 20:49, agora com o descanso
      preservado e o treino mantido no sábado.
- [ ] 5.4 **Revisão de calibração** (após 4 semanas com o front em produção): taxa de descansos
      convertidos em treino pelo treinador e de reprovação por `DESCANSO_SEM_SINAL`; revisar limiares
      de TSB/RPE e o teto por nº de dias à luz dos dados
      verify: nota de revisão em `knowledge/coaching/frequencia-e-descanso-por-fadiga.md`
- [ ] 5.3 **Gate de promoção:** não abrir/mergear `develop → main` com esta change antes de
      `show-descanso-no-plano` estar mergeada em `develop`
      verify: checklist do PR de promoção

## Follow-ups registrados (fora do escopo desta change)

Achados que apareceram na validação ao vivo de 22/09 e **não** são desta change — ficam aqui para não
se perderem, cada um candidato a change própria:

- **Auto-approve ignora `VIOLATIONS_DETECTED`.** O veto de `aplicarAutoApproveSeElegivel` só olha
  `FAILED`, `FALLBACK` e `requiresCoachReview`. O plano de 22/09 20:50 foi auto-aprovado
  (`AUTO_CONFIANCA_ALTA`) com `planner_compliance_status = VIOLATIONS_DETECTED` e nunca entrou na
  fila do treinador. É de `athlete-onboarding-baseline` (CA5, Decisão 7), anterior a esta change.
  Localmente foi contornado com `ONBOARDING_AUTO_APPROVE_ENABLED=false`.
- **Treino em dia indisponível ainda custa um turno de reparo.** Diferente do `restDays`, isto é erro
  de prescrição e deve continuar sendo violação — mas se a frequência for alta, vale medir antes de
  decidir se compensa corrigir deterministicamente (mover para o dia disponível mais próximo).
- **Reparo estrutural sintetiza aquec/desaq por cima da prescrição** (herdado de
  `fix-etapas-continuos-pace`): o relógio recebe mais que o aprovado pelo treinador.
