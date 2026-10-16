**Tamanho:** M · **Trilha:** Full

> Full porque toca dois repositórios (enum e prior no backend; três telas no front), amplia um
> contrato de API (valores novos em `DispositivoMarca`, que o front espelha como union type) e
> carrega uma decisão de produto que o código não resolve sozinho: o que o Menthoros **promete**
> por marca ("suportado", "compatível via app parceiro", "só ingestão") e como isso é dito ao
> atleta e ao treinador. O esforço (3–5 dias) sozinho seria S; a decisão de produto e a superfície
> em dois repos sobem para M.

**Status:** proposta (2026-10-15, `/change`)
**Criado:** 2026-10-15
**Origem:** `knowledge/engineering/levantamento-expansao-relogios-intervals-icu.md` (2026-10-15),
itens **C1** (`watch-brand-no-perfil-atleta`) e **C2** (`guia-conexao-por-marca`), fundidos numa
única change walking-skeleton: a marca persistida sozinha (C1) não muda nada na rotina de ninguém;
o guia (C2) é a primeira ação que a consome.

- **Premissas verificadas no código (2026-10-15):** o levantamento dizia que a marca "é capturada no
  onboarding e descartada" e que o C1 precisaria "persistir `WatchBrand` no atleta, com migration".
  **Não é o caso.** O onboarding do atleta já persiste `DispositivoMarca` (obrigatória) e
  `dispositivoModelo` (texto livre) em `tb_perfil_onboarding_atleta` desde a V67 (retrofit 10.6,
  2026-07-21), e o `ConfidenceScorer` já a usa como prior via `FontePriority`. O que falta é (a) o
  enum conhecer Amazfit e Samsung, (b) alguém ler a marca fora do scorer. **Não há
  migration nesta change**: a coluna é `VARCHAR(20)` e os valores novos cabem. `WatchBrand` (da
  waitlist) é um segundo enum para o mesmo conceito e **fica fora do escopo** (ver Non-goals).
- **Escopo por marca (decisão do founder, 2026-10-15):** Huawei, Suunto e Wahoo **ficam fora
  desta change** — sem valor novo no enum (Huawei, Wahoo), sem guia e sem gate (Suunto já existe
  no enum e continua selecionável no onboarding, mas aparece no guia como "ainda não coberto").
  O enum ganha só `AMAZFIT` e `SAMSUNG`; a matriz cobre Garmin, Apple, Amazfit, COROS, Samsung e
  Polar. As três saem num follow-up quando houver demanda medida.
- **Dependência zero.** Não depende de `intervals-icu-webhook-ingestion`, `add-sync-health-signal`
  nem de `first-party-ingestion-architecture`. É pré-requisito de C3–C6 do levantamento e do beta
  por marca (seção 6 do levantamento): sem o guia, um atleta beta de COROS não consegue conectar
  sozinho.
- **Product review (2026-10-15, `product-reviewer`): Refine**, 12 achados, incorporados: (1) a
  métrica "queda de 50% nos tickets" partia de baseline zero — trocada por intervenções manuais
  por atleta beta e proxy de push por treino (`tb_treino_planejado.sincronizado_em`) excluindo
  marcas sem push; (2) **"Em validação" fixado**
  para COROS/Suunto/Wahoo/Huawei, com critério de promoção a "Suportado" na própria matriz; (3) a
  linha do coach afirmava "chegam ao relógio automaticamente" mesmo sem saber se o atleta ligou o
  upload — reescrita como condicional, e a página do coach ganha o guia da marca em modo leitura
  ("o que pedir ao atleta"); (4) entrada Garmin cita o gate de 2026-07-14; (6) prior de Huawei
  cai para 3 até o gate fechar; (8) dono da revisão do conteúdo vira item recorrente no Kanban, e
  o guia linka a doc oficial do intervals.icu para o que muda rápido; (9) guia na etapa 1 do
  onboarding **decidido fora** desta change, como follow-up; (10) e (11) viram gate 0: distribuição
  real de marcas antes de implementar, e decisão do founder sobre expor as quatro marcas novas no
  chip do onboarding; (12) posicionamento honesto por marca registrado como argumento de venda.
- **Pre-mortem cross-model (Codex, 2026-10-15): needs-attention**, 4 achados (2 altos), verificados
  contra `OnboardingServiceImpl`, `ConfidenceScorerImpl` e `IntervalsIcuWorkoutConverter`. Todos
  incorporados: (1) **D5 derrubado** — o `UPDATE` de rollback não resolve: uma aba antiga do front
  continua oferecendo `HUAWEI` e `salvarRascunho` aceita e persiste, inclusive em perfil
  `COMPLETO`; qualquer gravação entre o `UPDATE` e a volta do backend antigo quebra a leitura do
  perfil (inclusive na geração de plano). A adição ao enum passa a ser **forward-only**: nunca
  reverter o backend sem os valores; rollback é só do front. (2) **D2 derrubado** — o scorer dá 15
  pontos inteiros para prioridade ≤ 2; sem histórico, onboarding + FC + pace somam 35, e uma marca
  com prior 2 leva a 50 (tier A), o que **impede a calibração de começar** (`persistirBaselineSnapshot`
  só inicia calibração no primeiro snapshot se tier ≠ A). As quatro marcas novas ficam com prior
  **3** até o gate, e entra teste integrado de score/tier/calibração. (3) O acordeão (D4) não cobre
  "troquei de relógio" para o coach — a linha passa a dizer "marca informada no onboarding, não
  confirmada" e D4 deixa de reivindicar isso. (4) O resumo estático prometia entrega; já condicional
  pelo product review, e o coach passa a ver também "Em validação" e as limitações de formato
  (um tipo de alvo por treino no COROS, sem etapa por distância no Suunto) — relevantes porque o
  `IntervalsIcuWorkoutConverter` escolhe FC ou pace por etapa e prioriza distância.

# add-watch-brand-connection-guide

## Por quê

O Menthoros não integra com relógio; integra com o intervals.icu, que fala com o relógio. Hoje
só o canal Garmin foi validado de ponta a ponta (gate de 2026-07-14), e **toda a interface assume
Garmin**: o card de conexão do atleta diz "receber os treinos planejados no relógio" para qualquer
marca, e o chip do treinador diz "Enviado ao intervals.icu/Garmin" com o nome gravado.

Para as demais marcas o circuito fecha de formas diferentes — nativo com janela de 7 dias (COROS),
parcial por modelo (Amazfit), só ingestão (Polar), ou só com um app de
terceiro no celular (Apple Watch, Samsung). O atleta de qualquer uma delas conecta o intervals.icu,
não liga a conexão do relógio em *Settings → Connections*, não marca "Upload planned workouts", e
o treino aprovado nunca chega ao pulso. **O ticket "conectei e o treino não chegou" cai no
treinador**, que não tem como saber qual relógio o atleta usa nem o que deveria ter feito — a
marca está no onboarding, mas nenhuma tela do coach a mostra.

Esta change dá ao atleta o passo a passo **da marca dele** no momento de conectar, e dá ao
treinador a marca e o que ela implica (push nativo, via app, ou só ingestão) na tela do atleta.
Zero código de integração: é informação no lugar certo.

## O que muda

### Backend (`apps/menthoros-backend`)

- **`DispositivoMarca`** ganha `AMAZFIT` e `SAMSUNG`. Ordem e nomes existentes intactos
  (`GARMIN`, `COROS`, `POLAR`, `SUUNTO`, `APPLE`, `OUTRO`).
- **`FontePriority.PRIORIDADE_DISPOSITIVO`** mapeia os dois valores novos de forma explícita
  (design D2), em vez de cair no default 10 — o default é para "marca desconhecida", e essas são
  conhecidas.
- Nenhuma migration, nenhum endpoint novo, nenhum DTO novo. A marca já sai em
  `GET /api/v1/atletas/{atletaId}/onboarding` (`AtletaOnboardingOutputDto.dispositivoMarca`), que
  atleta e coach já chamam.

### Frontend (`apps/menthoros-front`)

- **`types/Onboarding.ts`:** union `DispositivoMarca` e `DISPOSITIVO_MARCA_LABELS` ganham as
  duas marcas; o chip group do onboarding passa a oferecê-las automaticamente.
- **Matriz de compatibilidade por marca** (`watchCompatibility.ts`, conteúdo estático em PT-BR,
  design D3): para cada marca, o **modo de push** (`NATIVO`, `NATIVO_JANELA_7_DIAS`,
  `PARCIAL_POR_MODELO`, `VIA_APP_PARCEIRO`, `SEM_PUSH`), o modo de ingestão, o rótulo de
  posicionamento ("Suportado" só para Garmin; "Em validação" para COROS; "Compatível via app
  parceiro" para Apple e Samsung; "Parcial por modelo" para Amazfit; "Só treino realizado" para
  Polar; "Ainda não coberto" para Suunto e Outro), o critério de promoção a "Suportado" (gate da seção 6 do
  levantamento fechado com atleta real, data em `verificadoEm`) e os passos de conexão, curtos,
  com link para a documentação oficial do intervals.icu no que muda rápido (janela de dias, lista
  de modelos). Fonte: seção 2 do levantamento; a entrada Garmin cita o gate de 2026-07-14.
- **`IntervalsIcuConnectionCard`** (perfil do atleta): lê a marca do perfil de onboarding e mostra
  o guia da marca **antes e depois** de conectar — antes, para o atleta saber o que vai precisar
  fazer no intervals.icu; depois, como checklist ("ligue o COROS em Connections e marque Upload
  planned workouts"). Guia das outras marcas acessível num acordeão, sem alterar o perfil (design
  D4). Sem perfil de onboarding (atleta anterior à V67), o acordeão abre fechado com a dica
  "informe seu relógio no onboarding".
- **`CoachAthleteProfilePage`:** uma linha "Relógio" no cabeçalho — marca, modelo (se informado)
  e o que esperar do canal em linguagem de treinador, **sem afirmar o que o sistema não sabe**:
  "treinos aprovados vão ao intervals.icu e chegam ao relógio se o atleta ligou a conexão COROS e
  o upload de treinos planejados" (nativo), "chegam via app parceiro no celular do atleta"
  (Apple/Samsung), "não chegam ao relógio; o atleta vê o treino no Menthoros e no intervals.icu, e
  só o realizado volta" (Polar). Ao lado, "O que pedir ao atleta" abre o **mesmo guia** da marca
  em modo leitura — é o que o coach usa na hora do ticket "conectei e não chegou". A linha cobre
  **o que esperar**; **por que não chegou** (upload desligado, relógio não conectado) depende de
  C3 e fica dito na própria linha como "não verificado automaticamente".
- **`SyncStatusChip`:** tooltip "Enviado ao intervals.icu/Garmin" vira "Enviado ao intervals.icu".
  **Só o texto.** Fazer o chip dizer a verdade por marca ("No intervals.icu" quando o push ao
  relógio não existe) exige a marca na listagem de atletas e é escopo de C4/C6 (Non-goals).

## Capabilities

### Added
- `watch-connection-guide`: orientação de conexão do relógio ao intervals.icu por marca, para o
  atleta (passo a passo) e para o treinador (o que esperar do canal). Spec delta em
  `specs/watch-connection-guide/spec.md`.

## Critérios de aceite

- **CA1 — enum e prior.** Given o backend, When `DispositivoMarca.values()` é lido, Then contém os
  oito valores (seis atuais + `AMAZFIT`, `SAMSUNG`), e
  `FontePriority.deDispositivo(m)` retorna o valor da tabela D2 para cada um dos oito — nenhum cai
  no default 10. Verificável por teste parametrizado.
- **CA2 — onboarding aceita as marcas novas.** Given um rascunho de onboarding com
  `dispositivoMarca = "AMAZFIT"`, When `POST /api/v1/atletas/{id}/onboarding`, Then 200 e o
  `GET` subsequente devolve `AMAZFIT`. Idem para `SAMSUNG`. Verificável por `OnboardingControllerIT`
  **novo** (task 1.3), parametrizado — o `OnboardingControllerTest` atual mocka service e mapper e
  não prova persistência.
- **CA3 — guia da marca do atleta.** Given um atleta com `dispositivoMarca = COROS` no perfil de
  onboarding, When abre o perfil, Then o card de conexão mostra o guia COROS expandido (passos
  "Settings → Connections → COROS", "adicionar o calendário Intervals.icu Training Plan", "janela
  de 7 dias") e os demais guias fechados. Verificável por teste de componente com o hook mockado.
- **CA4 — guia sem perfil.** Given um atleta sem perfil de onboarding (ou `dispositivoMarca`
  nulo), When abre o perfil, Then o card mostra o acordeão com todas as marcas fechadas e a dica
  para informar o relógio no onboarding; o botão "Conectar com intervals.icu" continua disponível.
- **CA5 — posicionamento honesto por marca.** Given `dispositivoMarca ∈ {APPLE, SAMSUNG}`, Then o
  guia usa o rótulo "Compatível via app parceiro" e nomeia o app (Intervals.icu Companion /
  Watchletic) sem a palavra "suportado". Given `POLAR`, Then o rótulo é "Só treino realizado" e o
  texto diz que o treino planejado **não** chega ao relógio pelo intervals.icu. Given `AMAZFIT`,
  Then o guia lista explicitamente os modelos com push automático (T-Rex 3 Pro, Balance 2) e diz
  que os demais exigem importar o `.fit` no Zepp. Given `COROS`, Then o rótulo é "Em validação" com a frase de ação "estamos validando com atletas; se o treino
  não chegar, avise seu treinador". Só `GARMIN` usa "Suportado". Given `SUUNTO` ou `OUTRO`, Then o rótulo é "Ainda não coberto" com
  orientação genérica (abrir Connections no intervals.icu) e sem promessa. Verificável por asserção de
  texto nos testes.
- **CA6 — treinador vê o relógio.** Given o coach abre `CoachAthleteProfilePage` de um atleta com
  `dispositivoMarca = POLAR`, Then vê "Relógio: Polar" e "Treinos aprovados não chegam ao relógio
  pelo intervals.icu; só o treino realizado volta". Given `GARMIN`, Then vê "chegam ao relógio se
  o atleta ligou a conexão Garmin e o upload de treinos planejados (não verificado
  automaticamente)". Given qualquer marca, Then "O que pedir ao atleta" abre o guia da marca em
  modo leitura. Given sem perfil, Then vê "Relógio não informado" com o atalho "Preencher
  onboarding" que já existe na página.
- **CA7 — texto do chip.** Given qualquer atleta com status `SINCRONIZADO`, Then o tooltip do
  `SyncStatusChip` é "Enviado ao intervals.icu" (sem "Garmin"). Teste existente atualizado.
- **CA8 — nada quebra para Garmin.** Given `dispositivoMarca = GARMIN`, Then o card mostra o guia
  Garmin expandido com o rótulo "Suportado" e o fluxo de conectar/desconectar é idêntico ao atual
  (testes existentes do card continuam verdes sem alteração de comportamento).

## Métrica de sucesso

Não há baseline de tickets (hoje nenhum atleta não-Garmin conectado; contagem no WhatsApp do
founder, sem registro), então a métrica não pode ser "queda de X%". Métrica **primária**, sem
baseline e observável: **% dos atletas beta não-Garmin que conectam e recebem o primeiro treino
no relógio sem intervenção manual do founder ou do coach**. Alvo: **100% nos primeiros 3 a 5
atletas por marca beta** (Apple e Amazfit primeiro, pela ordem do founder), com contagem manual de intervenções numa
planilha semanal cuja criação é a task 0.3 — pré-requisito do deploy. Proxy automático: **% de
atletas com ao menos um treino planejado com `tb_treino_planejado.sincronizado_em` preenchido nos
7 dias após conectar**, excluindo marcas `SEM_PUSH` e `VIA_APP_PARCEIRO`, com o N registrado
(consulta em `tb_integracao_externa` × `tb_perfil_onboarding_atleta` × `tb_treino_planejado`).
`sincronizado_em` é gravado apenas por `TreinoPlanejado.marcarComoSincronizado`, no sucesso do push;
o `ultimoPush` do DTO de status **não serve**: deriva de `ultima_sincronizacao`, que webhook e pull
também gravam (achado do DoR, 2026-10-16). Para o treinador, o resultado esperado é não precisar explicar
Connections/upload a cada atleta novo. Opcional, se a pergunta "o guia é lido?" ficar relevante:
evento "guia aberto → conexão concluída" — fora desta change.

**Posicionamento.** A honestidade por marca ("Compatível via app parceiro", "Só treino
realizado") é argumento de venda para a assessoria — contrasta com o "funciona com tudo" dos
concorrentes — desde que nunca vire promessa; "Em validação" protege a assessoria de prometer ao
atleta o que ainda não foi verificado.

## Non-goals

- **Unificar `WatchBrand` (waitlist) com `DispositivoMarca` (onboarding).** Dois enums para um
  conceito é dívida real, mas a waitlist tem segmento (`WaitlistSegment`) e teste próprio; mexer
  ali é outra change (`chore/unify-watch-brand-enums`), sem urgência.
- **Ler a conexão do relógio em runtime** (`icu_garmin_*` e equivalentes no `GET /athlete/0`) e
  alertar quando "Upload planned workouts" está desligado — é o **C3** do levantamento, com gate
  de sondagem da API.
- **Perfil de compatibilidade no push** (um tipo de alvo por treino para COROS, sem rampa para
  Huawei) — **C4**. Chip de status honesto por marca — **C4/C6**.
- **Fallback de laps** quando a atividade volta sem `intervals` (Amazfit, Apple via Companion) —
  **C5**.
- **Permitir ao atleta trocar a marca no card.** O guia das outras marcas fica acessível no
  acordeão, o que cobre "comprei outro relógio" sem editar o perfil (design D4). Editar a marca
  após o onboarding concluído é Open Question 2.
- Canais nativos (Garmin Training API, app iOS/Wear OS) — seção 4 do levantamento, não planejar.
- Rotular `FonteDados` com o `device` original da atividade (item 7 do levantamento).

## Impacto

- **Contrato de API:** aditivo. `DispositivoMarca` ganha dois valores; clientes antigos do front
  (cache do browser) que não conheçam os novos só os veriam como string desconhecida no label —
  o `DISPOSITIVO_MARCA_LABELS` precisa de fallback para o nome cru (task 2.1).
- **Banco:** nenhum. `dispositivo_marca VARCHAR(20)` comporta `AMAZFIT`/`SAMSUNG` (7 chars).
- **`ConfidenceScorer`:** atletas que hoje escolhem `OUTRO` por falta de opção e passarem a
  escolher `AMAZFIT`/`SAMSUNG` mudam de prior 4 para o da tabela D2 — efeito só em atletas novos
  ou que refizerem o onboarding; sem recálculo retroativo.
- **Multi-tenant / segurança:** nenhum endpoint novo; o front consome `GET .../onboarding` que já
  aplica o tenant guard e já é acessível ao coach (botão "Preencher onboarding").
- **Coach-in-the-loop:** sem saída de IA; o guia é conteúdo estático revisado por humano, e a
  única coisa que vai ao atleta é texto de produto, não decisão de treino. O guia orienta o
  atleta sem passar pelo coach — aceitável como amplificação porque o coach vê o mesmo guia na
  página do atleta e o texto nunca promete entrega ao relógio.
- **Loop de aprendizado:** neutro de propósito (walking skeleton); o único efeito é o prior do
  `ConfidenceScorer` (D2), registrado como palpite conservador até os gates fecharem.
- **Rollback:** revert do PR do **front** apenas. A adição ao enum é **forward-only** (design D5):
  reverter o backend sem os valores quebra o `@Enumerated(STRING)` em qualquer perfil que já
  gravou `AMAZFIT`/`SAMSUNG`, e um `UPDATE` de normalização não fecha a janela
  (aba antiga do front continua gravando). O commit do enum vai separado do resto do backend para
  poder ficar mesmo que o restante reverta.

## Riscos e mitigações

- **Rollback do backend com valor novo gravado** (Alto, derrubado pelo Codex): se um atleta já
  escolheu `AMAZFIT` e o backend volta sem o valor, a leitura de `PerfilOnboardingAtleta` lança
  `IllegalArgumentException` — inclusive em `montarContexto` na geração de plano. Um `UPDATE` de
  normalização não resolve: uma aba antiga grava de novo entre o `UPDATE` e o deploy antigo.
  Mitigar: **enum forward-only** — commit separado, nunca revertido; deploy backend antes do
  front; rollback só do front (design D5).
- **Prior novo dispensa a calibração** (Alto, derrubado pelo Codex): prioridade ≤ 2 vale 15
  pontos no `ConfidenceScorer`; sem histórico, um atleta com onboarding completo, FC e pace
  limiar tem 35, e uma marca nova com prior 2 chegaria a 50 (tier A) — a calibração nunca
  começa. Mitigar: as duas marcas novas com prior **3** até o gate (design D2) e teste
  integrado de score → tier → início de calibração (task 1.4).
- **Conteúdo desatualiza** (Alto, de produto): a matriz vem de fórum e guias de 2026-10; o
  intervals.icu muda integrações com frequência (Huawei entrou em 2026-03, Zepp em 2025). Mitigar:
  cada entrada da matriz carrega `verificadoEm` e fonte; o guia mostra "informações de
  <mês/ano>" e **linka a doc oficial do intervals.icu** para o que muda rápido (janela de dias,
  modelos), em vez de replicar; a revisão vira **item recorrente no Kanban com dono e data**
  (task 5.2), não só uma linha no `CLAUDE.md` — ninguém olha `verificadoEm` num arquivo de código.
- **Prometer o que não se controla** (Alto, de produto): Watchletic é pago, Intervals.icu
  Companion tem autor único. Mitigar: rótulo "Compatível via app parceiro" obrigatório para
  Apple/Samsung (CA5), nunca "suportado"; o guia nomeia o app e diz que é de terceiro.
- **Amazfit por modelo** (Médio): dizer "Amazfit" sem lista de modelos gera ticket dos modelos sem
  push. Mitigar: CA5 exige a lista explícita.
- **Atletas pré-V67 sem perfil** (Baixo): o guia não sabe a marca. Mitigar: CA4 — acordeão
  fechado + dica; e o coach vê "Relógio não informado" com atalho para preencher.
- **Front antigo em cache** (Baixo): label cru para valores desconhecidos (task 2.1).

## Open Questions & Assumptions

**Ordem de prioridade por marca (decisão do founder, 2026-10-15):** Garmin → Apple Watch →
Amazfit → COROS → Samsung → Polar (Huawei, Suunto e Wahoo ficam fora desta change — decisão do
founder no mesmo dia). Estimativa de uso entre atletas de
assessoria no Brasil por triangulação (IDC, Counterpoint, Strava Year in Sport 2024/2025, imprensa
brasileira; não existe ranking público por marca no país — ver memo do CPO). Vale para: ordem do
acordeão no guia, ordem dos chips no onboarding, ordem dos gates manuais e do beta por marca.
Substituída pelo dado real assim que a task 0.3 (ou a Proposta nova 1 do memo) agregar `watchBrand`
e `dispositivo_marca`. Xiaomi (Mi Band/Redmi Watch) não entra no enum: não tem conexão com o
intervals.icu, só via bridge no celular — cai em `OUTRO` com uma linha no guia.

**Decidido no product review (2026-10-15):**

- **Rótulos de posicionamento:** "Suportado" **só Garmin** (gate 2026-07-14). **"Em validação"**
  para COROS até o gate da seção 6 do levantamento fechar com um atleta
  real — a promoção é uma edição na matriz com data em `verificadoEm`, sem código. "Compatível via
  app parceiro" (Apple, Samsung), "Parcial por modelo" (Amazfit), "Só treino realizado" (Polar).
  Motivo: o custo de errar é assimétrico — "Suportado" falso vira promessa quebrada e ticket para o
  coach; "Em validação" verdadeiro é só menos convidativo.
- **Guia na etapa 1 do onboarding: fora desta change.** O onboarding é o fluxo mais sensível a
  abandono e tem spec própria. Follow-up registrado: `add-onboarding-watch-fit-hint` — uma linha
  informativa (não o guia) logo após escolher Polar/Apple/Samsung/Amazfit, depois do pilot.

**Premissas assumidas (validar com o founder no gate 0):**

1. **Expor as duas marcas novas no chip do onboarding já.** Efeito colateral: quem escolhia
   "Outro" passa a se declarar Amazfit/Samsung, marcas de circuito parcial, e a superfície de
   ticket do pilot cresce. Alternativa: segurar os chips até o gate de cada uma. Premissa: expor
   as duas, com o rótulo ("Parcial por modelo" / "Compatível via app parceiro") visível no guia — medir demanda
   real vale mais que esconder a opção. Decisão do founder na task 0.1.
2. **Trocar a marca após o onboarding concluído.** O Codex confirmou que `salvarRascunho` aceita
   e persiste em perfil `COMPLETO`, então um "Atualizar relógio" restrito a marca/modelo é viável
   com o endpoint atual. **Fica fora** desta change (o acordeão cobre a consulta ao guia; o coach
   vê "marca informada no onboarding, não confirmada"), registrado como follow-up
   `add-athlete-watch-update`. Decidir no `/implement init` se entra como task extra.
3. **Onde o treinador vê a marca:** no cabeçalho da `CoachAthleteProfilePage` (uma linha) e não
   na listagem `CoachAthletesPage` — a listagem exigiria a marca no `AtletaOutputDto` (risco de
   N+1 já sinalizado no próprio DTO). Premissa: uma linha no perfil basta para a rotina.
4. **Modelo de dispositivo** (`dispositivoModelo`, texto livre) é mostrado ao coach como está,
   sem normalização. Não se usa para decidir nada (a lista de modelos Amazfit é texto do guia).
5. **Prior do `ConfidenceScorer`** para as marcas novas é **3** para as duas (design D2): o
   limiar de 15 pontos é binário em prioridade ≤ 2, e entrar na faixa confiável sem gate dispensa
   a calibração. Promover uma marca a 2 depois do gate é uma edição de uma linha — com o
   teste da task 1.4 provando o efeito no tier.
6. **Há demanda real não-Garmin no pilot.** Não verificado: a distribuição de marcas no
   onboarding e na waitlist é a task 0.3. Se der zero atletas fora do Garmin nos primeiros
   clientes, **adiar a change** — ela seria pós-pilot disfarçado.

**Em aberto:**

- (DoR 2026-10-16) `AtletaOnboardingInputDto.dispositivoMarca` não tem `@NotNull`, embora este
  proposal a chame de obrigatória — decidir se o backend passa a validar (contrato novo) ou se a
  obrigatoriedade é só do front; CA4 já trata marca nula como caso normal.
- (DoR 2026-10-16, Codex) o `SyncStatusChip` continua com o rótulo visível "No relógio" para
  Polar, que nunca recebe treino; a task 4.2 troca só o tooltip. Decidir se "No intervals.icu"
  universal entra nesta change ou fica em C4/C6.
- (revisão de arquitetura 2026-10-15) alternativa à task 4.1: expor `dispositivoMarca`/`modelo` em
  `AtletaPerfilCoachDto` via o partial-failure de `CoachAthleteProfileServiceImpl`, em vez de um
  hook a mais na página do coach; e prior como propriedade de `DispositivoMarca` em vez de tabela
  em `FontePriority` (task 1.2). Decisão do founder antes do `/implement init`.

- Quem é o dono da revisão periódica de `verificadoEm` (task 5.2 cria o item no Kanban; falta o
  nome).
- Quem registra as intervenções manuais por atleta beta e a partir de qual data (task 0.3 cria a
  planilha; falta o responsável — founder por padrão).
