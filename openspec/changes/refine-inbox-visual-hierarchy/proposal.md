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
3. **Redundância dilui o foco:** o mesmo atleta em alerta aparece 4× acima da dobra (Fila de
   atenção, Roster do dashboard, Fila de revisão, painel de detalhe) em módulos concorrentes.
4. **O accent lime aparece em 16 elementos acima da dobra** (brand, nav, eyebrow, chips
   informativos, tabs, botões) — a cor de ação não significa ação.
5. **O design system declarado não está aplicado:** 100% da tela renderiza em Syne (hardcoded via
   `sx` em ~10 componentes do coach — `CoachInboxPage`, `PlanoDetalhePanel`, `AthleteRow` etc. —
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
- **Fusão dos módulos de atenção:** remover "Fila de atenção" e "Roster do dashboard" da coluna 1
  (a Fila de revisão já ordena por prioridade); cards em Alerta ganham tratamento visual (borda +
  fundo vermelho ~8%) e carregam **motivo + recência** no próprio card ("Inatividade · 14d").
  "Resumo rápido" vira linha horizontal compacta sob o cabeçalho.
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

### Fase 3 — Breakpoint mobile (camada 3)

- Sidebar colapsa em drawer (hambúrguer) abaixo de `md`; largura fixa de 240px deixa de existir em
  viewport < 900px.
- As 3 colunas viram fluxo de navegação empilhado: lista (fila de revisão) → detalhe do atleta, com
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
3. **Alerta legível no card** — Given um atleta com status Alerta na fila de revisão, When a fila
   renderiza, Then o card exibe motivo e recência (ex.: "Inatividade · 14d") com fonte ≥11px e o
   card tem tratamento visual distinto (borda/fundo na cor de alerta).
4. **Sem duplicação** — Given o inbox acima da dobra em 1440×900, When um atleta está em Alerta,
   Then ele aparece em no máximo 2 lugares (fila de revisão + painel de detalhe).
4b. **Sem perda de cobertura (gate do pre-mortem)** — Given um atleta com sinal ativo na
   `CoachAttentionQueue` e **sem** sugestão/plano pendente, When a Fila de atenção é removida,
   Then esse atleta continua visível na Fila de revisão com motivo e recência. A remoção dos
   módulos (task 1.5) é **bloqueada** até a prova de contrato de dados da task 1.1.
4c. **Guardas operacionais do CTA** — Given uma mutação em andamento (aprovação em voo), plano já
   processado ou falha de permissão, When o painel renderiza, Then o CTA exibe estado de
   loading/disabled/erro explícito — a regra "sem disabled" vale só para **aplicabilidade**
   (ação não aplicável → troca de ação), nunca para disponibilidade operacional.
5. **Accent racionado** — Given o inbox acima da dobra, When se contam os elementos na cor de
   accent, Then apenas ação primária e navegação ativa a utilizam (chips informativos, tabs e
   eyebrow em neutros).
6. **Tipografia mínima** — Given qualquer texto funcional do inbox (labels, valores, badges), When
   inspecionado, Then `font-size` computado ≥11px, e `grep -rn "fontFamily.*Syne" src/features/coach`
   retorna vazio (família vem do tema).
7. **Estados vazios com mensagem** — Given um atleta sem dados de treino na janela, When o
   diagnóstico renderiza, Then métricas zeradas são substituídas por uma mensagem de estado única
   (não uma grade de "0 km / 0% / —").
8. **Mobile navegável** — Given viewport 390×844, When o inbox carrega, Then não há scroll
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
  *Aberto (bloqueia o merge da Fase 1, por decisão do product review):* qual a ação default quando
  não há nem plano nem sinal (atleta saudável)? Proposta: "Abrir plano" (navegação), sem cor de
  accent — confirmar com o founder antes da task 1.3.
- **Premissa DERRUBADA pelo pre-mortem:** "Fila de atenção e Fila de revisão vêm da mesma fonte".
  Specs arquivadas indicam fontes distintas (`CoachAttentionQueue` = sinais; fila de revisão =
  sugestões/planos pendentes via `/api/v1/coach/sugestoes`). Um atleta com sinal e sem sugestão
  pendente poderia sumir do inbox. A task 1.1 vira **gate duro**: provar o contrato de dados (ou
  mesclar as fontes na fila) antes de qualquer remoção — ver critério 4b.
- **Premissa:** a identidade visual atual (accent lime #BDDE5A, fundo #0A1628, Syne como display) é
  a intencional e fica — a auditoria apontou divergência do DS declarado (Space Grotesk/Inter,
  petrol/amber/aqua), mas esta change **normaliza o uso**, não troca a marca. *Aberto:* confirmar
  com o founder se o DS declarado está obsoleto; se a intenção for migrar a paleta, é change
  separada.
- **Premissa:** remover "Fila de atenção"/"Roster" da coluna 1 não quebra nenhum fluxo — são
  visualizações redundantes da mesma fonte (`CoachAttentionQueue`). *Aberto:* verificar se algum
  deep-link ou teste E2E depende desses módulos.
- **Premissa:** breakpoint `md` (900px) do MUI é o corte adequado para o colapso da sidebar.
- **Premissa (product review):** o coach usa mobile à beira de pista — ainda não validada com dado
  de uso do pilot. Se o uso real for majoritariamente desktop, a Fase 3 pode ser destacada em
  change própria e repriorizada sem custo (costura já prevista).
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
- **Q10 (Fase 1 — modelo de ação incompleto):** `resolvePrimaryAction` cobre plano pendente +
  inatividade. Atleta com sugestão pendente (sem plano) ou prova próxima cai no default "Abrir
  plano". Incluir "sugestão pendente" (→ "Revisar sugestão") e "prova próxima" (→ "Ver prova") na
  precedência? Estende a task 1.2.

## Revisões (Full track)

- **Product review (`product-reviewer`): Refine.** Incorporado: task 1.1 promovida a gate duro;
  open question do CTA default marcada como bloqueante da Fase 1; métrica dos 5s rebaixada a
  critério de não-regressão (N=1, founder enviesado — sucesso real vem de teste com coaches
  externos, camada 4/futura); registrado que o valor para a assessoria é indireto (eficiência do
  treinador → retenção). Recomendação de fatiar a Fase 3 fica registrada como opção de
  sequenciamento — decisão do usuário foi manter as 3 camadas numa change.
- **Pre-mortem cross-model (Codex, adversarial): needs-attention.** 2 achados high incorporados
  (contrato de dados da fila — critério 4b; guardas operacionais do CTA — critério 4c) e 1 medium
  respondido (path do repo — nota acima).
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
