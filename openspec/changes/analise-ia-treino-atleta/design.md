# Design — analise-ia-treino-atleta

## D0 — Uma change, três fatias em sequência

Backend (bloco + endpoint + flag) → drawer do atleta → agenda e tela de registro. O drawer sem o
endpoint não tem o que mostrar; o endpoint sem o drawer não entrega valor. A agenda e o card de
registro são pequenos e usam o mesmo hook — separá-los seria cerimônia sem isolamento. Não há
operação destrutiva nem incerteza de design (o canvas fechou a UI); a incerteza é de prompt (D2).

## D1 — O texto do atleta é um bloco próprio, não o texto do coach reescrito

`AnaliseWorkout` hoje guarda `summaryPt`, `technicalInterpretationPt`, `recommendationPt`,
`rationalePt`, `primaryCause`, `executionScore`, `tags` — todos pensados para o treinador. A
change **não** mostra nenhum deles ao atleta. Quatro colunas novas, nomeadas pela função no card:

| Coluna | Campo no bloco do atleta | O que é |
|---|---|---|
| `atleta_reconhecimento` | `athlete_message.recognition` | 1 frase, algo concreto que ele fez bem |
| `atleta_como_foi` | `athlete_message.how_it_went` | 1–2 frases, executado vs. planejado |
| `atleta_esforco` | `athlete_message.effort_reading` | 1–2 frases sobre o RPE informado vs. esperado |
| `atleta_proximo_treino` | `athlete_message.next_workout_tip` | 1–2 frases, prática, sem mudar o plano |

Migration `V85__add_atleta_message_to_tb_analise_workout.sql`, aditiva, `TEXT NULL`, sem
backfill. Rollback: reverter código; colunas ficam inertes. Um DTO separado
(`AthleteMessageDto`) carrega os quatro campos da chamada 2; o `AnaliseWorkoutRawDto` do coach
fica intocado; `applyResult` copia os quatro campos; o ramo `FAILED` já zera tudo e passa a
zerar estes também.

**Por que não mapear `primaryCause` para frases fixas.** Seria mais barato e previsível, mas o
valor para o atleta está no "como foi" específico da sessão ("você cortou 3 min do
desaquecimento"), que só a análise que viu os números consegue escrever. Decisão do founder.

## D2 — Segunda chamada separada, PT-BR nativo, modelo simples

O listener chama o Sonnet uma vez para a análise do coach (`.entity(AnaliseWorkoutRawDto.class)`),
depois o `WorkoutAnalysisTranslator` faz **quatro chamadas** ao Haiku, uma por campo. O bloco do
atleta entra numa **segunda chamada separada**, não no schema do coach:

- a chamada 1 (Sonnet, rota `complex`) fica **intocada** — mesmo `Output Schema`, mesmo tradutor;
  zero risco de degradar os campos do coach;
- a chamada 2 gera o bloco do atleta em **PT-BR nativo**, num único structured output com os
  quatro campos, usando a rota **`simple`** (gpt-4o-mini, ~6,7x mais barato que Haiku) — quatro
  frases motivacionais curtas não precisam de raciocínio complexo;
- a chamada 2 recebe os **mesmos dados numéricos** da chamada 1 (duração, pace, etapas, RPE) mais
  o `primary_cause` resultante da chamada 1, para remeter ao coach de forma consistente com o que
  o treinador vê;
- **ordem sequencial** (chamada 2 depois da 1), para o bloco nascer alinhado ao `primary_cause`;
  o "rápido" do retorno já é resolvido porque hoje o atleta não recebe nada — ~30s é uma melhoria
  enorme (o polling do hook é de 15s);
- se a chamada 2 falhar ou estourar timeout, a análise do coach segue `COMPLETED` e o atleta só
  não vê o card. Timeout/retry independentes, sem acoplamento.

**Decisão do founder (2026-08-30):** separar análise do coach e retorno do atleta em duas
chamadas. Dois artefatos distintos: análise para o treinador, motivação para o atleta.

**Guardrails no prompt (a parte que o `security-reviewer` e o product review vão olhar):**
- linguagem para quem correu, não para quem prescreve: proibido `CTL`, `ATL`, `TSB`, `score`,
  `%`, "fadiga do SNC", nomes de causa;
- **nunca** dizer para pular, encurtar, trocar ou intensificar um treino do plano — a dica é sobre
  como executar o próximo (ritmo, sono, hidratação, atenção a sinais), e termina remetendo ao
  coach quando o `primary_cause` não for `NORMAL` ("vale comentar com seu coach como você acorda
  amanhã");
- nada de diagnóstico ("você está overtraining", "lesão");
- o reconhecimento é **específico e verificável** nos números (ritmo, distância, blocos), nunca
  elogio genérico; se não houver nada concreto, elogia a consistência de ter registrado;
- tamanho: cada campo ≤ 240 caracteres — cabe no card de 390px sem virar parede.

**Os dados têm que estar no prompt (Codex #3).** `buildPromptData` hoje manda ao LLM só tipo,
distância e RPE esperado do planejado e distância, RPE e FC média do realizado — nem duração,
nem pace, nem etapas. "Você cortou 3 min do desaquecimento" seria alucinação. A change amplia o
payload com `duration_min` (planejado e realizado), `avg_pace_min_km` derivado, `planned.steps[]`
e `actual.steps[]` (`EtapaRealizada` quando houver) — **só numéricos e enums**, mantendo a regra
anti-injeção do listener (nada de `feedbackAtleta`, `observacao`, `descricaoEtapa`). O mesmo
payload alimenta as duas chamadas; a chamada 2 instrui "cite só números presentes nos dados".
Isso beneficia a análise do coach de graça.

**Validação em runtime, não só no prompt (Codex #4).** `.entity()` desserializa e `applyResult`
persiste direto; um prompt bem escrito não impede uma prescrição de chegar ao atleta.
`AthleteMessageValidator` roda antes de persistir o bloco da chamada 2: regex de proibidos,
≤ 240 chars, heurística de idioma PT-BR e — se a 0.3 ligar — o classificador binário via Haiku.
Violou → os quatro campos ficam `null` e `atletaBloqueadoMotivo` registra por quê; a análise do
coach segue `COMPLETED`. O endpoint devolve `204` (card ausente) — melhor sem card do que com um
errado.

**Validação:** teste unitário do `applyResult` com fixture completa e com bloco ausente/parcial;
testes do validador com as fixtures felizes e adversariais;
teste do prompt afirmando que a skill contém as regras acima (regressão contra edição do
`SKILL.md`); fixtures de resposta (3 cenários do próprio `SKILL.md` — execução excelente, fadiga
acumulada, fatores externos) com asserção de proibidos (`TSB|CTL|ATL|score|cancel|pule|troque`).
A chamada 1 não é tocada, então o risco de degradação da análise do coach **desaparece** — a 0.3
deixa de ser gate de risco e vira só validação das fixtures da chamada 2.


## D3 — Sem gate do coach: exceção deliberada, com três mitigações

O `config.yaml` do produto diz "nunca expor saída de IA ao atleta sem ação dele [do treinador]".
O founder decidiu (2026-08-29) que esta análise vai direta. A change registra a exceção e a cerca:

1. **Guardrails de D2** — o texto não prescreve nem diagnostica; a única "ação" que sugere é
   falar com o coach.
2. **Kill switch** `app.workout-analysis.athlete-message.enabled` (`WorkoutAnalysisProperties`,
   default `true`): `false` → endpoint `204`, flag do plano `false`, listener **continua gerando**
   o bloco (para não perder dados) mas nada é exposto. Reversão em produção sem deploy de front.
3. **Transparência** — o rodapé do card diz "Gerada automaticamente… Seu coach vê a mesma
   análise", e o coach de fato vê: o `TreinoCard` legado ganha, **nesta change**, o bloco do
   atleta abaixo do "Coach Insight" (somente leitura, quatro linhas) — sem isso o coach não sabe o
   que o atleta leu. É a única mudança no lado do coach.

## D4 — Endpoint do atleta, escopo por dono

`GET /api/v1/atletas/me/realizados/{id}/analise` no mesmo controller/serviço que
`POST /me/realizados/{id}/feedback` (`athlete-workout-feedback`): resolve o atleta autenticado,
busca o realizado por `id` + `atletaId` + tenant → `404` se não for dele. Contrato:

```json
{
  "status": "PENDING | COMPLETED",
  "analyzedAt": "2026-08-25T10:42:00Z",
  "reconhecimento": "…", "comoFoi": "…", "esforco": "…", "proximoTreino": "…",
  "executado": { "duracaoMin": 58, "distanciaKm": 11.2, "rpe": 7 },
  "planejado": { "duracaoMin": 61, "distanciaKm": 11.0, "rpeEsperado": 6 }
}
```

- **`PENDING` antes da linha existir (Codex #2).** O listener é `@Async` + `AFTER_COMMIT` e só
  cria a linha `PENDING` dentro de `onTreinoRegistrado` — logo após o registro há uma janela
  real sem `AnaliseWorkout`. Se o endpoint devolvesse `204` ali, o card sumiria na tela de
  registro, exatamente o fluxo crítico. Por isso o endpoint decide por **elegibilidade**, não
  por existência da linha: realizado com RPE, dentro de `maxIdadeDias`, switch ligado → `200
  PENDING` enquanto não houver `COMPLETED`/`FAILED`. Mesmas condições do listener, num helper
  compartilhado (`WorkoutAnalysisEligibility`) para não divergirem.
- `PENDING` → `200` só com `status` e os números (o card mostra "Analisando…" em cima dos
  números, que já existem).
- Não elegível, `FAILED`, bloco nulo (nulificado pelo validador ou análise anterior à change) ou
  kill switch → `204`.
- `planejado` é opcional (realizado sem `treinoPlanejado`); o card omite a linha "plano …".
- **Endpoint do coach endurecido nesta change (Codex #1).** `GET /api/v1/analises/treino/{id}`
  é `isAuthenticated()` + tenant, sem dono nem role: colocar o bloco do atleta no
  `AnaliseWorkoutOutputDto` ali exporia o texto de qualquer atleta a outro atleta do tenant. Como
  a change **precisa** desse DTO para o "O que o atleta leu", o hardening entra no escopo:
  `@PreAuthorize("hasAnyRole('COACH','ADMIN')")` — atleta recebe `403`. O front do atleta nunca
  o chama.
- `duracaoMin` sai em minutos inteiros (converter de `Duration`/string no DTO — confirmar tipo
  da entidade no `implement init`).

**Flag no plano — e dono (Codex #5).** `TreinoPlanejadoOutputDto.analiseAtletaDisponivel` —
`true` quando existe `AnaliseWorkout COMPLETED` para `treinoRealizadoId` com
`atleta_como_foi != null` e o switch está ligado. Uma query por plano
(`findByTreinoRealizadoIdIn`), não N. `PlanoTreinoController` aceita `ROLE_ATLETA` e busca pelo
`{atletaId}` do path só filtrando tenant + `APROVADO` (`PlanoServiceImpl:846-854`): um atleta
lê o plano de outro do mesmo tenant. Nesta change, com `ROLE_ATLETA`, `{atletaId} !=
atletaAutenticado → 404` — a mesma resolução de "atleta autenticado" do endpoint `/me`.

## D5 — Front: um hook, um card, três lugares

- `useAthleteWorkoutAnalysis(treinoRealizadoId | null)` em `features/athlete/hooks/`: `data`,
  `loading`, `error`, `status: 'idle' | 'pending' | 'done' | 'empty'`; `204` → `empty`. Polling
  **não**: em `pending` o hook refaz a chamada a cada 15 s por no máximo 3 min enquanto o drawer
  está aberto (`setInterval` com cleanup), depois para — a análise leva ~30–60 s; se demorar mais,
  o atleta reabre o treino. Sem WebSocket.
- `WorkoutAnalysisCard` em `features/athlete/components/`: presentacional, recebe o view model
  de `buildWorkoutAnalysisView(dto)` (adapter puro em `adapters/`). Estilo exatamente o do
  canvas: `elevation.card`, `1px solid surface[700]`, `radius.lg`, ícone SVG próprio (sem
  emoji), esforço colorido por `effortColor(rpe)`, bloco "Para o próximo treino" sobre
  `alpha(primary[500], 0.08)`.
- `WorkoutDetailDrawer`: quando `dia.status === 'concluido'` e há `treinoRealizadoId`, monta o
  hook e renderiza chip + card **entre a descrição e o perfil**; "Registrar treino" já não
  aparece para dia concluído.
- `WeekAgendaRow`: `w.analiseDisponivel` (vem do adapter `buildWeekAgenda`, que lê o flag) →
  terceira linha "Análise pronta" em `primary[500]`, 11px/600, com o mesmo ícone.
- `PostWorkoutFeedbackCard`: recebe `analysis` do mesmo hook (montado pela
  `ManualTrainingFormPage` com `treinoRegistrado.id`) e renderiza o `WorkoutAnalysisCard` em
  `pending`/`done` acima do botão; o texto fixo por faixa de RPE (`mensagem`) **sai** quando há
  card, para não competir.
- Tipos: `src/types/AthleteWorkoutAnalysis.ts` (manual, contrato acima); `src/api` ganha
  `AthleteAnalysisService.getByRealizado(id)` na fachada curada.

## D6 — Métrica

`atleta_analise_visualizada_total` incrementa **uma vez por análise**, na primeira resposta
`200 COMPLETED` ao dono, carimbando `atletaPrimeiraVisualizacaoEm` (Codex #6: contar todo `200`
inflaria com o polling de 15 s e contaria `PENDING` como visualização); o
`atleta_treino_feedback_total` existente é a métrica de sustentação;
`atleta_analise_remete_coach_total` incrementa no listener quando o bloco do atleta nasce com
`primary_cause != NORMAL` — é o que dá base numérica à cláusula de reversão do gate (product
review: sem isso a cláusula era decorativa). A métrica de rotina do coach é contagem estruturada
no piloto (proposta, "Métrica de sucesso").

**Limite conhecido do guardrail (product review).** O regex de proibidos pega jargão, não
intenção: "seu corpo está pedindo uma pausa" passa. Por isso a 1.4 tem fixtures adversariais e a
0.3 decide se vale uma segunda checagem barata (classificador binário via Haiku: "este texto
manda o atleta mudar o plano? sim/não") antes de persistir o bloco — custo de uma chamada Haiku
por análise, contra as quatro que a tradução do coach já faz.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| O LLM ignora os guardrails e escreve "pule o treino de quinta" | Fixtures com asserção de proibidos; regra explícita e exemplo negativo no `SKILL.md`; o coach vê o mesmo texto (D3.3); kill switch |
| Bloco em PT degrada os campos do coach em inglês | Eliminado: a chamada 1 (coach) é intocada; o bloco nasce numa segunda chamada separada (D2) |
| Atleta lê análise de outro atleta | Endpoint novo escopado por dono (D4) + teste; o endpoint antigo fica registrado como gap |
| Análise nunca fica pronta (LLM fora, `FAILED`) | `pending` para de consultar em 3 min; `FAILED` → `204` → card some; o drawer continua útil (etapas, perfil) |
| Treinos antigos sem bloco geram "cadê minha análise?" | Sem card, sem promessa: o sinal "Análise pronta" só aparece quando existe; proposta registra backfill como decisão do founder |
| Custo de LLM sobe | +1 chamada gpt-4o-mini por treino (rota `simple`, 6,7x mais barata que Haiku); timeout/retry independentes |
| **Pré-mortem Codex (2026-08-29), seis achados, todos confirmados no código e incorporados:** (1) bloco do atleta no DTO do coach sem endurecer `GET /analises/treino/{id}` → hardening por role no escopo (D4); (2) janela sem linha `PENDING` após o registro → endpoint por elegibilidade (D4); (3) prompt sem duração/pace/etapas → payload ampliado (D2); (4) guardrail só em fixture → validador em runtime (D2); (5) `GET /planos/{atletaId}` sem dono para `ROLE_ATLETA` → 404 (D4); (6) métrica inflada pelo polling → dedupe por `atletaPrimeiraVisualizacaoEm` (D6) | — |
