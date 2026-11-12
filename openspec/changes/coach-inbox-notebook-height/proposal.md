**Tamanho:** S · **Trilha:** Fast

# Proposal — coach-inbox-notebook-height

O inbox do treinador (`/#/coach/inbox`) passa a caber em notebook de 1366×768. A tela já não
transborda na largura; o problema era **altura**. Num navegador maximizado nessa tela sobram cerca de
625px úteis.

A maior parte do problema já foi resolvida por três changes de 2026-11-07 (ver "Linha de base"). Esta
change ficou com o que sobrou: fechar a cobertura de teste nos viewports reais de notebook, o pior caso
de 1093×500, o `Alert` de erro do dashboard e o gate com o treinador que reportou.

## Status

- draft (2026-11-05): aberta a partir de medição em viewport real, com os mocks do e2e do inbox.
- Revisão de produto (2026-11-05, `product-reviewer`): **Go com Refine leve**. Incorporados:
  - "Ajustar plano" continua visível no cabeçalho, porque editar a proposta da IA é a decisão que
    não pode ficar escondida atrás do "Aprovar";
  - remoção das ações simuladas como recomendação (Q2);
  - "Em atenção" mantido abaixo de 600px (Q3, verificado);
  - critério de aprovação da validação com o treinador;
  - task 0.1 bloqueante;
  - plano B fora do corpo da change;
  - e2e do caminho de decisão nos viewports de notebook.
  **Não acatado:** telemetria de abertura de menu e de cliques, porque o front não tem mecanismo de
  telemetria (mesma constatação da change `coach-ver-treino-realizado`).
- Pre-mortem (2026-11-05, Codex): **não executado**, porque o Codex caiu por limite de uso. Uma
  passada própria (Claude) foi incorporada a "Riscos e mitigações" do design.
- **Rebaseline (2026-11-12).** Revisão da spec contra `develop` mostrou que a descrição de 2026-11-05
  não batia mais com o código: as changes `inbox-barra-unica-sem-rodape`, `inbox-kpis-atleta-sem-dado`
  e `inbox-lista-triagem` (arquivadas em 2026-11-07) entregaram os itens 2 a 5 do What Changes
  original. Tasks entregues marcadas com a change de origem, Why e What Changes reescritos com o que
  falta, e Tamanho/Trilha de M · Full para **S · Fast**: sobra só front, sem contrato novo, com
  escopo de teste e ajuste pontual.

Bloqueador de uso no piloto, não melhoria opcional: notebook de 1366×768 é configuração comum entre
treinadores, e quem reportou não conseguia usar o inbox sem dar zoom out.

## Linha de base

Medição original (2026-11-05), atleta selecionado:

| Faixa | 1366×625 | 1093×500 |
|---|---|---|
| Cabeçalho da página | 57 | 57 |
| KPIs globais | 85 | 85 |
| Cabeçalho do atleta (nome, próxima prova, CTA) | 85 | 64 |
| KPIs do atleta | 91 | 91 |
| Abas | 40 | 40 |
| **Conteúdo rolável do detalhe** | **221 (35%)** | **120 (24%)** |
| Barra de ações | 46 | 46 |

- **1366×625**: Chrome maximizado no Windows numa tela de 1366×768 (barra de tarefas, abas e barra de
  endereço descontadas).
- **1093×500**: a mesma tela com escala de 125% no sistema ou zoom de 125% no navegador.

Estado em `develop` (2026-11-12), depois das changes de 2026-11-07:

- **Barra única** (`inbox-barra-unica-sem-rodape`): título, resumo em linha e atalhos numa barra só,
  `data-testid="inbox-barra"`, ≤ 56px (medido: 53px). O resumo é montado por
  `buildInboxSummaryLine` (`adapters/inboxSummaryKpis.ts`) e renderizado como um `Typography` por
  segmento (`inbox-resumo-ativos`, `-atencao`, `-treinos`, `-atualizado`), não pelo `KpiStrip`. A
  faixa de quatro KPIs globais (85px) e a barra de ações do rodapé (46px) saíram. "Ajustar plano"
  está no cabeçalho do atleta, as ações simuladas saíram (Q2 decidida pelo dono do produto em
  2026-11-07) e o menu "Mais ações" não existe mais.
- **KPIs do atleta em uma linha** (`inbox-kpis-atleta-sem-dado`): `AthleteKpiStrip` usa sempre
  `KpiStrip` com `dense`, em todas as alturas; faixa ≤ 40px. A legenda fica no `title` nativo do
  `KpiCell` e num texto visualmente oculto para o leitor de tela.
- **Lista de triagem** (`inbox-lista-triagem`): linha de ≤ 52px em todas as alturas, paginação só com
  mais de uma página e em PT-BR, busca no cabeçalho da coluna da lista.

Cobertura e2e em `tests/e2e/coach/inbox.spec.ts`:

| Viewport | O que é cobrado hoje |
|---|---|
| 1366×625 | barra ≤ 56px; detalhe ≥ 62% da altura (medido 57% antes da faixa de KPIs); ≥ 6 linhas inteiras de ≤ 52px na lista |
| 1093×500 | Aprovar, Rejeitar e Ajustar plano inteiros na tela; detalhe **≥ 40%**; sem rolagem horizontal |
| 1280×600 | nada |
| 1366×768, 1280×720, 1024×640 | laço antigo: lado a lado, CTA visível, sidebar recolhida abaixo de 1200px, sem rolagem horizontal |

O valor real da fração do detalhe em 1093×500 não está registrado: o teste de 1093×500 entrou com a
barra única, antes de a faixa de KPIs do atleta perder ~37px líquidos. A estimativa é ≥ 47%, a
confirmar na task 0.2.

## Why

O que ainda falta para fechar o problema reportado:

1. **1093×500 só é cobrado a 40%.** A meta da change é 45% (gate) e 50% (alvo). Sem subir o limiar,
   uma regressão de até ~25px passa despercebida no pior caso.
2. **1280×600 não tem teste nenhum.** O laço antigo de notebook usa alturas (768, 720, 640) que
   nenhum navegador maximizado entrega nessas telas.
3. **Ninguém decide pelo inbox em viewport de notebook.** O teste de 1093×500 só confere que os botões
   estão visíveis; o teste que aprova uma sugestão roda no viewport padrão. Clicar e confirmar em
   notebook não é exercitado.
4. **O `Alert` de erro do dashboard** fica entre a barra e a grade com padding padrão do MUI. Quando
   aparece, come a altura conquistada.
5. **O treinador que reportou não validou** no próprio notebook.

## What Changes

Tudo no `menthoros-front`. Sem contrato de API, sem backend.

1. **E2E com viewport real, complementando o que existe.** Novo laço em 1366×625, 1280×600 e
   1093×500: lado a lado, CTA visível, sem rolagem horizontal e a fração do detalhe (≥ 0,55 em
   1366×625 e 1280×600; ≥ 0,45 em 1093×500). O limiar do teste de 1093×500 existente sobe de 0,40
   para 0,45. O laço antigo (1366×768, 1280×720, 1024×640) fica: ele cobre o comportamento por
   largura (sidebar recolhida abaixo de 1200px), que continua valendo.
2. **Decisão em notebook.** E2E que aprova pelo CTA e rejeita com motivo em 1366×625 e 1093×500.
3. **`Alert` de erro compacto** em `TELA_BAIXA`: uma linha, padding reduzido.
4. **`TELA_MUITO_BAIXA` condicional.** Só entra se a medição da task 0.2 mostrar que a barra quebra em
   duas linhas em 1093×500 ou que o detalhe fica abaixo de 45%. Nesse caso, os segmentos
   `inbox-resumo-ativos` e `inbox-resumo-treinos` levam `display: none` abaixo de 600px de altura, e
   "em atenção" fica (Q3). Se a barra já é uma linha e o gate passa, esconder segmentos não devolve
   altura e a faixa não é criada.

## Fora de escopo

- Layout em largura: a grade lista/detalhe e a sidebar já se ajustam (change anterior).
- Largura abaixo de `md` (celular): é `refine-inbox-mobile-breakpoint`.
- Outras telas do coach (Atletas, Calendário, Revisão de planos). Se tiverem o mesmo problema de
  altura, entram numa change própria. O `tests/e2e/coach/notebook-viewport.spec.ts` (1024×640) cobre
  essas telas, não o inbox, e não é alterado aqui.
- Implementar de verdade as ações que saíram ("Enviar mensagem" e "Marcar como prioridade"). É
  follow-up (Q2).
- Plano B (cabeçalho do atleta rolando com o conteúdo, design D7). Se a meta de CA2 não for atingida,
  ele vira change própria.
- Reduzir fonte abaixo de 11px. O e2e existente continua valendo.
- Telas de altura abaixo de 480px.

## Critérios de aceite

- **CA1** — Given viewport 1366×625 e um atleta selecionado, When o inbox carrega, Then a área
  rolável do detalhe ocupa pelo menos 55% da altura da janela. *Já coberto e mais apertado:
  `inbox.spec.ts` cobra ≥ 62% desde `inbox-kpis-atleta-sem-dado`.*
- **CA2** — Given viewport 1093×500 e um atleta selecionado, When o inbox carrega, Then a área
  rolável do detalhe ocupa pelo menos 45% da altura da janela (gate). A meta é 50%; abaixo disso,
  abre-se o follow-up do plano B. Hoje o teste cobra 40% (`inbox.spec.ts`, teste de 1093×500); a
  change sobe o limiar para 0,45 e registra a medição real na task 0.2.
- **CA3** — *Coberto por `inbox-lista-triagem`*: o e2e cobra ≥ 6 linhas inteiras de ≤ 52px em
  1366×625, acima da meta original de 5 cards.
- **CA4** — Given os viewports 1366×625, 1280×600 e 1093×500, When um atleta é selecionado, Then o
  CTA primário fica visível sem rolar, lista e detalhe ficam lado a lado, e a página não rola na
  horizontal.
- **CA5** — *Coberto por `inbox-barra-unica-sem-rodape`*: sem barra de ações no rodapé, "Ajustar
  plano" no cabeçalho abre a aba Plano, sem ações simuladas.
- **CA6** — *Coberto por `inbox-lista-triagem`*: paginação só com mais de uma página e em PT-BR.
- **CA7** — Given viewport 1440×900, When o inbox carrega, Then os e2e que já existem continuam
  passando, inclusive "nenhum texto visível abaixo de 11px" e "não rola na horizontal".
- **CA8** — **Decisão pendente.** O que foi entregue: com `dense`, a legenda do KPI do atleta fica no
  `title` nativo (abre no hover, não no foco) e num texto visualmente oculto lido pelo leitor de tela.
  Não há `Tooltip` nem `tabIndex`. Falta decidir se a legenda precisa abrir também no foco por
  teclado. Se sim, entra a task 4.1b (`Tooltip` + `tabIndex={0}` no `KpiCell` denso) com teste de
  componente. Se não, este critério sai e o requisito correspondente da spec é removido. Decidir na
  task 0.1d.
- **CA9** — Given os viewports 1366×625 e 1093×500 e um plano aguardando revisão, When o treinador
  aprova pelo CTA, Then a decisão é enviada e a lista atualiza. When rejeita com motivo, Then a
  rejeição é enviada. Os dois botões ficam clicáveis sem rolar.
- **CA10** — Given viewport 1366×625 e falha no carregamento do dashboard, When o `Alert` de erro
  aparece, Then ele ocupa uma linha e o detalhe continua com pelo menos 55% da altura.

## Métrica de sucesso

- **Principal**: fração da altura dada ao conteúdo do detalhe em 1093×500, o pior caso. Linha de base
  original 24%; cobrança atual 40%; gate 45%, meta 50%. Medida pelo e2e, então fica protegida contra
  regressão.
- **Já atingida**: 1366×625 (35% → ≥ 62%) e atletas visíveis na lista (2,5 → ≥ 6).
- **Validação com o treinador** (gate de arquivamento): quem reportou o problema, no próprio notebook
  e sem zoom out, revisa um atleta (lê o diagnóstico e decide o plano) com no máximo 3 rolagens no
  detalhe.
- **O que a change não afirma**: ganho de minutos por revisão. Não há instrumentação de tempo por
  revisão no front, e a validação é com um treinador só.

## Dependências

- Nenhuma de backend.
- Entregues antes desta change, e base dela: `inbox-barra-unica-sem-rodape`,
  `inbox-kpis-atleta-sem-dado`, `inbox-lista-triagem` (arquivadas em `changes/archive/2026-11/`).
- **`refine-inbox-mobile-breakpoint`** (ativa). Não há conflito de comportamento: aquela trata largura
  abaixo de `md`, esta trata altura. Mas as duas mexem em `CoachInboxPage.tsx` e no
  `tests/e2e/coach/inbox.spec.ts`. Ordem: esta change entra primeiro (é menor e é bloqueador do
  piloto); a outra rebaseia sobre ela. Aquela change ainda cita a "barra de ações do detalhe" e o
  menu de ações secundárias, que já saíram — atualizá-la fica fora do escopo desta.
- Mexe em `CoachInboxPage.tsx` (1048 linhas), `components/KpiCell.tsx` (só se CA8 pedir foco),
  `theme/mediaQueries.ts` (só se `TELA_MUITO_BAIXA` for necessária) e
  `tests/e2e/coach/inbox.spec.ts`. `adapters/inboxSummaryKpis.ts` define as chaves dos segmentos do
  resumo e não muda.

## Open Questions & Assumptions

- **Q1 — Sintoma.** Assumido: "problemas para abrir" quer dizer que a tela fica apertada e não dá
  para usar, e não erro nem tela em branco. **Bloqueante**: confirmar com quem reportou antes de
  implementar (task 0.1). Se for erro, a causa é outra e esta change não resolve.
- **Q2 — Ações simuladas.** **Resolvida (2026-11-07):** o dono do produto decidiu tirá-las da tela, e
  `inbox-barra-unica-sem-rodape` as removeu.
- **Q3 — KPIs globais abaixo de 600px.** Verificado: só "em atenção" é triagem. Se
  `TELA_MUITO_BAIXA` for criada, é o único segmento do resumo que fica (o horário de atualização
  também pode ficar, por ser curto — decidir junto, na task 2.1).
- **Q4 — Legenda no foco por teclado (CA8).** Pendente; ver CA8.
- **A1 — Ambiente de referência.** Assumido: Windows com escala de 100%, Chrome maximizado, sem barra
  de favoritos. Com barra de favoritos sobram ~30px a menos, e as metas devem continuar valendo por
  margem. Registrar o ambiente real do treinador na task 0.1.
- **A2 — Dados reais.** A medição usou mocks. A aba "Plano" com uma semana cheia pode ser mais alta;
  isso não muda a área disponível, só quanto rola dentro dela. Verificação manual com dados reais na
  task 6.3.
- **A3 — Plano B.** Se o detalhe em 1093×500 ficar abaixo da meta de CA2 (50%), o plano B do design
  (D7) vira change própria. Ele não é implementado nesta change.
