# Design: recalcular a temporada a partir da semana editada

## Contexto

`SeasonPlanner.gerar` calcula, por semana de subida, sempre a partir da semana 1:

```
inicio = startCtl × 7
pico   = inicio × (1 + PEAK_GROWTH)            // 1,30 fixo
tss    = inicio + min((pico − inicio) × indice / subida, MAX_TSS_RAMP_PER_WEEK × indice)
volume = startVolumeKm × round(tss) / inicio
```

O volume é sempre proporcional ao TSS, e é o TSS que o motor semanal usa como teto.

`SeasonPlanAdjustmentServiceImpl.updateWeek` grava uma semana e marca `COACH`. `recalculate` regenera
tudo desde a semana 1 e pula semanas travadas e `COACH`.

## Decisão 1: âncora no `PATCH` da semana, não no `recalculate`

`SeasonWeekUpdateInputDto` ganha `followingPeakVolumeKm`. Com ele, `updateWeek` aplica a edição e regenera
as seguintes na mesma transação e sob o mesmo lock (`versioning.travar`).

Motivos:

- É atômico. Em dois passos, a falha do segundo deixa a edição gravada sem a curva.
- O `recalculate` exige `phaseWeeks` e `startVolumeKm` e refaz a estrutura. A âncora não muda estrutura.
- Um campo só carrega a intenção ("recalcular as seguintes") e o parâmetro (o pico).

`recalculate` e `SeasonPlanRecalculateInputDto` não mudam.

## Decisão 2: função pura nova, sem tocar `gerar`

`SeasonPlanner` ganha uma função que recebe as semanas do rascunho como `WeekPlan` (o record que o motor
já usa), o índice da âncora, o pico em km, a data e a distância da prova, e devolve a lista com TSS,
volume e longão novos depois da âncora. Sem record novo. Nenhuma entidade JPA entra no motor; o serviço
converte.

Contrato da conversão: `WeekPlan.targetTss` é `double`, então o serviço passa TSS nulo como 0 e volume
nulo como zero, como o `SeasonPlanResponseMapper` já faz. A função só lê índice, data, fase, descarga e,
nas semanas preservadas, TSS e volume. A âncora é validada (Decisão 4) antes da conversão, então nunca
chega zerada. Quais semanas a função pode regravar é dado pelo serviço, com uma lista de índices livres;
trava e origem ficam no serviço.

```
n       = semanas de BASE, BUILD ou PEAK depois da âncora
picoTss = ancoraTss × peakVolumeKm / ancoraVolume
// j = 1..n, na ordem das semanas de subida depois da âncora
tss     = ancoraTss + min((picoTss − ancoraTss) × j / n, MAX_TSS_RAMP_PER_WEEK × j)
tss     = descarga ? tss × DELOAD_FACTOR : tss
volume  = ancoraVolume × round(tss) / ancoraTss        // 1 casa, HALF_UP
longao  = SeasonPlanner.longao(fase, volume, descarga, tetoLongao, ancoraVolume, ancoraLongao)
```

O longão reaproveita o `longao` atual (do `season-plan-start-volume`) com a âncora no papel da partida:
`max(28%, ancoraLongao / ancoraVolume)` do volume, no máximo 50% e o teto por distância, 75% na descarga.
Âncora sem longão: 28%.

Polimento e semana da prova: `referencia × (1 − TaperStrategy.resolverReducaoPercentual(dias até a prova))`.
A referência é a mesma do `gerar` (`SeasonPlanner.java:193`): na última semana de subida livre, o TSS
calculado **antes** do fator de descarga; se ela é preservada, o TSS gravado dela. Sem semana de subida
depois da âncora (`n = 0`), a referência é o TSS da âncora. O volume do Polimento usa a razão km/TSS da
mesma referência: a da âncora, ou a da semana preservada quando ela tem volume e TSS positivos (achado
do QA: com a razão da âncora sobre o TSS de uma semana preservada mais densa, o Polimento passava do pico). "Pico alcançado" (log e aviso da tela) é o
maior volume gravado entre a âncora e as semanas de subida depois dela; assim uma última semana em
descarga não o derruba. Com `n = 0` o conjunto é só a âncora: pico anterior e alcançado são o volume
dela, e a tela avisa se o pedido passa dele em 0,5 km ou mais (nenhuma semana de subida para levar a
curva).

O teto `MAX_TSS_RAMP_PER_WEEK × j` limita a reta, não o degrau na volta de uma descarga, como no `gerar`.

Fase, descarga, marco e data não são recalculados: a função lê o que está no rascunho. Isso dispensa
refazer a cadência de descarga e o deslocamento por marco.

Alternativa rejeitada: parametrizar `gerar` com um índice de partida. `gerar` monta fases e descargas a
partir de `phaseWeeks`; a âncora precisa respeitar o que o treinador já mexeu no rascunho. E mexer em
`gerar` arrisca a geração inicial.

## Decisão 3: o que a âncora regrava

Depois de aplicar a edição na âncora:

- semana com índice maior que o da âncora, não travada e com origem diferente de `COACH`: recebe TSS,
  volume e longão da função e fica com origem `ENGINE`;
- semana travada ou `COACH`: não muda. A posição dela conta na rampa. A trava é a mesma de `updateWeek`
  e `recalculate`: `SeasonWeekLock.forPlan(SeasonPlanVersioning.primeiraProposta(temporada), ...)`. Na v1
  só a concluída trava, então a semana da prova é recalculada; no ajuste, a da prova fica;
- semanas anteriores e a própria âncora: não mudam além da edição.

`AI_ACCEPTED` existe em `WeekValueSource`, mas nenhum código a grava. Conta como livre, igual ao
`recalculate` (`SeasonPlanAdjustmentServiceImpl.java:216`, que só pula `COACH`).

`SeasonPlanVersioning.recalcularPicos` roda no fim, como hoje.

## Decisão 4: validação no serviço

Como no resto do ajuste, o serviço valida e responde 422; a rota não usa `@Valid`. A validação roda
depois de calcular o estado final da âncora e antes de gravar qualquer semana:

- `followingPeakVolumeKm` nulo: edição simples, nada novo;
- prova com data e número de semanas igual ao do rascunho
  (`SeasonPlanner.totalWeeks(dataProva, semana1.weekStart) == semanas.size()`), com a mesma mensagem do
  `recalculate` (`SeasonPlanAdjustmentServiceImpl.java:182`). Sem isso, a prova remarcada deixaria fases
  e datas antigas com o Polimento calculado pela data nova. Extrair a checagem para um método privado
  usado pelos dois;
- fase final da âncora em BASE, BUILD ou PEAK;
- âncora não é descarga (o valor dela está reduzido e não serve de patamar);
- volume e TSS finais da âncora maiores que zero;
- pico maior ou igual ao volume da âncora e no máximo `VOLUME_MAX_KM`; arredondado para uma casa
  (`setScale(1, HALF_UP)`), sem 422 por casas;
- depois de calcular, toda semana a regravar dentro dos limites da edição (`VOLUME_MAX_KM`, `TSS_MAX`,
  `LONGAO_MAX_KM`). Limitar o pico de entrada não limita a saída: âncora 20 km/TSS 3000 com pico 30 dá
  TSS 3616.

Idempotente por construção: a função é pura sobre o estado final da âncora.

## Decisão 5: o TSS segue o volume, na tela

A regra vive no `SeasonWeekEditDialog`, não no backend. Ao mudar o volume, se o treinador ainda não
editou o campo TSS neste diálogo e a semana tem volume e TSS originais positivos:

```
tss = round(tssOriginal × volumeNovo / volumeOriginal)
```

O campo TSS mostra o valor e continua editável. Depois que o treinador digita no TSS, o volume não mexe
mais nele. O backend segue gravando o que recebe.

Alternativa rejeitada: escalar no `updateWeek`. A tela reenvia o TSS atual junto com o volume, então o
backend teria de inferir "não mexeu" por igualdade com o gravado; quem quisesse subir o volume mantendo o
TSS seria sobrescrito em silêncio (revisão de produto, 2026-11-25).

## Decisão 6: pico sugerido pela proporção da edição

A tela pré-preenche o pico com:

```
pico = volumeUltimaSemanaDeSubida × volumeNovo / volumeOriginal      // 1 casa
```

Só quando a edição sobe o volume. Se reduz, ou sem volume original positivo, o campo vem vazio. Se a
âncora é a última semana de subida, usa o volume novo. O `SeasonAdjustTable` passa ao diálogo a lista de
semanas; o diálogo tira dela o volume da última semana de subida, o pico atual e as contagens N e M das
linhas de consequência.

A opção "Recalcular" depende da fase e da descarga **do formulário**, não das originais: é o estado final
que o backend valida. Aviso de pico não alcançado só a partir de 0,5 km de diferença; abaixo disso é
arredondamento (âncora 20 km/TSS 188, pedido 24,2 dá TSS 227 e 24,1 km).

O diálogo só existe no ajuste. A v1 não tem tabela editável (`SeasonTabPanel.tsx:135`); lá o recálculo
ancorado fica só na API.

A sugestão fica na tela porque é um valor à vista do treinador, não uma regra. O backend exige o pico.

Não usar `peakVolumeKm` da temporada: ele é o máximo de todas as semanas, inclusive as editadas.

## Decisão 7: sem persistir o pico pedido

O pedido vai para o log `season-plan.week-reanchored`, com o pico alcançado (maior volume de subida
depois da âncora, após o recálculo). O log atual de `updateWeek` passa a uma linha estruturada com
temporada, semana e `reanchored=true|false`, base da métrica. Sem contagem de alertas no log: a resposta já os traz pelo
`SeasonPlanResponseMapper`. `peak_volume_km` continua derivado por `recalcularPicos`.

## Impacto

- Contrato: campo opcional novo no corpo de
  `PATCH /api/v1/atletas/{atletaId}/season-plans/{seasonPlanId}/weeks/{weekIndex}`. Compatível com
  clientes que não enviam.
- Banco: nenhum.
- Multi-tenancy: nenhum; mesmo lock e mesmo escopo de tenant da edição atual.

## Limites conhecidos

- No ajuste, a semana da prova é travada e fica com o alvo antigo.
- O longão segue a proporção da âncora, entre 28% e 50% do volume.
- Depois de uma descarga, a volta à rampa pode passar de 10% sem alerta `RAMP` (regra atual do
  `SeasonPlanValidator`).
- Aprovar depois de a âncora travar devolve a âncora aos valores da ativa (`SeasonPlanVersioning`
  recopia o passado); as seguintes ficam recalculadas.
- O recálculo por fases regenera as semanas `ENGINE` desde a partida e desfaz a curva ancorada.
