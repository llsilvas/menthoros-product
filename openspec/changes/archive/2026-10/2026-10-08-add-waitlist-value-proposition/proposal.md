**Tamanho:** S · **Trilha:** Fast

## Why

`/waitlist` é o destino do link da bio do Instagram, mas hoje mostra só um título ("Turma fundadora
— 10 vagas"), 4 campos e um botão. Quem chega direto do Instagram não viu a home e não sabe o que é
o Menthoros, quanto custa nem que hoje só lê dados do Garmin — a home tem essa informação, `/waitlist`
não. O lead chega sem contexto e decide às cegas se preenche o formulário.

Origem: análise do Instagram, da landing e de `/waitlist` em 2026-10-07
(`menthoros-product/artifacts/instagram-conversao-specs-frontend.md`, spec FE-01).

## What Changes

Somente `apps/menthoros-front`, em `src/pages/waitlist/WaitlistPage.tsx`. Sem mudança de contrato
(nenhum campo novo de formulário — isso é `FE-02`, fora de escopo).

- Bloco de proposta de valor **acima do formulário existente**, reaproveitando os textos já
  publicados na home via `src/landing/content.ts` (não duplicar valores fixos em `WaitlistPage.tsx`):
  - Título: "IA para assessorias de corrida".
  - Slogan: "A IA propõe. O treinador decide." (já existe em `hero.titleLine1/titleAccent`).
  - Frase de abertura sobre o que o produto faz (fila de atenção, sugestão com motivo, aval do
    treinador).
  - Três bullets de valor, adaptados de `capabilities.bullets` (fila de atenção / motivo de cada
    sugestão / nada sem aval).
  - Linha de oferta reaproveitando `founderOffer` (`trialLine` + `afterTrialPre/Price/Post`) — mesmo
    texto da home, sem novo valor hardcoded.
  - Aviso de requisito Garmin, reaproveitando a frase do `AccessForm.tsx:81` (mesma mensagem, mesmo
    tom de honestidade).
- Captura do painel: reusar o componente `<AttentionQueue />` (`src/landing/ProductUI.tsx`) já usado
  na home — é a mesma UI ilustrativa, evita introduzir uma imagem ou pipeline de screenshot "real"
  nova. Posição: lado a lado com o formulário no desktop, abaixo dele no mobile.
- Contador de vagas: **sem dado vivo nesta change** (`FE-04`, endpoint de backend, está fora de
  escopo). Usar o texto estático já existente ("Turma fundadora — 10 vagas"), sem reescrevê-lo como
  se fosse dinâmico.
- Layout mobile-first: todo o bloco de valor + formulário visível sem rolar mais de uma tela em
  390px de largura (a captura do painel pode ficar abaixo da dobra no mobile — só o formulário e a
  proposta de valor textual precisam caber).

## Non-Goals

- Não altera campos do formulário, nem unifica `/waitlist` com o formulário da home (`FE-02`).
- Não implementa contador de vagas dinâmico nem endpoint de backend (`FE-04`).
- Não adiciona captura/screenshot real do painel em produção — usa o componente ilustrativo já
  existente na home.
- Não toca SEO, Open Graph nem eventos de analytics (`FE-07`).

## Critérios de aceite

1. **Conteúdo sem rolar no desktop** — Given viewport desktop (≥1280px), When `/waitlist` carrega,
   Then o que é / para quem / quanto custa / requisito Garmin estão visíveis sem scroll.
2. **Preço idêntico à home** — Given o bloco de oferta em `/waitlist`, Then o texto de preço e
   condições vem de `src/landing/content.ts` (`founderOffer`), sem duplicar o valor em string
   literal nova.
3. **Sem outra integração mencionada** — Given o texto da página, Then a única marca de relógio
   citada é Garmin.
4. **Mobile sem rolar o formulário** — Given viewport 390px de largura, When a página carrega,
   Then o formulário (ou o início dele) está visível na primeira tela, sem exigir mais de uma
   rolagem para alcançá-lo.
5. **Regressão** — `npm run lint && npm run build && npm run test:run` passam; o teste existente de
   `WaitlistPage.test.tsx` continua verde (ajustado se a estrutura do DOM mudar).

## Métrica de sucesso

Proxy mecânico nesta change (sem instrumentação de funil ainda — isso é `FE-07`): os critérios de
aceite 1–4 verificados por teste de componente/E2E. A métrica de produto real (taxa de conclusão do
formulário vindo do Instagram) só é observável depois de `FE-03` (UTMs) e `FE-07` (eventos).

## Open Questions & Assumptions

- **Premissa:** a captura do painel pode ser o componente ilustrativo `<AttentionQueue />` em vez de
  um screenshot real — mais barato, consistente com a home, e os dados já são rotulados como
  ilustrativos no código-fonte (`// Dados ilustrativos da UI de produto`). Se o founder quiser um
  screenshot real do produto, isso é uma change separada (ativo de imagem, não lógica).
  Ver [[refine-waitlist-screenshot]] se essa decisão for revisitada.
- **Premissa:** o título "Turma fundadora — 10 vagas" continua estático até `FE-04` existir; não é
  tarefa desta change trocar por "contador de vagas com fonte única".
- **Aberto:** se `/waitlist` e a home devem futuramente compartilhar um componente de "bloco de
  oferta" único (`founderOffer`) em vez de duas renderizações independentes do mesmo texto — não é
  necessário para o escopo desta change (ambas já leem a mesma constante), mas vale revisitar se
  `FE-02` também for implementado.
