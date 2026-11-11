**Tamanho:** L · **Trilha:** Full

> Referência visual: canvas "Perfil do Atleta — Antes × Sugestão"
> (https://claude.ai/artifact/WWKTwwKSwW42ZFap7dz4NC, artboards `Sugestão` em 1440 e
> `Sugestão — 1366×768`). O `design.md` desta change transcreve o artboard em tokens, medidas e
> regras — o link é apoio, não fonte de verdade.

## Why

A tela `/#/coach/athletes/:atletaId` (`CoachAthleteProfilePage`) é a que o treinador abre para
decidir o que fazer com um atleta, e hoje ela não ajuda a decidir. Crítica de design feita em
11/11/2026 sobre a produção, com medições no DOM:

- **A decisão não está na primeira dobra.** O gráfico PMC ocupa a largura inteira logo abaixo do
  cabeçalho; "Sinais recentes" e "Sugestões recentes" ficam a mais de uma tela de rolagem e dizem a
  mesma frase duas vezes (`acaoSugerida` do sinal e `summary` da sugestão vêm do mesmo
  `MotivoAtencao.suggestedAction`).
- **O plano da semana não mostra o realizado.** `TreinoPlanejadoCard` exibe só `statusExecucao`
  (Realizado/Perdido/Pendente); o que o atleta fez de fato, RPE, sensações e desvio do prescrito
  exigem abrir "Ver realizado" dia a dia.
- **Cabeçalho em 5 linhas** (nome, nível/objetivo, vencimento, linha do relógio, botões), sem `h1`;
  o canal Garmin ocupa uma linha inteira com texto fixo.
- **Tipografia abaixo do mínimo:** 59 nós a 11px; subtítulo do gráfico com contraste 3,46:1
  (mínimo 4,5:1); alvos de toque de 18px no seletor de período.
- **Cards vazios em tamanho cheio** ("Melhores esforços", "Revisão semanal") e o formulário de
  cobrança no rodapé de uma tela de treino.
- **Enums crus na UI** (`INTERMEDIARIO`, `CONTINUO`, `ADERENCIA`) e três formatos de data.

Estrela-guia: o Menthoros otimiza a rotina do treinador. Esta tela é onde ele gasta a revisão
diária; cada rolagem e cada clique para achar o que decidir é custo repetido por atleta.

## What Changes

1. **Faixa "Precisa de decisão"** no topo, logo abaixo das abas: até 3 cards, um por item que exige
   ação do treinador, cada um com evidência, bloco "Sugestão da IA" quando houver `sugestaoId`, e
   ações na própria faixa (Aceitar · Ajustar · Rejeitar; Revisar prova; Dar baixa). Fontes já
   existentes no perfil: `sinaisRecentes`, `sugestoesRecentes`, provas pendentes de ciência e
   cobrança vencida. "Sinais recentes" e "Sugestões recentes" deixam de existir como cards
   separados.
2. **Plano da semana como lista planejado × realizado**, uma linha por dia (Seg–Dom), com o
   realizado vinculado (`treinoRealizadoId` → `realizadosRecentes`), selo "Diferente do prescrito"
   quando o tipo realizado difere do planejado, chip "Dor relatada" quando `sensacoes` contém
   `DOR`, dia de hoje destacado, cadeado/editar com as regras atuais de `CurrentWeekPlan`.
3. **Cabeçalho em 2 linhas** com `h1`, nível · objetivo em PT-BR, canal do relógio num chip com
   detalhe sob demanda, ação primária ("Ajustar plano") ao lado do nome e as demais ações
   (onboarding, kudos, atualizar) num menu; abas **Visão geral · Financeiro · Histórico**. A aba Financeiro recebe `CobrancaAtletaSection` (só proprietário) e
   mostra "N vencida" no rótulo; Histórico recebe o PMC completo, Melhores esforços, Revisão
   semanal e Provas.
4. **Coluna direita** na Visão geral: resumo de cobrança (só proprietário, só quando vencida ou a
   vencer em 7 dias), "Carga diária (TSS)" compacto com realizado × planejado e seletor 2/4/12
   semanas (default 4), "Aderência semanal" (até 4 semanas + link para a série de 8 em Histórico)
   e uma linha "Sem dados ainda" por card vazio, apontando para Histórico. A Visão geral é um
   **resumo**; a leitura completa de carga (PMC com CTL/ATL/TSB) e a adesão de 8 semanas exigidas
   por `coach-athlete-diagnosis` continuam inteiras na aba Histórico, e todo card de decisão
   gerado por carga (FADIGA, SOBRECARGA) cita o TSB/ATL que o gerou com link direto para lá.
5. **Rótulos PT-BR para todo enum exibido** (nível, objetivo, tipo de treino, motivo de atenção,
   severidade, status de sugestão) e **um formato de data** (`Seg 09/11`, `09–15/11`).
6. **Acessibilidade e densidade:** corpo mínimo 13px, 11px só em eyebrow maiúsculo com contraste
   ≥ 4,5:1, alvos de clique ≥ 40px, `:focus-visible` visível, `prefers-reduced-motion` respeitado.
7. **Breakpoints:** 1440 (referência), 1366×768 (notebook: faixa de decisão inteira na primeira
   dobra, linha do plano sem empilhar chips), ≤ 900px (coluna única).

**Entrega mínima que sustenta a métrica:** Fases 1, 3 e 4 do `tasks.md` (adapters, faixa de
decisão, plano planejado × realizado). Fases 2, 5 e 6 podem ir em PRs seguintes.

Fora de escopo (ver "Open Questions & Assumptions"): sinal de dor no backend
(`add-pain-attention-signal`), qualquer campo novo no contrato `GET /coach/atletas/{id}/perfil`,
mudanças no Inbox, botão "Mensagem" (sem fluxo real até `add-athlete-coach-messaging`), link
"Plano de taper" (sem `add-taper-guidance`), layout abaixo de 600px além de não quebrar.

**Convivência com o Inbox:** a mesma decisão (aprovar sugestão, dar ciência de prova) existe no
Inbox e aqui, lendo o mesmo estado do backend. O Inbox é a triagem entre atletas; o perfil é a
decisão sobre um atleta. Decidir numa tela remove o item da outra na próxima carga — critério de
aceite abaixo.

## Capabilities

### New Capabilities

- `coach-athlete-profile`: layout, faixa de decisão, plano planejado × realizado e regras de
  rotulagem da tela de perfil do atleta no shell do coach.

### Modified Capabilities

- `design-system`: dois componentes compartilhados novos, `AiSuggestionBlock` (receita única do
  token `aiHighlight`, hoje copiada inline em três lugares) e `DecisionCard`.
- `coach-athlete-diagnosis`: sem mudança de requisito — "Adesão e carga no mesmo eixo semanal"
  (8 semanas) e "Gráfico de Forma legível" passam a ser cumpridos na aba Histórico do perfil; a
  Visão geral é um resumo e não substitui esses requisitos.

## Impact

**Frontend (`apps/menthoros-front`)** — único repositório tocado.

- `src/features/coach/pages/CoachAthleteProfilePage.tsx` reescrita em torno de abas e das duas
  colunas; `SectionCard` local some em favor de `shared/components/Card` + `CardHeader`.
- Novos em `src/features/coach/`: `adapters/decisionCardsAdapter.ts`, `adapters/weekPlanRowsAdapter.ts`,
  `adapters/enumLabels.ts`, `components/DecisionStrip.tsx`, `components/DecisionCard.tsx`,
  `components/WeekPlanList.tsx`, `components/WeekPlanRow.tsx`, `components/DailyLoadChart.tsx`,
  `components/AthleteProfileHeader.tsx`, `components/AthleteProfileTabs.tsx`.
- Novo em `src/shared/components/`: `AiSuggestionBlock.tsx`.
- `CurrentWeekPlan.tsx` passa a renderizar `WeekPlanList`; `TreinoPlanejadoCard` continua em uso
  pelo Inbox (`PlanTabPanel`) e não muda.
- `RecentSignalsPanel` e `RecentSuggestionsPanel` saem da tela (ficam no código até a aba
  Histórico decidir se os lista; remoção fica para follow-up).
- Testes: `CoachAthleteProfilePage.test.tsx` (29 casos) é reescrito por seção; E2E novos para a
  faixa de decisão; `editar-treino-aprovado.spec.ts`, `reenvio-relogio.spec.ts` e
  `suggestion-edit-delta.spec.ts` são ajustados para a nova navegação.

**Backend:** nenhum. Tudo que a faixa de decisão e a lista do plano mostram já vem do perfil
agregado, de `ProvaService.listarPendentesRevisao` e de `ContratoAtletaService`.

**Contrato:** nenhum campo novo. O vínculo planejado → realizado usa `treinoRealizadoId` e
`realizadosRecentes` (7 dias); ver premissa A2.

## Critérios de aceite

- **Dado** um atleta com uma sugestão `PENDING`, uma prova pendente de ciência e cobrança
  vencida, **quando** o treinador abre o perfil em 1366×768,
  **então** vê três cards na faixa "Precisa de decisão · 3" inteiros na primeira dobra, cada um
  com sua ação, e nenhum card "Sinais recentes" ou "Sugestões recentes".
- **Dado** o card de sugestão, **quando** o treinador clica "Aceitar", **então** `useSugestaoDecisao`
  chama `SugestaoService.aprovar`, o card some da faixa e o contador cai para 2, sem recarregar a
  página.
- **Dado** um treino planejado `REGENERATIVO` de Seg com `treinoRealizadoId` apontando para um
  realizado `CONTINUO` com `sensacoes = ["DOR"]`, **quando** a lista do plano renderiza, **então** a
  linha de Seg mostra o planejado à esquerda, "Contínuo · 42 min · TSS 41" à direita, o chip
  informativo "Tipo diferente do planejado" (tom neutro, não de alerta — ver A1), o chip "Dor
  relatada" em tom de alerta, e o cadeado com o rótulo atual de `buildLockLabelFromRejection`.
- **Dado** `profile.avisos` contendo `"sugestoesRecentes"`, **quando** a Visão geral renderiza,
  **então** a faixa mostra "Não foi possível carregar as decisões" com "Tentar de novo", e não
  some.
- **Dado** uma sugestão `PENDING` em `sugestoesRecentes` e nenhum sinal com `sugestaoId`,
  **quando** a faixa renderiza, **então** há um card da sugestão com `summary` vindo de
  `SugestaoService.detalhe` e as três ações.
- **Dado** um sinal `FADIGA` ou `SOBRECARGA` na faixa, **quando** o card renderiza, **então** a
  evidência traz o TSB e o ATL do último ponto de `profile.pmc` ("TSB −18,4 · ATL 92") e um link
  "Ver PMC" que abre a aba Histórico.
- **Dado** uma sugestão aprovada no Inbox, **quando** o treinador abre o perfil, **então** ela não
  está na faixa; **dado** uma sugestão aprovada na faixa, **quando** volta ao Inbox, **então** o
  item não está na fila (mesmo estado do backend; sem cache local entre telas).
- **Dado** um dia passado com `statusExecucao = PERDIDO`, **quando** a lista renderiza, **então**
  a coluna Realizado mostra "Perdido" em tom `danger` e nenhum chip.
- **Dado** o dia de hoje, **quando** a lista renderiza, **então** a linha tem fundo
  `aiHighlight.bg`-equivalente neutro (`rgba(189,222,90,0.06)`) e a palavra "Hoje" na coluna
  Realizado quando ainda não há realizado.
- **Dado** um treinador que não é proprietário, **quando** abre o perfil, **então** a aba
  Financeiro e o resumo de cobrança não existem no DOM.
- **Dado** `profile.avisos` contendo `"pmc"`, **quando** a Visão geral renderiza, **então** "Carga
  diária" mostra "Dado indisponível" sem barras zeradas (mesma regra de `coach-athlete-diagnosis`).
- **Dado** qualquer enum exibido (`INTERMEDIARIO`, `CONTINUO`, `ADERENCIA`, `ALTA`), **quando** a
  tela renderiza, **então** nenhum texto visível contém o valor cru do enum.
- **Dado** a tela em 1366×768, **quando** o plano renderiza uma linha com dois chips no realizado,
  **então** a linha tem a mesma altura de uma linha sem chips (chips não empilham).
- **Dado** `prefers-reduced-motion: reduce`, **quando** o treinador passa o mouse num botão,
  **então** não há transição animada.

## Riscos e mitigações

Pre-mortem cross-model (Codex, 11/11/2026) + review de produto; cada item virou decisão de design.

| Risco | Como falha | Mitigação |
|---|---|---|
| Faixa depende de vínculo sinal→sugestão que o backend não preenche | `sugestaoId` vem `null`; `SugestaoRecenteDto` não traz `summary` | sugestão `PENDING` é card próprio com `detalhe`; sinal é card próprio; fusão só com vínculo (A9, D2) |
| Falha de consulta vira "nada a decidir" | agregador devolve lista vazia + `avisos`; faixa escondia sem itens | estado de erro visível com "Tentar de novo" (A10, D2) |
| Total de TSS parcial parece completo | numerador só soma realizados dentro de `realizadosRecentes` (7 dias) | `TSS ≥ N` com tooltip quando falta vínculo/TSS; nunca zero com treino concluído (A11, D4) |
| Selo "Diferente do prescrito" dispara falso | tipo≠tipo não compara duração/intensidade; tipo pode ser nulo | rótulo "Tipo diferente do planejado", só com ambos os tipos; informativo, não alerta; validação no piloto (A1, D4) |
| PMC a uma aba de distância tira o número da decisão | FADIGA/SOBRECARGA sem TSB visível | evidência TSB/ATL no card + "Ver PMC" (D2) |
| Duas superfícies para a mesma decisão | Inbox e perfil divergem | mesmo estado do backend, sem cache; critério de aceite de consistência; perfil = decisão por atleta, Inbox = triagem |
| Métrica sem baseline | "< 30 s" era chute | Fase 0 instrumenta a tela atual; meta relativa ao baseline |

## Métrica de sucesso

- **Tempo até a primeira ação** no perfil (abrir → aprovar/rejeitar/ajustar/dar ciência),
  evento `coach_profile_first_action_ms`: instrumentar a tela **atual** na Fase 1 (task 0.1) e
  medir ≥ 1 semana antes de mergear a faixa; meta = mediana **≤ 50% do baseline** em perfis com
  item pendente.
- **Decisões tomadas na faixa / perfis abertos com item pendente** ≥ 60% após 2 semanas, com
  guarda: a taxa de "Ajustar" + "Rejeitar" não pode cair abaixo da do Inbox no mesmo período —
  se "Aceitar" subir só porque ficou mais fácil de clicar, a métrica não vale.
- **Moat preservado:** Aceitar/Ajustar/Rejeitar na faixa passam pelos mesmos endpoints e
  registram o mesmo delta de edição que `suggestion-edit-delta.spec.ts` cobre hoje; a taxa de
  aceitação de sugestões (baseline ~60–65%) continua medida no mesmo lugar.
- Zero regressão nos E2E de edição de treino aprovado e reenvio ao relógio.

## Open Questions & Assumptions

- **A1 — "Diferente do prescrito" é regra de front:** `tipoTreino` do realizado vinculado ≠
  `tipoTreino` do planejado. O backend tem `TipoTreinoConsistenciaValidator` na reconciliação, mas
  não expõe o veredito no DTO do plano. Se a regra do backend divergir (ex.: `CONTINUO` casa com
  `REGENERATIVO`), o selo pode aparecer onde a reconciliação aceitou. Por isso o chip é
  **informativo (tom neutro), não de alerta**, até o backend expor o veredito; antes da Fase 4,
  validar a regra numa amostra de atletas do piloto e registrar a taxa de divergência (critério:
  ≤ 10% das linhas com selo onde a reconciliação aceitou; acima disso, só o backend decide).
- **A2 — vínculo por `realizadosRecentes` (7 dias):** a semana vigente nunca tem mais de 7 dias
  passados, então todo `treinoRealizadoId` da semana encontra o realizado na lista. Realizado fora
  da janela (não deveria ocorrer) cai para o comportamento atual: só o estado.
- **A3 — fontes da faixa de decisão:** `sinaisRecentes` traz só severidade ≥ `ALTA` (corte da
  fila); itens `MEDIA` não aparecem. Cobrança vencida entra na faixa só para proprietário.
- **A4 — "Sugestão da IA":** o texto exibido é `summary` da `SugestaoCoach`; "confiança" vem de
  `confidence` (`HIGH`/`MEDIUM` → "alta"/"média"). Não há geração nova de IA nesta change.
  **`SugestaoRecenteDto` não traz `summary`/`confidence`** — vêm de `SugestaoService.detalhe(id)`
  por sugestão pendente, como `RecentSuggestionsPanel` já faz; a faixa herda esse fetch.
- **A9 — sinal e sugestão são cards separados** (pre-mortem Codex): `sinaisRecentes[].sugestaoId`
  é preenchido com `null` pelo backend ("match heurístico não implementado"). A faixa renderiza
  toda sugestão `PENDING` como card próprio e todo sinal como card próprio; fundir os dois depende
  de o backend preencher o vínculo (follow-up de backend pequeno, fora desta change). Até lá, o
  mesmo tema pode ocupar 2 dos 3 slots.
- **A10 — falha de fonte é visível:** `avisos ∋ "sinaisRecentes" | "sugestoesRecentes"` ou erro
  no `detalhe` mantém a faixa com estado de erro e "Tentar de novo"; nunca some como se não
  houvesse decisão.
- **A11 — total de TSS da semana é parcial** quando falta realizado ou TSS; mostra `≥` com
  tooltip, nunca zero.
- **A5 — "Ajustar" no card de sugestão** abre o mesmo diálogo de edição de `useSugestaoDecisao.editar`
  já usado em `RecentSuggestionsPanel`.
- **A6 — aba Histórico** recebe os cards existentes sem redesenho (PMCChart, MelhoresEsforcosPanel,
  WeeklyReviewCard, AthleteRacesPanel). Redesenhá-los é outra change.
- **A7 — seletor "2 sem / 4 sem / 12 sem":** o perfil traz 90 dias de PMC; "12 sem" usa tudo.
  Default **4 sem** (review de produto: 2 semanas têm pouco sinal; a spec canônica pede 8, que
  ficam em Histórico).
- **A8 — cortes do review de produto (11/11):** botão "Mensagem" (era `mailto:` improvisado) e
  link "Plano de taper" (desabilitado) saíram; o artboard os mostra, o código não os terá até as
  changes correspondentes existirem. Reverter só se o treinador pedir.
- **Aberto — prioridade vs. piloto:** change L de front puro; confirmar no `SPRINTS.md` se entra
  antes ou depois do primeiro cliente pagante. A entrega mínima (Fases 1, 3, 4) foi definida para
  reduzir esse custo.
- **Aberto — card de dor:** depende de `add-pain-attention-signal`. Até lá, dor aparece só como chip
  "Dor relatada" na linha do plano e em Treinos recentes.
