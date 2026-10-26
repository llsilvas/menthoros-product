# coach-zonas-pace-fc-prescricao — zonas por pace e FC do atleta nos cards e no editor

**Tamanho:** L · **Trilha:** Full
**Status:** proposta
**Criado:** 2026-10-26
**Repos afetados:** `apps/menthoros-backend`, `apps/menthoros-front` — PR coordenado, backend primeiro

> **Absorve `coach-meta-intensidade-editor`** (M · Full, criada 2026-08-02). Aquela change estava
> bloqueada por `fix-fc-alvo-base-inconsistente`, arquivada em 2026-09-01 — o bloqueio já caiu. Os
> critérios dela (seletor de meta por etapa, fim do texto livre, rótulo correto, legado visível)
> entram aqui como CA9–CA13, porque o seletor de zona só faz sentido se o treinador vir **quanto é a
> zona para aquele atleta** — e isso é o que esta change acrescenta. Ao arquivar esta, arquivar
> aquela como superseded.

## Why

O treinador revisa e edita o plano sem ver as zonas do atleta.

**O que o backend já sabe e não mostra.** `ZonaTreinoService` calcula 5 zonas de FC (Friel %LTHR) e
6 de pace (fatores sobre `paceLimiar`); `PaceZoneCalculator` penaliza o pace pela fadiga (TSB: +3 a
+12 s/km); `ZoneResolver` converte `Z2` em bpm e min/km. Tudo isso alimenta o **prompt da IA** e o
**push para o intervals.icu**. Nenhum controller expõe a tabela ao treinador. Verificado em
2026-10-26: `ZonaTreinoService` tem 15 consumidores em `main/`, nenhum em `controller/`.

**O que o treinador vê hoje** (`PlanoDetalhePanel.TreinoTag`, `CurrentWeekPlan.TreinoCard`): dia,
km, tipo, duração, `zonaAlvo` como texto ("Z2-Z3") e RPE. "Z2" não diz nada sem a faixa: para um
atleta com LTHR 168 é 143–150 bpm; para outro com LTHR 180 é 153–160. O treinador que conhece o
atleta sabe de cabeça; o que tem 30 atletas não sabe, e é esse o treinador para quem o produto existe.

**O que o editor faz hoje** (`TreinoEditDialog.tsx:278`, `TreinoAddDialog.QuantRow`): o campo
rotulado "Zona alvo" é `TextField` livre que grava em `fcAlvoEtapa`. Aceita "Z5", "126-143 bpm" e
"trote leve" como se fossem a mesma coisa — só os dois primeiros viram alvo no relógio
(`IntervalsIcuTargetParser`). `ritmoAlvo` existe no contrato, a IA preenche em toda etapa, e o
editor **não exibe nem edita** (`etapaItem.ts:20-28`: "viaja de ida e volta intacto"). O RPE por
etapa é campo inerte: `camposDe()` descarta (`TreinoEditDialog.tsx:106`). A "Zona alvo" global do
treino é um terceiro texto livre, redundante com as etapas.

**Por que pace e FC juntos, e não um só.** Não medem a mesma coisa: a FC tem atraso de ~1–2 min e
deriva com calor e sono; o pace sofre com relevo e vento. A prática de prescrição usa pace como alvo
em intervalado e tiro (a FC não estabiliza num 800 m) e FC/RPE em rodagem, longão e dias de fadiga.
O modelo de zonas já reflete isso: Z6 existe só para pace, "cardiac lag" documentado no
`ZonaTreinoService`. O treinador precisa das duas colunas para escolher a certa — e o contrato do
atleta (`athlete-today-workout`, `alvoPrimario: 'FC' | 'PACE' | 'NENHUM'`) já carrega a escolha.

**Um defeito a corrigir antes de mostrar a tabela.** Os fatores de pace se sobrepõem:
Z3 = 0,98–1,05 × limiar, Z4 = 0,95–1,00, Z5 = 0,90–0,97. Com limiar 5:00, Z3 vai até 4:54 e Z4
começa em 5:00 — um pace de 4:57 está em Z3 **e** em Z4. Invisível no prompt (a IA recebe os dois
e escolhe); visível na primeira tabela que o treinador abrir.

## What Changes

1. **Endpoint de zonas do atleta para o coach** — `GET /api/v1/coach/atletas/{atletaId}/zonas`:
   seis zonas com faixa de pace e FC, as âncoras (`paceLimiar`, `fcLimiar`, datas dos testes), o
   ajuste por fadiga aplicado (s/km e TSB de prontidão usado) e a disponibilidade de cada eixo.
2. **Faixas de pace contíguas** em `ZonaTreinoService` (Z3 = 1,00–1,05 · Z4 = 0,95–1,00 ·
   Z5 = 0,90–0,95; Z1, Z2 e Z6 inalteradas). Muda o prompt da IA — passa pelo eval gate.
3. **Tabela "Zonas do atleta"** no painel de revisão do plano e no editor, recolhível, com âncoras,
   idade do limiar e ajuste por fadiga.
4. **Cards mostram a zona com o valor** (`Z2 · 143–150 bpm · 5:22–5:52`), com um eixo em destaque
   conforme o tipo da etapa/treino.
5. **Editor: zona vira seletor por etapa (Z1–Z6 + Personalizado)**, preenche pace e FC do atleta,
   e o treinador escolhe (ou aceita o default por regra) **qual eixo vai ao relógio**. Some o texto
   livre, some a "Zona alvo" global (derivada das etapas), some o RPE inerte por etapa.
6. **Validação como aviso, não bloqueio**: FC fora da faixa típica do tipo de etapa (tabela de
   `EtapaFcValidator`), pace e FC em zonas diferentes, texto legado não parseável.

## Capabilities

- **Nova:** `coach-athlete-zones` — o treinador consulta as zonas resolvidas de um atleta.
- **Modificada:** `fc-limiar-zones` — zonas de pace contíguas.
- **Modificada:** prescrição de treino pelo treinador (editor) — o que ele pode expressar e como.

## Impact

- **Contrato de API:** endpoint novo (aditivo). O patch/add de etapa **não muda de shape**: continua
  `fcAlvoEtapa` + `ritmoAlvo` + `alvoPrimario`; o editor passa a gravá-los em formato canônico
  (`"168-178 bpm"`, `"4:37-4:58/km"`) que o parser já lê. Ver Open Question Q1 para `alvoPrimario`.
- **Prompt da IA:** a tabela de pace muda (item 2) → eval gate obrigatório
  (`plan-generation-eval-set`, modo candidato).
- **Dados legados:** `fcAlvoEtapa` em texto livre continua lido; o editor mostra como
  "Personalizado" com o texto, nunca descarta (CA12).
- **Sem migration.** Sem mudança no modelo de zonas de FC.
- **Front:** `PlanoDetalhePanel`, `CurrentWeekPlan`, `TreinoEditDialog`, `TreinoAddDialog`,
  `etapaItem.ts`, novo hook e componente `ZoneSelector`. Fluxo coach-in-the-loop → E2E obrigatório.

## Critérios de aceite

**Backend**

- **CA1** — Given atleta com `paceLimiar = 5.00` e `fcLimiar = 168`, When
  `GET /coach/atletas/{id}/zonas`, Then devolve 6 zonas; Z2 tem `pace = 5:22–5:52`
  (×1,05–1,15) e `fc = 143–150` (85–89 %); Z6 tem pace e **`fc` ausente** com motivo
  `FC_NAO_ESTABILIZA`.
- **CA2** — Given o mesmo atleta com TSB de prontidão −12, Then cada faixa de pace vem com
  +7 s/km e o corpo declara `ajusteFadiga = { segundosPorKm: 7, tsbProntidao: -12 }`. Given TSB
  ≥ 0, Then `ajusteFadiga.segundosPorKm = 0`.
- **CA3** — Given atleta **sem** `paceLimiar`, Then as zonas vêm com `pace` ausente,
  `disponibilidade.pace = false` e `motivo = SEM_PACE_LIMIAR` — nunca `0:00–0:00` nem o fallback
  sintético 5,83 (`ZoneResolver.PACE_LIMIAR_FALLBACK_MIN_KM` é para o push, não para exibir).
- **CA4** — Given atleta de outro tenant, Then `404` (não `403`), igual aos demais endpoints
  `/coach/atletas/{id}/*`.
- **CA5** — Given `paceLimiar = 5.00`, When `calcularZonasPace`, Then para todo par de zonas
  adjacentes `paceMin(Zn) == paceMax(Zn+1)` — sem sobreposição e sem buraco; Z3 = 5:00–5:15,
  Z4 = 4:45–5:00, Z5 = 4:30–4:45.
- **CA6** — Given a mudança em CA5, Then a tabela do eval em modo candidato está no PR e o grader
  determinístico não regride.

**Painel e cards**

- **CA7** — Given plano em revisão de atleta com limiares, When o treinador abre o painel, Then
  existe a seção "Zonas do atleta" (recolhida por padrão) com as 6 linhas, as âncoras, a data do
  último teste e o chip de ajuste por fadiga quando `segundosPorKm > 0`.
- **CA8** — Given etapa com `fcAlvoEtapa = "143-150 bpm"` e `ritmoAlvo = "5:22-5:52/km"`, Then o
  card mostra `Z2 · 5:22–5:52 · 143–150 bpm`; o eixo em destaque é o `alvoPrimario` da etapa.
  Given atleta sem `paceLimiar`, Then o card mostra só a FC e um aviso "pace indisponível" — sem
  número inventado.

**Editor** (absorvidos de `coach-meta-intensidade-editor`)

- **CA9** — Given o editor, When o treinador edita uma etapa, Then a zona é um **seletor**
  (Z1–Z6 + Personalizado); escolher Zn preenche pace e FC com a faixa **deste atleta** e mostra os
  dois; o eixo que vai ao relógio aparece pré-preenchido e **sempre trocável num clique**, em
  qualquer zona e em "Personalizado" — nada no editor impede o treinador de escolher o eixo.
- **CA10** — Given zona escolhida, When salva, Then o payload da etapa leva `fcAlvoEtapa` e
  `ritmoAlvo` em formato canônico e `alvoPrimario` com o eixo escolhido — o push resolve o mesmo
  bpm/pace que a tabela mostrou (afirmar o **valor**, não a presença do campo).
- **CA11** — Given o editor, Then **não existe campo de texto livre** rotulado "Zona alvo": nem por
  etapa nem global. A zona do treino é derivada das etapas (`selectWorkoutProfile`) e exibida, não
  digitada. O RPE por etapa some; o RPE do treino fica.
- **CA12** — Given etapa legada com `fcAlvoEtapa = "trote leve"`, When aberta, Then o seletor
  mostra "Personalizado" com o texto no campo de FC e um aviso de que não vira alvo no relógio —
  nunca campo vazio que descarta ao salvar.
- **CA13** — Given o treinador escolhe "Personalizado" e informa pace em Z5 e FC em Z2 para o
  atleta, Then aparece aviso de divergência; salvar continua permitido.
- **CA14** — Given atleta sem `paceLimiar`, When o treinador escolhe uma zona, Then só a FC é
  preenchida, o eixo vai para FC, e há link para informar o limiar.
- **CA15** — Given o `TreinoAddDialog`, Then usa o mesmo `ZoneSelector` — não resta um segundo
  texto livre no caminho de adicionar treino.

**E2E**

- **CA16** — Spec Playwright: abre plano em revisão, edita a etapa INTERVALADO, escolhe Z5, confirma
  que pace e FC preenchidos batem com a tabela, salva, e o `PATCH` leva `ritmoAlvo` e `fcAlvoEtapa`
  com os valores da tabela.

## Métrica de sucesso

- Tempo de edição de uma etapa com meta de intensidade cai (hoje o treinador precisa calcular ou
  consultar fora) — medir pelo intervalo abrir-dialog → salvar nas edições com mudança de alvo.
- **Zero** etapas novas com `fcAlvoEtapa`/`ritmoAlvo` fora do formato canônico após o deploy
  (hoje: 0 no dev, mas só porque a IA gera quase tudo — a change fecha a porta).
- Rejeição de plano por "intensidade errada" (motivo em `reviewComment`) não aumenta.

## Open Questions & Assumptions

**Q1 — RESOLVIDA (2026-10-26, decisão do produto):** o eixo que vai ao relógio (`alvoPrimario`) é
**sempre decisão do treinador**. Cada treinador trabalha de um jeito; o produto não engessa. A regra
por tipo de etapa (pace em intervalado/tiro, FC em etapa leve) entra só como **pré-preenchimento
visível e trocável num clique**, nunca como restrição — e o treinador pode definir o eixo mesmo em
etapa "Personalizado". O único caso sem escolha é físico, não de produto: Z6 e atleta sem
`paceLimiar`/`fcLimiar` têm um eixo só. Follow-up: lembrar a preferência do treinador por tipo de
etapa (ver Fora de escopo).

**Q2 — os fatores de pace.** 1,15–1,25 / 1,05–1,15 / 0,98–1,05 / 0,95–1,00 / 0,90–0,97 /
0,82–0,90 não têm fonte documentada no código. A proposta só torna contíguos; não revalida contra
Daniels/VDOT. Fica anotado como follow-up.

**Q3 — RPE típico por zona** na tabela (1–2, 3–4, 5–6, 7, 8–9, 9–10) é heurística de UI, não
dado do atleta. Mostrar como referência cinza ou omitir?

**Premissas:**

- Modelo de zonas (Friel %LTHR, pace sobre limiar) permanece. Trocar modelo é decisão de produto,
  fora daqui.
- Distribuição de intensidade da semana no cabeçalho (minutos por zona, 80/20), CTL/ATL no header
  e variação vs. semana anterior ficam **fora** — são a próxima change, dependem deste endpoint.
- Cadência e potência ficam fora (produto é corrida).

## Fora de escopo

- Distribuição de intensidade semanal e progressão no cabeçalho do plano (próxima change).
- Revalidar os fatores de pace contra literatura (Q2).
- Editor de limiares do atleta (o link "informar limiar" aponta para a tela existente).
- Lembrar a preferência de eixo do treinador por tipo de etapa (substituiria a regra fixa de
  pré-preenchimento pela prática observada de cada treinador).
- Resolver alvo no push — feito em `fix-fc-alvo-base-inconsistente`.
