**Tamanho:** L · **Trilha:** Full

## Why

Auditoria heurística de hierarquia visual do Coach Inbox (2026-08-11, medições diretas no DOM em
1440×900 e 390px) mostrou que a tela trabalha **contra** o job dos primeiros 5 segundos — "quais
atletas precisam de atenção hoje" — e contra a tese do produto ("a IA propõe, o treinador decide"):

1. **O CTA primário é o elemento mais fraco da tela.** "Aprovar plano" tem 11,5px de texto, 28px de
   altura, fica a y=863 (tangenciando a dobra) e renderiza `disabled` em cinza no estado comum. No
   score agregado da auditoria (tamanho + contraste + saturação + whitespace + posição), fez 12
   pontos — último lugar entre 15 elementos. Quando não há plano pendente, a tela não exibe
   **nenhuma** ação primária, embora o diagnóstico já diga o que fazer ("Contatar o atleta").
2. **O sinal de urgência é o menor texto da tela.** O badge "Alerta" (vermelho) mede 9,9px com fundo
   a 10% de alpha; o maior texto (23,2px) é o título estático da página. Chrome ganha de conteúdo.
3. **Redundância dilui o foco:** o mesmo atleta em alerta aparece 3× acima da dobra — "Fila de
   atenção" (preview de 3, `CoachInboxPage.tsx:375`), "Roster do dashboard" (preview de 3, mesma
   tela) e a lista principal de atletas (`QueueRow`) — em módulos concorrentes na mesma coluna.
4. **O accent lime aparece em 16 elementos acima da dobra** (brand, nav, eyebrow, chips
   informativos, tabs, botões) — a cor de ação não significa ação.
5. **O design system declarado não está aplicado:** 100% da tela renderiza em Syne (hardcoded via
   `sx` — **10 ocorrências em 7 arquivos** do coach: `CoachInboxPage` (×2), `PlanoDetalhePanel` (×3),
   `CoachPlanReviewPage`, `CoachAttentionQueuePage`, `CoachInsightsPage`, `CoachAthletesPage`,
   `PlanoPendenteItem` —
   apesar de `src/index.css` declarar Inter), com labels funcionais de 7,2–10px; a escala
   tipográfica real está comprimida (maioria entre 10–13px).
6. **Mobile (390px) é inutilizável:** a sidebar mantém 240px fixos (64% do viewport), o conteúdo
   espreme em ~135px, o título trunca e as colunas viram faixas com scroll interno. Nota da
   auditoria: desktop 5,5/10, mobile 1/10.

O coach usa o inbox como tela de triagem diária; à beira de pista, usa o celular. Cada segundo a
mais para achar o atleta em risco e cada clique a mais para agir é custo direto na rotina do
treinador (estrela-guia do produto).

## What Changes

Somente `apps/menthoros-front`. Três fases sequenciais na mesma change (costura natural: a Fase 3
pode ser destacada em change própria se o PR crescer demais):

### Fase 1 — Hierarquia de ação e foco (auditoria, camada 1)

- **CTA contextual único e sólido** no painel do atleta: uma ação primária preenchida (accent
  sólido, ≥40px de altura, texto ≥14px), que muda com o estado — "Aprovar plano" quando há plano
  pendente; "Contatar atleta" quando o diagnóstico dominante é inatividade; nunca renderizada
  `disabled` como estado default (sem ação aplicável → a ação contextual troca, não apaga).
- **Fusão dos módulos de atenção:** remover os previews "Fila de atenção" e "Roster do dashboard"
  da coluna 1; a informação migra para a **lista principal de atletas** (`QueueRow`), cujos cards em
  Alerta ganham tratamento visual (borda + fundo vermelho ~8%) e carregam **motivo + recência**
  ("Inatividade · 14d"). "Resumo rápido" vira linha horizontal compacta sob o cabeçalho.
  **Condicionado ao gate 1.1** — ver "Correção de premissa" abaixo: a lista principal é paginada e a
  fila de atenção não é.
- **Ração do accent:** lime restrito a ação primária + item de navegação ativo. Chips informativos
  ("No prazo", "Prioridade alta"), tabs e eyebrow migram para neutros.
- **Inversão chrome/conteúdo:** título da página reduz (~16px); o nome do atleta selecionado passa
  a ser o maior texto da tela.
- **Par decisório co-localizado (aprovar/rejeitar):** "Rejeitar plano" sai do menu "Mais ações" e
  renderiza como ação secundária (outline neutro) ao lado do CTA primário — aprovar e rejeitar são
  as duas faces da mesma decisão, e esconder o rejeitar enterra a ação que exige o motivo escrito.
- **"Contato assistido" (fecha o stub):** o CTA "Contatar atleta" não dispara o toast vazio atual
  (`setFeedback('Mensagem preparada…')`); gera um rascunho pré-composto (motivo + recência + ação
  sugerida — os mesmos campos do card) e copia para a área de transferência. Sem mensageria completa
  — o coach ainda dispara manualmente.
- **Cor do CTA segue o padrão Premium:** a ação primária — "Aprovar plano" ou "Contatar atleta" — é
  sempre lime (`PRIMARY_BTN_SX`/`primary[500]`). Verde (`SUCCESS_BTN_SX`) é para "confirmação de
  estado" (ex.: "marcar oficial"), não para o CTA principal. Ver Q7.

### Fase 2 — Design system e estados (camada 2)

- **Tipografia pelo tema, não por `sx`:** remover `fontFamily: 'Syne'` hardcoded dos componentes do
  coach; Syne (ou a display do DS) só em display/headings via `theme.typography`; Inter em body,
  labels e dados. Escala com saltos reais (ex.: 11/13/16/20/28); **nenhum texto funcional abaixo de
  11px**.
- **Semântica de cor exclusiva:** vermelho = requer ação agora, âmbar = observar, verde = ok, e
  essas cores não são usadas para nada além de estado de atleta/treino.
- **Estados desenhados:** dados zerados viram mensagem ("Sem treinos registrados há 14 dias") em vez
  de "0 km / 0%" repetido; estados de lista vazia, carregamento e erro definidos para as três
  colunas.

### Fase 3 — Breakpoint mobile → DESTACADA (2026-08-16)

**Movida para a change `refine-inbox-mobile-breakpoint`.** O founder decidiu que o coach não usará o
inbox à beira de pista por enquanto, e essa premissa era a única razão para priorizar mobile junto
das Fases 1 e 2. O diagnóstico segue válido (mobile 1/10 na auditoria); muda o momento.

Risco aceito: até aquela change rodar, o inbox continua inutilizável em 390px e a faixa 900–1200px
segue subprojetada. Nada disso é regressão desta change — é dívida que permanece onde estava.

Escopo original, agora fora daqui:

- Sidebar colapsa em drawer (hambúrguer) abaixo de `md`; largura fixa de 240px deixa de existir em
  viewport < 900px.
- As 3 colunas viram fluxo de navegação empilhado: lista principal do inbox → detalhe do atleta, com
  volta explícita; sem scroll horizontal interno em 390px.
- CTA contextual visível sem scroll no detalhe em 390×844.

## Non-Goals

- Não muda nenhum contrato de API nem o backend — só apresentação e navegação.
- Não redesenha os dados/algoritmos de prioridade da fila (ordem vem do backend como hoje).
- Não implementa mensageria completa nem envio in-app — "Contatar atleta" vira "Contato assistido"
  (rascunho pré-composto + cópia para a área de transferência), sem backend de mensagem novo.
- Não migra a landing page nem telas do atleta — escopo é o funil do coach (inbox em primeiro
  lugar; outras telas do coach só herdam o que vier de graça via tema).
- Não inclui teste com treinadores externos (camada 4 da auditoria — mérito de change futura).

## Critérios de aceite

1. **CTA contextual** — Given o painel de um atleta com plano pendente de revisão, When o inbox
   renderiza em 1440×900, Then existe exatamente um botão primário sólido "Aprovar plano" com
   altura ≥40px e fonte ≥14px, visível sem scroll.
2. **CTA sem estado morto** — Given um atleta sem plano pendente e com sinal de inatividade, When o
   painel renderiza, Then a ação primária exibida é "Contatar atleta" (não um "Aprovar plano"
   desabilitado).
3. **Alerta legível no card** — Given um atleta com status Alerta na lista principal do inbox, When
   a lista renderiza, Then o card exibe motivo e recência (ex.: "Inatividade · 14d") com fonte ≥11px e o
   card tem tratamento visual distinto (borda/fundo na cor de alerta).
4. **Sem duplicação** — Given o inbox acima da dobra em 1440×900, When um atleta está em Alerta,
   Then ele aparece em no máximo 2 lugares (lista principal do inbox + painel de detalhe).
4b. **Sem perda de cobertura (gate — reescrito em 2026-08-16 contra o código real)** — Given um
   atleta presente em `dashboard.attentionQueue` que **não está na página corrente do roster**
   (por paginação, filtro de status ou ordenação), When os previews "Fila de atenção" e "Roster do
   dashboard" são removidos, Then esse atleta **continua alcançável no inbox** com motivo e
   recência. A remoção (task 1.5) é **bloqueada** até a task 1.1 fechar com um mecanismo explícito
   (fixar os itens de atenção no topo da lista, filtro "só atenção", ou fundir `attentionQueue` na
   composição da lista antes de paginar).
4c. **Guardas operacionais do CTA** — Given uma mutação em andamento (aprovação em voo), plano já
   processado ou falha de permissão, When o painel renderiza, Then o CTA exibe estado de
   loading/disabled/erro explícito — a regra "sem disabled" vale só para **aplicabilidade**
   (ação não aplicável → troca de ação), nunca para disponibilidade operacional.
5. **Accent racionado (verificação MANUAL, por natureza)** — Given o inbox acima da dobra, When se
   contam **por inspeção visual** os elementos na cor de accent, Then apenas ação primária e
   navegação ativa a utilizam (chips informativos, tabs e eyebrow em neutros).
   Não há seletor programático confiável: `primary[500]` aparece em usos legítimos (gráfico, marca)
   e ilegítimos (eyebrow, tabs) no mesmo arquivo. A parte **automatizável** deste critério é a task
   2.9 (papel de botão via `_BTN_SX`), que cobre botões — não chips/eyebrow/tabs.
6. **Tipografia mínima** — Given qualquer texto funcional do inbox (labels, valores, badges), When
   inspecionado, Then `font-size` computado ≥11px, e `grep -rn "fontFamily.*Syne" src/features/coach`
   retorna vazio (família vem do tema).
7. **Estados vazios com mensagem** — Given um atleta sem dados de treino na janela, When o
   diagnóstico renderiza, Then métricas zeradas são substituídas por uma mensagem de estado única
   (não uma grade de "0 km / 0% / —").
8. **Mobile navegável** — ⏸ **MOVIDO** para `refine-inbox-mobile-breakpoint` (critério 1–3 de lá).
   Enunciado original: Given viewport 390×844, When o inbox carrega, Then não há scroll
   horizontal no documento nem em painéis internos, a sidebar está colapsada em drawer e a lista de
   atletas ocupa a largura útil; When um atleta é selecionado, Then o detalhe abre em tela própria
   com CTA visível sem scroll e navegação de volta.
9. **Regressão** — `npm run lint && npm run build` e a suíte de testes passam; fluxos E2E existentes
   do coach seguem verdes.

## Métrica de sucesso

- **Teste dos 5 segundos com o founder-coach:** olhando o inbox por 5s, identificar corretamente
  qual atleta precisa de atenção **e por quê** — meta: 100% de acerto (hoje o motivo não está
  visível no card).
- **Proxy mecânico:** o CTA contextual visível sem scroll em 1440×900 **e** 390×844 (hoje: borda da
  dobra no desktop, inexistente no mobile).

## Open Questions & Assumptions

- **Premissa:** o CTA primário do produto é "Aprovar plano" (tese coach-in-the-loop); na ausência de
  plano pendente, a melhor ação default é "Contatar atleta" quando há sinal de inatividade.
  *Aberto (bloqueia as tasks 1.2/1.3/1.3a/1.3b — **não** a Fase 1 inteira; reclassificado em
  2026-08-16):* qual a ação default quando não há nem plano nem sinal (atleta saudável)? Proposta:
  "Abrir plano" (navegação), sem cor de accent — confirmar com o founder antes da task 1.2.
  As tasks 1.1, 1.4, 1.6 e 1.7 não dependem desta decisão e podem correr em paralelo à espera.
- **CORREÇÃO DE PREMISSA (2026-08-16, verificada no código — invalida a "premissa derrubada" do
  pre-mortem anterior).** O pre-mortem afirmou que a fila de atenção e a "fila de revisão" vinham de
  fontes distintas, a segunda via `/api/v1/coach/sugestoes`. **As duas afirmações estão erradas**, e
  a spec foi escrita sobre elas:

  1. **Não existe "Fila de revisão" dentro do inbox.** Ela é uma tela separada
     (`/coach/planos/revisao`, para onde `CoachInboxPage.tsx:648` navega). O que a spec vinha
     chamando de "Fila de revisão" é a **lista principal de atletas**, renderizada com `QueueRow`
     (`CoachInboxPage.tsx:449`) a partir de `rosterItems = dashboard.roster.items`.
  2. **Fila de atenção e roster vêm da MESMA requisição.** `GET /api/v1/coach/dashboard` devolve
     `{ roster: CoachDashboardRosterPage, attentionQueue: CoachAttentionItem[] }`
     (`src/types/Coach.ts:72-73`), consumidos por `useCoachDashboard`. A premissa original ("mesma
     fonte") estava certa; foi "derrubada" por engano.

  **O risco real é outro, e é maior:** o roster é **paginado em 10** (`ROSTER_PAGE_SIZE`,
  `useDashboardFilters.ts:9`) e responde a filtro de status e ordenação; `attentionQueue` não é
  paginada. Os previews que a change remove mostram `.slice(0, 3)` de cada lista. Logo, **um atleta
  em alerta que caia na página 2+ do roster — ou fora do filtro ativo — desaparece do inbox**, que é
  exatamente a função que a Fila de atenção cumpre hoje. O gate 1.1 foi reescrito para responder a
  essa pergunta, não à do contrato de endpoints.
- **Premissa:** a identidade visual atual (accent lime #BDDE5A, fundo #0A1628, Syne como display) é
  a intencional e fica — a auditoria apontou divergência do DS declarado (Space Grotesk/Inter,
  petrol/amber/aqua), mas esta change **normaliza o uso**, não troca a marca. *Aberto:* confirmar
  com o founder se o DS declarado está obsoleto; se a intenção for migrar a paleta, é change
  separada.
- **Premissa:** remover os previews "Fila de atenção"/"Roster" da coluna 1 não quebra nenhum fluxo —
  são recortes (`.slice(0, 3)`) da mesma resposta que alimenta a lista principal. *Aberto:* verificar
  se algum deep-link ou teste E2E depende de `DashboardAttentionQueueRow` /
  `DashboardRosterPreviewRow` (mapeamento na task 1.1b).
- **Premissa:** breakpoint `md` (900px) do MUI é o corte adequado para o colapso da sidebar.
- **Premissa DERRUBADA por decisão (2026-08-16):** "o coach usa mobile à beira de pista". O founder
  decidiu que isso não acontece por enquanto. A Fase 3 foi destacada em
  `refine-inbox-mobile-breakpoint` — a costura estava prevista desde o product review, então foi
  sequenciamento, não recorte de emergência. O gatilho para repriorizar é uso real de mobile no
  piloto, não opinião.
- **Nota:** esta change vive em `menthoros-product` (specs) e implementa em `apps/menthoros-front`
  — padrão do workspace (repos irmãos). As validações das tasks rodam na raiz do repo frontend.
- **Q7 — RESOLVIDA (cor do CTA, padrão Premium):** ação primária = sempre lime (`PRIMARY_BTN_SX`/
  `primary[500]`), seja "Aprovar plano" ou "Contatar atleta" — Lime Discipline do
  `refactor-color-system-premium-v2` (lime = marca + primary-action). Verde (`SUCCESS_BTN_SX`) é só
  para "confirmação de estado" (ex.: "marcar oficial") e chips de estado, não para o CTA principal.
  Aplicado na task 1.3a e na Decisão 3.
- **Q8 — RESOLVIDA ("Contato assistido"):** o `Atleta` não tem `telefone` nem `email` exposto no DTO
  coach (só `Assessoria` e `Waitlist` têm telefone). Logo, sem deep-link externo viável. Mecanismo:
  cópia do rascunho pré-composto para a área de transferência (sempre disponível). `wa.me/`/`mailto:`
  ficam como follow-up quando o campo de contato for exposto (gancho de `add-athlete-coach-messaging`).
  Aplicado na task 1.3b.
- **Q9 (Fase 2 — escopo da tipografia):** consolidar `theme.typography` globalmente afeta as telas
  do atleta (tema compartilhado), contrariando o Non-Goal "não migra telas do atleta". Decidir:
  override de tema escopado ao coach, ou aceitar/documentar o impacto no atleta (task 2.1).
- **Q10 — FECHADA (2026-08-16) como fora de escopo, com risco declarado.** `resolvePrimaryAction`
  cobre plano pendente + inatividade; "sugestão pendente" e "prova próxima" **não entram** nesta
  change. Deixá-la "aberta, se o founder aprovar" era pior dos dois mundos: mantinha uma decisão de
  produto pendurada numa task de implementação. **Risco aceito e testado como tal:** atleta com
  sugestão pendente e sem plano cai em "Abrir plano" neutro — a spec exige um teste que fixe esse
  fallback explicitamente, para que a lacuna fique visível em vez de virar comportamento acidental.
  Estender a precedência é change própria (gancho natural: `add-coach-inbox-attention-sections`).

## Revisões (Full track)

- **Product review (`product-reviewer`): Refine.** Incorporado: task 1.1 promovida a gate duro;
  open question do CTA default marcada como bloqueante da Fase 1; métrica dos 5s rebaixada a
  critério de não-regressão (N=1, founder enviesado — sucesso real vem de teste com coaches
  externos, camada 4/futura); registrado que o valor para a assessoria é indireto (eficiência do
  treinador → retenção). Recomendação de fatiar a Fase 3 fica registrada como opção de
  sequenciamento — decisão do usuário foi manter as 3 camadas numa change.
- **Pre-mortem cross-model (Codex, adversarial): needs-attention.** 2 achados high incorporados
  (contrato de dados da fila — critério 4b; guardas operacionais do CTA — critério 4c) e 1 medium
  respondido (path do repo — nota acima). **Um dos achados estava errado** — ver "Correção de
  premissa" acima; a spec foi reescrita sobre ele e precisou ser corrigida na segunda rodada.
- **DoR gate, 2ª rodada (2026-08-16 — `spec-reviewer` + pre-mortem Codex, independentes):** ambos
  convergiram, por caminhos diferentes, no mesmo achado bloqueante: **a spec descrevia uma tela que
  não existe** ("Fila de revisão" dentro do inbox). Incorporado nesta revisão:
  (1) mapa real da tela no `design.md`, com arquivo:linha de cada módulo;
  (2) Decisão 2 reescrita — o risco é **paginação/filtro**, não contrato de endpoints; gate 1.1 passa
      a exigir `buildInboxQueue` com teste, não "nota documentada";
  (3) tasks 1.1b (mapa nominal dos testes afetados) e 1.1c (E2E do inbox **antes** da remoção) —
      os testes atuais ficam **verdes** com o inbox regredido, e os E2E de coach mockam
      `**/api/v1/coach/**` como `[]`;
  (4) CTA: `resolvePrimaryAction` (aplicabilidade) separada de `resolveActionAvailability`
      (disponibilidade); o inbox não consome o `isActing` do layout e não trava duplo clique;
  (5) task 1.3 corrigida — o CTA vive em `CoachInboxPage.tsx:662`, não em `PlanoDetalhePanel`;
  (6) Q9 fechada: `ThemeProvider` aninhado no `CoachLayout`, proibido tocar `App.tsx`;
  (7) fallback obrigatório de clipboard no "Contato assistido";
  (8) task 3.5 — teste mecânico de hierarquia, cobrindo o que a inspeção manual não garante;
  (9) escopo bloqueante de Q10/ação-default reduzido a 1.2/1.3/1.3a/1.3b.
- **DoR gate, 3ª rodada (2026-08-16 — mesma dupla, sobre a spec já corrigida): NEEDS-WORK nos dois,
  sem nenhum achado de arquitetura.** Os dois convergiram em buracos de **contrato**, não de decisão:
  (1) a assinatura de `buildInboxQueue` não comportava a sinalização "N fora do filtro" que ela mesma
      exigia — fechada como `{ rows, pinnedCount, hiddenAttentionCount }`;
  (2) `InboxQueueRow` virou união `roster | attention-only`: `CoachAttentionItem` não tem as métricas
      da linha de roster, e unificar os tipos produziria linha com dados falsos;
  (3) fixar itens de atenção colidia com `TablePagination count={rosterTotal}` — resolvido: fixados
      são seção fixa, fora da paginação, e o `count` não muda;
  (4) o critério 4c (409/422 vs 403) exigia um status HTTP que a cadeia atual descarta em
      `Promise<boolean>` — o replumbing virou escopo explícito da task 1.3;
  (5) "recência" não estava definida (`lastActivity` vs `generatedAt`) — definida por motivo;
  (6) matriz do E2E 1.1c ampliada de 1 para 5 cenários; viewport 1024 somado ao teste 3.5;
  (7) Q9 continuava como "ou" na task 2.1, embora decidida no design — alinhada;
  (8) citação `CoachInboxPage.tsx:387` estava trocada (é `:375` a Fila de atenção) — corrigida.
- **UI/UX review (especialista, 2026-08-15):** diagnóstico da auditoria confirmado contra o código
  real — fonte mínima efetiva é **4,8px** (`CoachInboxPage.tsx:541`, `0.30rem`), pior que os 7,2px
  reportados. Achados incorporados: (1) "Contatar atleta" apontava para stub de mensagem →
  "Contato assistido"; (2) par aprovar/rejeitar co-localizado; (3) cor do CTA vira decisão (Q7);
  (4) escopo da tipografia global vs. atleta (Q9); (5) modelo de ação estendido (Q10);
  (6) diferenciação não-cor para daltônicos (task 2.4). Recomendação de destacar a Fase 3
  reforçada: premissa "coach usa mobile" segue não validada com dado do pilot.
- **UI/UX audit completo (persona "Menthoros UI/UX Design Reviewer", 2026-08-15):** UX Score 3,7/10.
  Novos achados: (UX-002/003) insight da IA enterrado e sem estrutura → elevado ao topo (task 1.7) +
  `AIInsightCard` de 4 seções (task 2.7); (UX-005) faixas "ideal" hardcoded → derivar/remover
  (task 2.8); (UX-012) Attention Management System (agrupar fila por estado) → costura candidata a
  change própria, fora do escopo desta (ver tasks, seção própria). Quick wins (UX-004, UX-007) e
  opportunities de design system ficam registradas no audit, não entram nesta change.
  Verificação de papel de botão (pós-audit): "Aprovar plano" era o único botão de ação com cor de
  estado (`semantic.success`) — já coberto pela task 1.3a; `ConfirmDialog` reimplementa
  PRIMARY/DANGER inline → task 2.9 (guard-rail de papel de botão).
