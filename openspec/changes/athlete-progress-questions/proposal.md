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
- **1 · "Estou ficando mais forte?"** — resposta curta ("Sim" / "Ainda não" / "Estável") derivada
  do delta do CTL nas últimas 4 semanas do PMC já carregado (`useAthletePmc`), sparkline de 12
  semanas do CTL, e dois chips em palavras: forma (`FAIXA_APRESENTACAO[statusForma]`) e cansaço
  (ATL em faixa relativa ao CTL). Link "Ver o gráfico completo" abre o `PMCChart` atual num
  drawer/seção expansível.
- **2 · "Estou treinando nas zonas certas?"** — barras Z1–Z5 da distribuição de 90 dias
  (`useAthleteZones`) com a frase da zona dominante ("62% do tempo em Z2"). **Sem alvo da fase**
  nesta change (não existe no contrato) — a barra não desenha marcador; a resposta curta fica
  descritiva ("A maior parte em Z2"), não avaliativa.
- **3 · "Estou cumprindo o plano?"** — `N de M` treinos nas 4 semanas (`useAthleteAderencia`),
  quatro barras semanais com a semana corrente diferenciada, percentual. **Sem a explicação do que
  ficou para trás** (o DTO de aderência só traz contagens) — link "Falar com o coach" para a aba
  Coach.
- **4 · "O que já quebrei?"** — recordes (`useAthleteRecordes`) com marca "novo" quando o recorde
  é das últimas 4 semanas, e a próxima prova (`useAthleteProvas`), como hoje.
- **Sistema**: `elevation.card` + `surface[700]`, Space Grotesk nos números, Inter no texto,
  raios 12/8, sem `pts`, sem tooltip como único portador de explicação. Os `rem` fora da escala
  (`0.75`, `0.8`, `0.85`, `1.5`) saem.
- Os componentes `PMCChart` e `ZoneDistributionInsight` continuam existindo (o gráfico completo é
  o link do bloco 1; a distribuição vira o bloco 2 — verificar na task 0.1 se o insight atual
  cabe ou se o bloco 2 usa só as barras).

## Non-Goals

- Não muda contrato nem backend. Alvo de zona por fase e tipo dos treinos perdidos são follow-ups
  de backend (registrados no Radar).
- Não altera o cálculo de nada: as frases são apresentação sobre deltas já disponíveis, com
  limiares definidos no `design.md` — nunca no componente.
- Não toca Home, Plano, Coach ou Perfil.

## Critérios de aceite

1. **Sem abas** — Given a tela, Then não há `role="tab"`; os quatro blocos estão no fluxo vertical
   com `data-testid` `progress-stronger`, `progress-zones`, `progress-adherence`, `progress-records`.
2. **Resposta derivada, nunca inventada** — Given PMC com CTL 42 → 48 em 4 semanas, Then o bloco 1
   diz "Sim" e "+6"; Given menos de 4 semanas de PMC, Then o bloco 1 diz "Ainda cedo para saber"
   e não mostra delta; Given PMC vazio, Then o bloco mostra o estado vazio honesto atual.
3. **Sem jargão** — Given a tela, Then não há "CTL", "ATL", "TSB", "pts" fora do gráfico completo
   (que fica atrás do link e mantém os eixos técnicos).
4. **Zonas** — Given distribuição 12/62/10/13/3, Then as cinco barras somam 100% e a frase cita a
   zona dominante; Given sem dados de zona, Then estado vazio atual.
5. **Aderência** — Given 4 semanas com 4/4, 3/4, 2/3, 2/3, Then "11 de 14 · 79%" e quatro barras
   com a corrente marcada; Given erro, Then `Alert` com retry, como hoje.
6. **Recordes** — Given recorde com data nas últimas 4 semanas, Then marca "novo"; Given sem
   recordes, Then "Ainda sem recordes".
7. **Gráfico completo** — Given o link do bloco 1, When tocado, Then o `PMCChart` atual aparece
   (mesmo componente, sem regressão).
8. **Tokens** — nenhum `font-family` Syne e todo `font-size` na escala (varredura E2E como na Home).
9. **Regressão** — `lint + build + test:run` verdes; `tests/e2e/athlete/smoke-tema.spec.ts`
   continua verde; E2E novo `progress.spec.ts` cobrindo 1, 3, 7 e 8 em 390×844.

## Métrica de sucesso

- **Perguntas "estou melhorando?" / "por que tanto Z2?" ao coach** — cair; contagem manual no
  piloto (mesmo dono e lugar da `athlete-plan-agenda`: coach piloto, 2 semanas antes / 4 depois).
- Proxy mecânico: E2E dos critérios 1, 3, 7, 8 verdes.

## Open Questions & Assumptions

- **Limiares da resposta curta (bloco 1):** "Sim" se ΔCTL ≥ +3 em 4 semanas, "Estável" se |Δ| < 3,
  "Ainda não" se ≤ −3 — números iniciais, a validar com o founder (task 0.2); ficam no `design.md`,
  não no componente.
- **Cansaço em palavras:** ATL/CTL < 1,1 "sob controle", 1,1–1,3 "alto", > 1,3 "muito alto" —
  mesma validação da 0.2.
- **Premissa:** `useAthletePmc` devolve pontos diários suficientes para 12 semanas (range `12w`
  já usado pelo `PMCChart`).
- **Premissa:** `buildRecordRows` expõe a data do recorde em formato comparável (task 0.1).
- **Follow-ups de backend (Radar):** alvo de zona por fase (marcador na barra do bloco 2); tipo dos
  treinos perdidos na aderência (explicação do bloco 3).

## Referências

- Canvas, página "Progresso": pranchetas "Progresso — atual (Visão Geral)" e "Progresso — proposta".
- `athlete-home-restructure` (tema do shell, tokens), `athlete-plan-agenda` (métrica manual com
  dono).
