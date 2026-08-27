**Tamanho:** M · **Trilha:** Full

## Why

A tela Progresso do atleta (`AthleteProgressPage`) mostra o **mesmo conjunto que o coach vê**, sem
tradução: quatro abas (Visão Geral, Forma, Volume, Provas) escondem o conteúdo; a primeira exibe
cinco KPIs em "pts" (CTL, ATL, TSB) explicados só em `Tooltip` de hover — que não existe no toque;
o PMC de 12 semanas, a distribuição de zonas de 90 dias e os recordes ficam atrás de um toque cada.
Foi o item 4 das sugestões da revisão de design de 2026-08-26 (canvas
<https://claude.ai/code/artifact/bfa9863e-cba8-4a1f-bbc9-fe9cfb4a957d>, página "Progresso"), e a
única tela do shell que ficou fora das quatro changes da trilha.

**Por que isso importa para o treinador.** Progresso é onde o atleta decide se o plano "está
funcionando". Quando ele não consegue ler isso sozinho, pergunta ao coach ("estou melhorando?",
"por que tanto Z2?") — ou desiste em silêncio, que é o sinal que o Retention Radar tenta pegar
tarde. Quatro respostas em português, com o número atrás, tiram essas perguntas da caixa de
mensagens do coach e dão ao atleta o argumento para continuar.

## What Changes

Somente `apps/menthoros-front`, sem mudança de contrato. Prancheta "Progresso — proposta":

- **Sem abas.** Um scroll com quatro blocos, cada um respondendo uma pergunta em PT-BR, o número
  logo abaixo, o gráfico atrás de um link quando houver.
- **1 · "Estou ficando mais forte?"** — leitura **descritiva, nunca um veredito**: "Sua carga
  subiu +6 nas últimas 4 semanas" / "ficou estável" / "caiu −4", derivada do delta do CTL no PMC
  já carregado (`useAthletePmc`), com sparkline de 12 semanas do CTL. Um chip em palavras: forma
  (`FAIXA_APRESENTACAO[statusForma]` — a classificação **do backend**, `FaixaTsb`; não se cria
  classificação paralela de cansaço por ATL/CTL). "Ver o gráfico completo" **expande** o `PMCChart`
  atual logo abaixo, na mesma tela (não some para um drawer). Link "Falar com o coach" no bloco —
  a interpretação é dele.
- **2 · "Estou treinando nas zonas certas?"** — barras Z1–Z5 da distribuição de 90 dias
  (`useAthleteZones`, percentuais normalizados para somar 100) com a frase da zona dominante
  ("62% do tempo em Z2"). O `ZoneDistributionInsight` atual é um **donut Recharts** — o bloco
  desenha as próprias barras; o insight sai se não houver outro consumidor. **Sem alvo da fase**
  (não existe no contrato) — sem marcador; a frase é descritiva, não avaliativa.
- **3 · "Estou cumprindo o plano?"** — `N de M` treinos nas 4 semanas (`useAthleteAderencia`),
  quatro barras semanais com a corrente diferenciada, percentual. O backend só devolve semanas
  **com treino planejado**: semanas ausentes entram como "sem plano" (barra apagada), sempre
  quatro. **Sem a explicação do que ficou para trás** (o DTO só traz contagens) — link "Falar com
  o coach".
- **4 · "O que já quebrei?"** — recordes (`useAthleteRecordes`) com marca "novo" quando o recorde
  é dos últimos 28 dias (o `RecordRow` ganha `dataIso` — hoje só expõe a data formatada; o
  `RecordeDto.data` do backend é `LocalDate`), e a próxima prova, como hoje.
- **Sistema**: `elevation.card` + `surface[700]`, Space Grotesk nos números, Inter no texto,
  raios 12/8, sem `pts`, sem tooltip como único portador de explicação. Os `rem` fora da escala
  (`0.75`, `0.8`, `0.85`, `1.5`) saem.
- `PMCChart` continua na tela (expansível no bloco 1); `ZoneDistributionInsight` (donut) sai se
  ninguém mais o consome (task 0.1).

## Non-Goals

- Não muda contrato nem backend. Alvo de zona por fase e tipo dos treinos perdidos são follow-ups
  de backend (registrados no Radar).
- Não altera o cálculo de nada e **não cria classificação paralela**: forma/fadiga vêm do backend
  (`FaixaTsb`); a única regra nova é o limiar de "estável" do ΔCTL, no `design.md`, nunca no
  componente.
- Não emite veredito sobre o atleta ("Sim"/"Não", "cumprindo"/"falhando"): a UI descreve e o
  coach interpreta — cada bloco tem saída para ele.
- Não toca Home, Plano, Coach ou Perfil.

## Critérios de aceite

1. **Sem abas** — Given a tela, Then não há `role="tab"`; os quatro blocos estão no fluxo vertical
   com `data-testid` `progress-stronger`, `progress-zones`, `progress-adherence`, `progress-records`.
2. **Leitura derivada, nunca inventada** — Given PMC com CTL 42 → 48 em 4 semanas, Then o bloco 1
   diz "subiu +6"; Given o ponto de D−28 ausente mas há ponto entre D−31 e D−25, Then usa o mais
   próximo; Given nenhum ponto nessa janela, Then "Ainda cedo para comparar" sem delta; Given PMC
   vazio, Then o estado vazio honesto atual. Nenhum "Sim"/"Não".
3. **Sem jargão** — Given a tela, Then não há "CTL", "ATL", "TSB", "pts" fora do gráfico completo
   (que fica atrás do link e mantém os eixos técnicos).
4. **Zonas** — Given distribuição que arredonda para 99 ou 101, Then as cinco barras somam
   exatamente 100 (o resto vai à maior) e a frase cita a dominante; Given sem dados, Then vazio.
5. **Aderência** — Given 4 semanas com 4/4, 3/4, 2/3, 2/3, Then "11 de 14 · 79%" e quatro barras
   com a corrente marcada; Given o backend devolve só 2 semanas, Then quatro barras, duas "sem
   plano"; Given erro, Then `Alert` com retry.
6. **Recordes** — Given recorde com data nas últimas 4 semanas, Then marca "novo"; Given sem
   recordes, Then "Ainda sem recordes".
7. **Gráfico completo** — Given o link do bloco 1, When tocado, Then o `PMCChart` atual expande
   na tela (mesmo componente, sem regressão); Given expandido, Then "Falar com o coach" continua
   visível no bloco.
8. **Tokens** — nenhum `font-family` Syne e todo `font-size` na escala, com a varredura limitada ao
   conteúdo **fora** do gráfico expandido (Recharts tem fontes próprias); o gráfico é asserido à
   parte pela presença do componente.
9. **Regressão** — `lint + build + test:run` verdes; `tests/e2e/athlete/smoke-tema.spec.ts`
   continua verde; E2E novo `progress.spec.ts` cobrindo 1, 3, 7 e 8 em 390×844.

## Métrica de sucesso

- **Perguntas "estou melhorando?" / "por que tanto Z2?" ao coach** — cair; contagem manual no
  piloto (mesmo dono e lugar da `athlete-plan-agenda`: coach piloto, 2 semanas antes / 4 depois).
- Proxy mecânico: E2E dos critérios 1, 3, 7, 8 verdes.

## Open Questions & Assumptions

- **Limiar de "estável" (bloco 1):** |ΔCTL| < 3 em 4 semanas → "ficou estável"; fora disso,
  "subiu +N" / "caiu −N". Único número novo; validado com o founder na 0.2 (não há coaches de
  piloto ainda — quando houver, a 0.2 é reaberta com eles, porque "o que é progredir" é domínio
  deles). Fica no `design.md`, não no componente.
- **Retirado (product review + Codex):** a classificação de cansaço por ATL/CTL — criaria uma
  régua paralela à `FaixaTsb` do backend e poderia contradizê-la. Forma vem só de `statusForma`.
- **Alternativa considerada:** só traduzir os KPIs para PT-BR sem frase alguma. Rejeitada: o
  número sem leitura é o que hoje gera a pergunta ao coach; a frase descritiva ("subiu +6") é o
  meio-termo — informa sem julgar.
- **Premissa:** `useAthletePmc` devolve pontos diários suficientes para 12 semanas (range `12w`
  já usado pelo `PMCChart`).
- **Premissa:** `buildRecordRows` expõe a data do recorde em formato comparável (task 0.1).
- **Follow-ups de backend (Radar):** alvo de zona por fase (marcador na barra do bloco 2); tipo dos
  treinos perdidos na aderência (explicação do bloco 3); sinal no dashboard do coach quando um
  atleta vê "caiu" seguidas vezes (sugestão do product review — é da fila de atenção, não daqui).

## Definition of Ready (2026-08-26)

- Product review: **Refine** — o bloco 1 emitia veredito ("Sim/Ainda não") no lugar do coach.
  Incorporado: leitura descritiva com número, "Falar com o coach" em todos os blocos, validação
  dos limiares reaberta com coaches quando existirem, alternativa registrada.
- Codex, rodada 1: **NOT READY** — 2 blockers e 5 majors, verificados: régua paralela de cansaço
  (retirada); limiares pendentes (só um ficou, na 0.2); D−28 exato frágil (tolerância ±3 dias);
  `RecordRow` sem `dataIso` (entra); `ZoneDistributionInsight` é donut, não barras (bloco próprio);
  PMC para drawer perdia inspeção (vira expansão inline); arredondamento das zonas (normalizado);
  aderência com menos de 4 semanas (preenchidas); varredura E2E limitada fora do gráfico.

## Referências

- Canvas, página "Progresso": pranchetas "Progresso — atual (Visão Geral)" e "Progresso — proposta".
- `athlete-home-restructure` (tema do shell, tokens), `athlete-plan-agenda` (métrica manual com
  dono).
