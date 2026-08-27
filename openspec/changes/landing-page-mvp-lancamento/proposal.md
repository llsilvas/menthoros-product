**Tamanho:** M · **Trilha:** Full

## Why

A landing (`apps/menthoros-front`, `src/pages/landing/LandingPage.tsx` + `src/landing/`) foi revisada
em sessão de design (2026-08-27) e tem problemas que custam conversão hoje: a dobra entrega 560px de
vídeo antes da proposta de valor (título e CTA saem da viewport em 1366×768, o tamanho de desktop
corporativo mais comum); títulos quebram em palavras coladas no mobile ("lendoplanilha") por um `<br>`
escondido sem espaço; rótulos mono usam um cinza abaixo do contraste AA; o link da Política de
Privacidade está dentro do `<label>` do checkbox de consentimento — o mesmo padrão que o
`CLAUDE.md` do front já proíbe, por já ter quebrado o registro de consentimento uma vez
(`add-coach-lgpd-consent`); e o FAQ "Quanto custa?" e o passo "Conecte e colete" fazem promessas que
o MVP ainda não cumpre (preço indefinido, "qualquer marca de relógio").

**Por que isso importa agora.** O MVP está fechando para lançar com **10 vagas para assessorias
parceiras fundadoras** — a página que capta essas 10 é a única superfície de conversão que existe
antes do produto abrir. Uma dobra que esconde a proposta, uma promessa de preço vazia e uma
integração anunciada como universal quando hoje só existe Garmin não são só bugs de UI: são o tipo de
atrito e de expectativa quebrada que custa exatamente as vagas que o programa fundador precisa
preencher.

A revisão de design desenhou a solução na Opção A do canvas
<https://claude.ai/code/artifact/c862932f-7228-437c-bc61-74d478aa4dd6> (páginas inteiras em 1366×768
e 390×844, com notas por seção) — fonte de verdade visual e de copy para esta change.

## What Changes

Frontend apenas (`apps/menthoros-front`). Uma única change: todas as peças abaixo pertencem à mesma
prancheta e servem ao mesmo objetivo (captar as 10 fundadoras) — fatiar em várias changes fragmentaria
a revisão de uma página que só faz sentido lida de cima a baixo, sem reduzir risco real (nada aqui
toca API, schema ou mais de um repo).

**A · Dobra do hero (`LandingPage.tsx`, `VideoShowcase.tsx`, `sections.tsx#Hero`)**
- Vídeo (`showcase.mp4`) vira fundo do hero (poster + overlay em degradê), não mais um bloco de
  560px acima do título. Bloco de texto + CTA + card "Fila de Atenção" centralizados verticalmente
  no hero (`minHeight: calc(100vh - <altura da nav>)` com `alignItems: center` — não altura fixa em
  px, que só vale para uma viewport).
- Reencode de `showcase.mp4` com `-movflags +faststart` (hoje o `moov` vem depois do `mdat` — o
  browser baixa o arquivo inteiro antes de decodificar), poster gerado a partir de um frame real,
  `preload="metadata"` no lugar de `"auto"`.

**B · Seções abaixo da dobra (`sections.tsx`, `primitives.tsx#SectionMark`)**
- Marca de seção: numeral vazado + rótulo na mesma linha, sem repetir "§ NN —" acima dele.
- Passos de "Como funciona": pílulas `PASSO 01/02/03` no lugar dos numerais grandes em lime, que
  colidiam visualmente com a marca de seção.
- Cabeçalho do card Delta reordenado (nome · semana · métrica) — evita "14" órfão sozinho na quebra
  do mobile.
- `SectionHeading` (`primitives.tsx:701-727`): título com `\n` ganha um espaço antes do `<br>`
  condicional — hoje o `<br>` some abaixo de 900px sem deixar nada no lugar, produzindo
  "lendoplanilha", "sóexibição", "treinadoresperguntam" em seis das sete seções no mobile.

**C · Seção Confiança sem foto placeholder**
- `founder-placeholder.jpg` (modelo de banco de imagens com "Leandro" escrito embaixo) sai. Vira
  citação do fundador + avatar de iniciais até existir foto real.

**D · Nova seção "Planos e preços" (entre Confiança e FAQ)**
- Cinco planos com os valores fechados pelo founder: Gratuito (≤10 atletas, 1 técnico, R$0/mês),
  Basic (≤20, 1, R$99/mês — destacado como o plano em que as fundadoras caem), Pro (≤50, 2,
  R$199/mês), Enterprise (≤100, 5, R$349/mês), Scale (100+, ilimitado, R$599/mês).
- Intro deixa claro: é a tabela do lançamento geral; as 10 fundadoras não escolhem entre os planos —
  pulam direto para o Basic no dia 61 do trial (ver item F).
- **O card Basic e o cabeçalho da seção declaram a mecânica do trial por extenso** ("60 dias grátis,
  sem cartão — no dia 61 vira Basic se você cadastrar o cartão"), não só o badge "SEU PLANO APÓS O
  TRIAL". Um visitante que só lê a seção de preços (sem abrir o FAQ) não pode ler R$99–R$599 sem ver
  também que os primeiros 60 dias são grátis — ver Riscos e mitigações, achado 1.

**E · Compatibilidade honesta — Garmin**
- Passo "Conecte e colete" deixa de prometer "independente do relógio ou app" — hoje só a integração
  Garmin está ativa; outras marcas entram por demanda das parceiras.
- FAQ "Preciso que meus atletas tenham um relógio específico?" responde a verdade (hoje sim, Garmin)
  em vez do "não precisa trocar de equipamento" atual.
- Nota curta no formulário final, antes do consentimento, repetindo a mesma informação no último
  ponto de honestidade antes do envio.

**F · Mecânica do programa fundador**
- 10 vagas, 60 dias grátis sem cartão; no dia 61 cadastra cartão e vira Basic (R$99/mês, 1 técnico,
  ≤20 atletas); sem cadastro até lá, perde o acesso.
- Refletida em três pontos: escassez do hero ("10 vagas do programa fundador · 60 dias grátis, sem
  cartão" — substitui a "vagas limitadas" genérica de hoje), FAQ "Quanto custa?" (substitui o
  "estamos fechando os planos, solicite acesso" evasivo atual) e microcopy do CTA final.

**G · Formulário de acesso (`AccessForm.tsx`)**
- Botão de submit sempre habilitado; falta de consentimento LGPD vira erro inline no submit, no
  mesmo padrão dos outros campos — hoje o botão nasce desabilitado e apagado, sem dizer por quê.
- **A validação do consentimento vive em `accessFormValidation.ts` (`AccessFormErrors` ganha o campo
  `aceiteLgpd`), não é tratada localmente no componente** — o `disabled` atual garantia, de graça,
  que nenhum caminho de submit (clique ou Enter) passasse sem consentimento; mover isso para "erro no
  submit" só mantém essa garantia se a validação for uma função pura testável, não uma checagem ad hoc
  no handler. Ver Riscos e mitigações, achado 2.
- Link da Política de Privacidade sai de dentro do `<label>` do `FormControlLabel` (vira irmão do
  checkbox, não filho) — hoje um clique no link alterna o checkbox em vez de navegar, o mesmo bug já
  documentado e corrigido uma vez em `add-coach-lgpd-consent`.

**H · Contraste**
- Rótulos mono (`text.disabled` = `#64748B`, contraste 3,9:1 contra o navy) trocam para
  `text.secondary` = `#94A3B8` (7,3:1) — eyebrow do hero, escassez, marca de seção, chips de prova,
  rodapé. Abaixo do AA (4,5:1) para texto pequeno hoje.

## Non-Goals

- **Prova social real** (número de assessorias/atletas em teste) — a prancheta desenhou um bloco de
  3 fatos (`[N] atletas em beta`, `[N] semanas de dados`, `[N] assessorias fundadoras`) mas nenhum
  número real foi fornecido. **Fica fora desta change** até existir um dado verdadeiro — ver Open
  Questions. Corte confirmado como seguro em Riscos e mitigações: a origem do tráfego é a waitlist
  existente (audiência aquecida), não tráfego frio.
- **Posicionamento explícito vs. concorrência** (TrainingPeaks, intervals.icu, planilha) — levantado
  na revisão de marketing como gap, mas sem copy nem brief definido. Fica para uma change futura. Pelo
  mesmo motivo acima, o corte é seguro para esta audiência.
- **Personalização para quem vem da waitlist** ("você já está na nossa lista") — decisão do founder em
  2026-08-27: a página fica genérica; a mesma copy serve para quem vem da waitlist e para qualquer
  outro visitante.
- Tabela completa de planos como página própria (`/precos`) — a tabela desta change vive só dentro da
  landing.
- SEO/meta tags, analytics de funil de conversão, A/B test — não fazem parte desta change.

## Acceptance Criteria

1. **Dobra sem o vídeo bloqueando a proposta.** Given um visitante em desktop 1366×768, When abre a
   landing, Then o título, o CTA "Solicitar acesso" e o card "Fila de Atenção" estão visíveis sem
   rolar a página.
2. **Sem palavras coladas no mobile.** Given um viewport de 390px, When a página renderiza, Then
   nenhum título de seção concatena duas palavras sem espaço (nenhum `<br>` condicional sem espaço
   substituto).
3. **Planos corretos.** Given a seção "Planos e preços", When renderizada, Then exibe exatamente:
   Gratuito R$0 (≤10 atletas, 1 técnico), Basic R$99 (≤20, 1, destacado), Pro R$199 (≤50, 2),
   Enterprise R$349 (≤100, 5), Scale R$599 (100+, ilimitado).
3b. **Trial visível onde o preço aparece.** Given a seção "Planos e preços" (não o FAQ), When um
   visitante lê só essa seção, Then encontra, sem precisar abrir o FAQ, que os primeiros 60 dias são
   grátis e sem cartão, e que o cadastro do cartão só acontece no dia 61 — o card Basic e/ou o
   cabeçalho da seção declaram isso por extenso, não só via badge.
4. **Preço sem evasiva.** Given o FAQ "Quanto custa?" expandido, When lido, Then descreve os 60 dias
   grátis sem cartão, o cadastro de cartão no dia 61, a migração para Basic R$99/mês e a perda de
   acesso sem cadastro — sem nenhum placeholder `[preço]` ou `[N]` restante nesse texto.
5. **Garmin sem promessa falsa.** Given o passo "Conecte e colete" e o FAQ do relógio, When lidos,
   Then declaram que hoje a integração ativa é o Garmin, sem afirmar "independente da marca" ou
   equivalente.
6. **Consentimento validado no submit, não escondido.** Given o formulário preenchido sem marcar o
   consentimento LGPD, When o visitante clica em "Solicitar acesso" **ou pressiona Enter em qualquer
   campo do formulário**, Then o botão está habilitado, o envio não acontece (`inscrever` não é
   chamado), e uma mensagem de erro de consentimento aparece no mesmo padrão dos demais campos,
   validada por uma função pura testável em `accessFormValidation.ts` — não uma checagem ad hoc só no
   componente.
7. **Link fora do label.** Given o link "Política de Privacidade" no formulário, When inspecionado no
   DOM, Then é irmão do `<label>` do checkbox, nunca filho — clicar no link nunca alterna o checkbox.
8. **Contraste AA.** Given os rótulos mono da landing (eyebrow, escassez, marca de seção, chips,
   rodapé), When a razão de contraste é medida contra o fundo `#0A1628`, Then é ≥4.5:1.
8b. **Hero resiste a viewport curto.** Given uma janela de desktop baixa (ex.: 1366×600) ou zoom de
   browser a 150–200% (efeito equivalente a reduzir a altura útil), When a página carrega, Then nem o
   título nem o CTA saem para fora da área visível por causa da centralização vertical — o hero tem
   uma estratégia de overflow (não trava numa altura que corta conteúdo) e o mobile landscape
   (844×390) também é testado, não só o retrato.
9. **Vídeo não bloqueia o LCP.** Given a landing carregada com throttling de rede, When o Lighthouse
   mede o Largest Contentful Paint, Then o LCP não piora em relação à baseline atual (o vídeo some da
   dobra; o poster carrega antes do título ficar visível).
10. **Testes refletem o novo comportamento.** Given a suíte de `LandingPage.test.tsx`,
    `AccessForm.test.tsx` e `Nav.test.tsx`, When rodada após a change, Then passa — incluindo a
    reescrita do teste "mantém o envio desabilitado até aceitar a LGPD" (comportamento
    intencionalmente trocado pelo item G, não um bug).

## Riscos e mitigações

Pré-mortem cross-model (`/codex:adversarial-review`, 2026-08-27) devolveu **needs-attention** — dois
achados altos e dois médios, dobrados nas seções acima. Registro aqui a rastreabilidade:

| # | Severidade | Achado | Mitigação aplicada |
|---|---|---|---|
| 1 | Alto | Mecânica de cobrança (dia 61) só aparece no FAQ/CTA — quem lê só a seção de preços vê R$99–599 sem contexto de trial | Item D + AC3b: card Basic/cabeçalho da seção declaram "60 dias grátis, sem cartão" por extenso, não só via badge |
| 2 | Alto | Validação de consentimento "no submit" podia virar checagem ad hoc no componente, perdendo a garantia que o `disabled` dava de graça (inclui submit por Enter) | Item G + AC6 + tasks G.1/G.3: `aceiteLgpd` entra em `AccessFormErrors`/`validate()` como função pura testável; teste cobre clique **e** Enter |
| 3 | Médio | `minHeight: calc(100vh - nav)` com centralização vertical não testado em viewport curto, zoom, mobile landscape, notch | AC8b nova + `design.md` D1 atualizado com estratégia de overflow |
| 4 | Médio | Preço aparece antes da explicação do trial (seção Planos antes do FAQ) | Mesma mitigação do achado 1 — a explicação passa a estar na própria seção de preços, não só depois dela no FAQ |

O pré-mortem também perguntou se a cobrança do dia 61 é automática após cadastro do cartão ou exige
confirmação explícita de plano pago. **Não é automática nesta change**: o cadastro do cartão e a
migração de fato para Basic acontecem **dentro do produto**, não nesta landing — o formulário aqui só
capta a inscrição no programa fundador. A landing precisa *anunciar* a mecânica corretamente (é isso
que os achados 1/4 cobram), não implementá-la; o fluxo de cadastro de cartão em si é, por definição,
uma change futura de produto (fora do escopo desta, que é só marketing/aquisição).

Revisão de produto (`menthoros-workflow:product-reviewer`, 2026-08-27) devolveu **Go**, condicionado a
quatro perguntas que só o founder responde — não bloqueiam a implementação, mas ficam registradas:

1. ~~**Origem do tráfego das 10 vagas**~~ — **Resolvido pelo founder em 2026-08-27:** a origem é a
   **waitlist já existente** (pessoas que já demonstraram interesse antes do MVP fechar), não tráfego
   pago/frio. O objetivo desta página é converter quem já está cadastrado lá em usuário do programa
   fundador. Confirma que os Non-Goals (sem prova social fabricada, sem posicionamento vs.
   concorrência) são um corte seguro — é audiência aquecida, não desconhecida cética.
   **Decisão de escopo (2026-08-27):** a página **permanece genérica** — mesma copy para quem vem da
   waitlist e para qualquer outro visitante que receba o link. Nenhuma personalização "você já está na
   nossa lista" entra nesta change (exigiria saber, na própria página, que a pessoa já se cadastrou —
   hoje não há esse dado nem esse mecanismo). Se o founder quiser essa personalização depois, é uma
   change própria, não um adendo a esta.
2. **Como medir "visitantes únicos"** para a métrica de sucesso declarada, já que analytics de funil
   está nos Non-Goals — sem isso, dá para contar submissões, não a taxa de conversão de fato.
3. "Técnico" na tabela de planos — rótulo de marketing ou nome que precisa alinhar com o domínio? (já
   registrado em Open Questions).
4. Confirmar que os valores de Pro/Enterprise/Scale (publicados mesmo sem clientes nesses tiers ainda)
   não mudam no curto prazo — a página os torna públicos e comparáveis.

## Métrica de sucesso

Esta change precede o treinador estar dentro do produto — é aquisição, não rotina de uso, então a
métrica-padrão do config ("minutos por revisão", "% de propostas aceitas") não se aplica ainda.
Métrica adotada: **taxa de conversão do formulário de acesso** (visitantes únicos → submissões
válidas) medida antes/depois do deploy, com meta operacional de preencher as **10 vagas do programa
fundador** dentro do período de captação planejado pelo founder.

**Gap identificado na revisão de produto:** essa métrica não é instrumentável com o escopo atual — os
Non-Goals excluem analytics de funil, então só dá para contar submissões, não visitantes únicos. Sem
isso, o founder sabe quantas inscrições chegaram, mas não a taxa de conversão de fato. Decisão de
adicionar um analytics mínimo (mesmo que só pageview) fica com o founder, fora desta change.

## Open Questions & Assumptions

- **Em aberto:** "técnico" na tabela de planos é o termo que o founder usou ao ditar os preços;
  assumo que é rótulo de marketing para assento de treinador com login na assessoria (1 técnico = 1
  treinador logado), não um conceito novo de domínio. Não confirmado contra nomenclatura existente no
  backend — conferir em `/implement init` se há um termo já em uso (`Treinador`, `Coach`, `Usuario`)
  antes de fixar "técnico" como rótulo de UI, e confirmar com o founder se procede.
- **Em aberto:** número real de prova social (atletas em teste, semanas de dados, assessorias já
  confirmadas). Sem esse dado, a seção Confiança fica só com a citação do fundador (item C) — sem o
  bloco de 3 fatos que a prancheta esboçou.
- **Em aberto:** cópia de posicionamento vs. concorrência (TrainingPeaks/intervals.icu/planilha) —
  não entra nesta change; ver Non-Goals.
- **Assumido:** o reencode de `showcase.mp4` é tarefa de asset/build (ffmpeg local), não
  infraestrutura de CI — roda uma vez, o arquivo re-encodado é commitado como qualquer outro asset em
  `src/assets/landing/`.
- **Assumido:** a estimativa de "não piora o LCP" (AC9) é validada manualmente com Lighthouse local
  antes/depois, não um gate de CI novo — não há orçamento de performance automatizado hoje no
  pipeline do front.
