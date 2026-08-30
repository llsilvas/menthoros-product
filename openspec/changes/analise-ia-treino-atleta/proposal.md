**Tamanho:** M · **Trilha:** Full

## Why

Quando o atleta registra o treino e manda o RPE, o backend já dispara uma análise por IA
(`WorkoutAnalysisListener` → `AnaliseWorkout`): comparação com o planejado, causa provável,
score de execução e recomendação. Só o coach vê — e só no shell legado (`TreinoCard`, "Coach
Insight"). Para o atleta o ciclo termina no `PostWorkoutFeedbackCard`, com uma frase fixa por
faixa de RPE ("Bom treino! Mantenha a consistência."). Ele entregou o dado mais valioso que o
coach recebe e não recebe nada de volta.

O texto atual não serve ao atleta: é escrito para o treinador ("TSB de −28 e 7 dias consecutivos
de carga indicam fadiga acumulada", "recuperação obrigatória 48–72h"), em inglês traduzido campo a
campo. Mostrar isso como está passaria diagnóstico e prescrição por cima do coach.

**Por que isso importa para o treinador.** O retorno imediato é o que mantém o atleta mandando RPE
(`athlete-training-loop` mediu "treinos com feedback / realizados" como métrica central — sem
retorno, a taxa cai). E responde no app a pergunta que hoje chega ao coach por WhatsApp depois de
todo treino: "como fui?". A análise que o atleta lê é a mesma que o coach vê, em linguagem dele —
o coach não precisa traduzir. Para a assessoria que paga, atleta que recebe retorno no app é
atleta que fica — o argumento de retenção que o coach usa para justificar a plataforma.

Design aprovado em canvas (2026-08-29):
<https://claude.ai/code/artifact/92b790e2-173d-4a30-90bd-bba4bb829a96> — três pranchetas: agenda
com o sinal "Análise pronta", detalhe com análise em andamento, detalhe com análise pronta.

## What Changes

Backend + frontend, uma change (ver `design.md` D0).

**Backend**
- A skill `workout-analyzer` passa a devolver, **na mesma chamada**, um bloco `athlete_message`
  com quatro campos em PT-BR e linguagem de atleta: `recognition` (algo concreto que ele fez bem),
  `how_it_went` (executado vs. planejado), `effort_reading` (o que o RPE informado diz, **sem**
  CTL/ATL/TSB nem diagnóstico) e `next_workout_tip` (orientação prática que **nunca altera o
  plano** e remete ao coach na dúvida). O bloco não passa pelo `WorkoutAnalysisTranslator`.
- O prompt passa a receber duração, pace médio e etapas (planejadas e realizadas) — só números
  e enums, sem texto livre — para que "como foi" cite fatos da sessão, não invente
  (`buildPromptData` hoje manda só tipo, distância, RPE e FC média).
- `AnaliseWorkout` ganha as quatro colunas de texto mais `atletaBloqueadoMotivo` e
  `atletaPrimeiraVisualizacaoEm` (`V85`, aditiva). Um `AthleteMessageValidator` roda **antes de
  persistir**: jargão, tamanho, idioma ou prescrição → bloco nulificado com motivo. Falha ou
  bloqueio do bloco não falha a análise do coach: o atleta simplesmente não vê o card.
- `GET /api/v1/atletas/me/realizados/{id}/analise` — endpoint **do atleta**, escopo por dono
  (404 para realizado de outro atleta ou tenant): devolve `status` e o bloco do atleta mais os
  números executado vs. planejado (`duracaoMin`, `distanciaKm`, `rpe` / `rpeEsperado`). Devolve
  `200 PENDING` por **elegibilidade** (RPE presente, dentro de `maxIdadeDias`) mesmo antes de o
  listener assíncrono criar a linha — sem isso o card sumiria logo após o registro. **Não**
  expõe `technicalInterpretation`, `primaryCause`, `executionScore`, `tags` nem `rationale`.
- O plano do atleta (`GET /api/v1/planos/{atletaId}`, `TreinoPlanejadoOutputDto`) ganha
  `analiseAtletaDisponivel: boolean` por treino, para a agenda sinalizar sem N chamadas — e, com
  `ROLE_ATLETA`, passa a responder `404` quando `{atletaId}` não é o atleta autenticado (hoje
  só filtra tenant).
- `GET /api/v1/analises/treino/{id}` (coach) passa a exigir `COACH`/`ADMIN` — hoje é
  `isAuthenticated()` sem dono — antes de receber os campos do atleta no DTO.
- Kill switch `app.workout-analysis.athlete-message.enabled` (default `true`): desligado, o
  endpoint devolve `204` e o flag do plano é `false` — reversão sem deploy de front.

**Frontend (shell do atleta)**
- `WorkoutDetailDrawer`: para treino concluído, chip "Concluído · RPE n/10 · label" e o card
  "Análise do treino" com os quatro blocos e os três números; `PENDING` mostra "Analisando o seu
  treino…" com placeholder; ausente/`FAILED`/bloco nulo → card omitido (estado vazio honesto).
- `WeekAgendaRow`: linha do treino concluído mostra "Análise pronta" quando
  `analiseAtletaDisponivel`.
- `PostWorkoutFeedbackCard` (tela de registro): mesmo card, no estado `PENDING`, com o aviso
  "pode fechar — a análise fica guardada no treino", ligando o momento do registro ao lugar onde
  a análise mora.

**Frontend (coach, legado)**
- `TreinoCard` ("Coach Insight"): abaixo da análise técnica, o bloco "O que o atleta leu" com os
  quatro textos, somente leitura — transparência do D3.

## Non-Goals

- **Gate do coach.** Decisão do founder em 2026-08-29: a análise vai **direto ao atleta** assim
  que fica pronta, sem liberação por análise nem opt-in por atleta. Contraria o princípio
  "nunca expor saída de IA ao atleta sem ação do treinador" do `config.yaml` — registrado como
  exceção deliberada, com as mitigações de D3 (guardrails no prompt, kill switch, o coach vê o
  mesmo texto). Reabrir se o piloto mostrar o atleta seguindo a IA contra o coach.
- Não muda os campos do coach na análise (skill mantém o schema atual do coach, tradução
  intocada). A única mudança no lado do coach é o bloco do atleta em **somente leitura** no
  `TreinoCard` legado (ver What Changes) — sem isso o coach não sabe o que o atleta leu.
- Não traz a análise para o shell novo do coach (`features/coach`) — o coach continua vendo no
  legado; migrar é change própria.
- Não gera análise para treino sem RPE nem para treino com mais de `maxIdadeDias` — regras
  existentes do listener, intocadas.
- Não faz notificação push quando a análise fica pronta.
- Não reanalisa treinos já analisados antes desta change: eles não têm o bloco do atleta e não
  mostram card (sem backfill).

## Critérios de aceite

1. Given `TreinoRealizado` com RPE, When o listener conclui a análise, Then `AnaliseWorkout` tem
   os quatro campos do atleta preenchidos em PT-BR; Given o LLM devolve o bloco ausente ou
   malformado, Then a análise fica `COMPLETED` com os campos do coach e os do atleta `null`.
2. Given o bloco gerado, Then nenhum dos quatro textos contém `CTL`, `ATL`, `TSB`, `score` nem
   instrução de cancelar/trocar treino do plano — teste unitário sobre o prompt com fixture de
   resposta e teste de contrato do prompt (asserção nas regras da skill).
3. Given atleta autenticado e realizado dele com análise `COMPLETED`, When
   `GET /me/realizados/{id}/analise`, Then `200` com `status`, os quatro textos, `analyzedAt` e
   `executado`/`planejado`; Given linha `PENDING` **ou realizado elegível ainda sem linha**, Then
   `200 PENDING` com os números e sem textos; Given não elegível (sem RPE, mais antigo que
   `maxIdadeDias`), `FAILED` ou bloco nulo, Then `204`; Given realizado de outro atleta do mesmo
   tenant, Then `404`; Given outro tenant, Then `404`; Given 12 chamadas `PENDING` e 3
   `COMPLETED`, Then `atleta_analise_visualizada_total` incrementa 1 vez.
4. Given kill switch `false`, Then o endpoint devolve `204` para qualquer realizado e
   `analiseAtletaDisponivel` é `false` em todo o plano.
5. Given plano aprovado com um treino realizado analisado, When `GET /planos/{atletaId}` como
   atleta dono, Then aquele `TreinoPlanejadoOutputDto` traz `analiseAtletaDisponivel: true` e os
   demais `false`; Given atleta A chama `GET /planos/{idDeB}` no mesmo tenant, Then `404`; Given
   atleta chama `GET /analises/treino/{id}`, Then `403`.
5b. Given bloco do atleta com "melhor não fazer o intervalado de sexta" ou em inglês, When
   o listener persiste, Then os quatro campos ficam `null`, `atletaBloqueadoMotivo` preenchido e
   a análise do coach `COMPLETED`; Given o prompt de um realizado com etapas, Then o JSON contém
   `duration_min`, `steps[]` e `avg_pace_min_km` e nenhum campo de texto livre.
6. Given o drawer do treino concluído com análise pronta em 390×844, Then chip "Concluído", os
   três números e os quatro blocos são renderizados nesta ordem: reconhecimento, números, "Como
   foi", "O que o seu esforço diz", "Para o próximo treino"; Given `PENDING`, Then "Analisando o
   seu treino…"; Given `204`, Then o card não existe e o drawer é o de hoje (etapas + perfil).
7. Given `analiseAtletaDisponivel: true`, Then a linha da agenda mostra "Análise pronta"; caso
   contrário, a linha é a de hoje.
8. Given registro manual com RPE, Then o `PostWorkoutFeedbackCard` mostra o card em `PENDING`
   com o aviso de que a análise fica no treino; o botão "Voltar para Home" permanece.
9. Isolamento multi-tenant e por atleta nos endpoints novos/alterados (testes `@RequireTenant` +
   dono); `./mvnw verify`, `lint + build + test:run` e E2E
   `tests/e2e/athlete/workout-analysis.spec.ts` (registro → agenda → drawer, mocks para
   `PENDING`/`COMPLETED`/`204`) verdes.

## Métrica de sucesso

- **Treinos com feedback (RPE) / treinos realizados** — a métrica de `athlete-training-loop`
  (`atleta_treino_feedback_total`); a hipótese é que o retorno imediato **sustenta** a taxa acima
  de 60% no piloto em vez de deixá-la cair após a novidade.
- **Análises abertas pelo atleta / análises geradas** — contador novo
  `atleta_analise_visualizada_total` (incrementa no `200` do endpoint); meta > 70% em 48h.
- **Mensagens "como fui?" do atleta ao coach** — contagem manual pelo coach piloto por 2 semanas
  antes e 2 depois (uma pergunta estruturada: "quantos atletas te perguntaram como foi o treino
  esta semana?"), não relato informal — é a única métrica que mede a rotina do treinador.
- **Análises que remetem ao coach** — `atleta_analise_remete_coach_total` (incrementa quando o
  bloco é gerado com `primary_cause != NORMAL`); dá substância à cláusula de reversão dos
  Non-Goals: se esse número crescer e o coach não souber, o gate volta à mesa.

## Open Questions & Assumptions

- **Resolvido (founder, 2026-08-29):** sem gate do coach — ver Non-Goals. O canvas mostra a
  nota "Seu coach vê a mesma análise" no rodapé do card; ela é parte do contrato de confiança, não
  decoração.
- **Resolvido (founder, 2026-08-29):** o texto do atleta vem da **mesma chamada** da análise
  (bloco extra no schema da skill), não de tradução determinística por `primaryCause`.
- **Premissa:** pedir o bloco em PT-BR direto ao Sonnet não degrada os campos do coach (que
  seguem em inglês + tradução). Validar com as fixtures de teste da skill; se degradar, D2 prevê
  segunda chamada só para o bloco.
- **Premissa:** `TreinoPlanejadoOutputDto` já expõe `treinoRealizadoId` e
  `percepcaoEsforcoRealizado` (confirmado em `src/types/TreinoPlanejado.ts`) — o drawer sabe qual
  realizado buscar sem contrato novo além do flag.
- **Premissa:** o endpoint `/me/realizados/{id}/...` já existe para o feedback
  (`athlete-workout-feedback`), com resolução do atleta autenticado e 404 para não-dono — o novo
  endpoint reaproveita o mesmo caminho.
- **Verificado (2026-08-29) e trazido para o escopo pelo pré-mortem:** `GET
  /api/v1/analises/treino/{id}` é `isAuthenticated()` + tenant, **sem checagem de dono**; e `GET
  /planos/{atletaId}` com `ROLE_ATLETA` também só filtra tenant. Como a change coloca o texto do
  atleta no DTO do primeiro e o flag no segundo, os dois endurecem aqui (design D4). O front do
  atleta **nunca** chama o endpoint do coach.
- **Pré-mortem Codex (2026-08-29, "needs-attention", 6 achados):** todos confirmados no código
  e incorporados — ver `design.md`, "Riscos e mitigações". Os dois que mudaram o contrato:
  `200 PENDING` por elegibilidade (o listener é assíncrono, a linha não existe logo após o
  registro) e validação do bloco em runtime (fixture não impede uma prescrição em produção).
- **Em aberto:** duração realizada em `TreinoRealizado.duracaoMin` é string (`"HH:MM:SS"`) no
  contrato atual; o endpoint do atleta devolve minutos inteiros — confirmar conversão no
  `implement init`.
- **Product review (2026-08-29, `product-reviewer`, Refine):** as mitigações de D3 eram reativas
  — o coach "pode ver, se procurar", e o gatilho de reversão não tinha instrumentação. Incorporado:
  contador `atleta_analise_remete_coach_total`, métrica de rotina do coach com contagem
  estruturada, fixtures adversariais (frases prescritivas sem os tokens proibidos) na 1.4 e a
  ponte para a assessoria no Why. **Em aberto para o founder:** sinal ativo ao coach (badge na
  fila de atenção quando o bloco do atleta nasce com `primary_cause != NORMAL`) já nesta change,
  ou fast-follow depois do piloto? Custo: um `CoachAttentionSignalEvaluator` novo — a fila corta
  abaixo de ALTA, então precisa de decisão sobre severidade. Default desta proposta: fast-follow,
  registrado no Radar.
- **Em aberto (fora desta change):** reanálise/backfill dos últimos 30 dias para o atleta piloto
  ver algo no primeiro dia. Custo de LLM por treino; decisão do founder.

## Referências

- Canvas: <https://claude.ai/code/artifact/92b790e2-173d-4a30-90bd-bba4bb829a96>
- `apps/menthoros-backend/.../services/impl/WorkoutAnalysisListener.java`,
  `WorkoutAnalysisTranslator.java`, `entity/AnaliseWorkout.java`,
  `resources/skills/analise/workout-analyzer/SKILL.md`
- `apps/menthoros-front/src/features/athlete/components/WorkoutDetailDrawer.tsx`,
  `WeekAgendaRow.tsx`, `PostWorkoutFeedbackCard.tsx`, `src/types/AnaliseWorkout.ts`
- Specs: `openspec/specs/athlete-workout-feedback/spec.md` (endpoint `/me/realizados/{id}`),
  `openspec/changes/add-post-workout-debrief` (debrief estruturado do coach — complementar, não
  dependente)
