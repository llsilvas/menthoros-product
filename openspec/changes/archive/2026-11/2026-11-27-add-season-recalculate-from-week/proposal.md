**Tamanho:** M · **Trilha:** Full

> Posterior ao épico `add-season-plan-macrocycle`. Estende a edição de semana do ajuste entregue em
> `add-season-plan-version-diff` (arquivada em 2026-11-23). Full porque muda contrato de API, toca o
> motor da temporada e toca backend e front. Fica como uma change só: a escala do TSS, a âncora e o pico
> são a mesma ação do treinador, e separadas nenhuma entrega a curva coerente.
>
> Nasceu como `add-season-recalculate-peak-volume` (pico informado no recálculo desde a semana 1). Foi
> reescrita em 2026-11-25, antes de qualquer código: recalcular desde a semana 1 cria um salto na primeira
> semana livre, e o que o treinador faz na prática é replanejar a partir da semana que mudou.

## Status

- ready-for-agent (2026-11-25): escopo fechado com o founder; as Open Questions restantes não bloqueiam.

## Why

O `SeasonPlanner` fixa o pico da temporada em **início × 1,30** (`PEAK_GROWTH`). O início é a média das
últimas 4 semanas do atleta. Quem gera a temporada voltando de lesão ou de pausa parte de um volume baixo,
e o pico fica baixo para sempre.

Caso real (homelab, 2026-11-25): atleta voltando de lombalgia, meia maratona em 15 semanas. Partida de
12,5 km/semana, pico de 16,2 km/semana, longão máximo de 4,5 km para uma prova de 21,1 km. Dois meses
antes ele rodava 25 a 30 km/semana.

O `season-plan-start-volume` (mergeado em 2026-11-25) corrigiu a partida: volume habitual, longão de
partida e edição da partida na v1. Ele não resolve a temporada que já está ativa quando o atleta melhora
no meio do ciclo, nem o pico fixo em 1,30.

Desde `add-season-plan-load-enforcement` a temporada é **teto** do plano semanal
(`LoadTargetResolver.resolveSeason` só corta). Então, quando o atleta melhora, o plano semanal não sobe:
o treinador precisa subir a temporada.

Hoje ele só consegue isso editando semana por semana, e a edição tem dois defeitos. No mesmo caso real, o
treinador subiu a semana 2 de 13,0 para 20,0 km:

- o TSS ficou em 122. O motor semanal lê só o `targetTss` como teto, então os 20 km não se realizam;
- a semana 3 continuou em 13,4 km. A curva virou um dente de serra (+54%, depois −33%).

O que um treinador faz ao mudar uma semana é decidir entre duas coisas: é uma exceção (viagem, prova-teste)
ou é o novo patamar, e daí a progressão segue dali até a prova. A progressão parte da carga atual, não do
plano original (Daniels, Pfitzinger), e voltar a um volume já feito é mais rápido que construir um inédito.

## What Changes

Ao editar uma semana, o treinador pode pedir: **recalcular as semanas seguintes até a prova**, a partir
dela, até um volume de pico que ele informa.

### Backend

- `SeasonWeekUpdateInputDto` ganha `followingPeakVolumeKm` (opcional, km, uma casa decimal). Ausente, a
  edição é a de hoje: só a semana muda.
- Presente, `updateWeek` grava a semana e, na mesma transação, regenera as semanas seguintes. A semana
  editada é a **âncora**: a rampa parte do volume e do TSS dela e chega ao pico na última semana de subida
  (Base, Construção ou Pico).
- Função nova e pura no `SeasonPlanner` para a rampa ancorada. Ela não refaz a estrutura: fase, descarga,
  marco e data de cada semana ficam como estão no rascunho. Só mudam TSS, volume e longão.
- O TSS sobe na mesma proporção do volume, pela razão TSS por km da âncora.
- O longão segue a regra atual do motor, com a âncora no papel da partida: a proporção longão/volume da
  âncora é preservada (mínimo de 28%, máximo de 50% do volume e teto por distância). No caso real, a
  âncora tem 8,0 km de longão em 20 km (40%), então o pico de 30 km leva o longão a 12,0 km.
- O teto de rampa do motor (`MAX_TSS_RAMP_PER_WEEK` por semana depois da âncora) limita a reta. Se o pico
  pedido não cabe, a curva para no teto.
- Polimento segue a mesma redução de hoje (`TaperStrategy`), aplicada sobre a referência do `gerar`: o TSS
  da última semana de subida **antes** do fator de descarga, se ela é livre; o TSS gravado dela, se é
  preservada (`COACH` ou travada).
- Ficam fora as semanas travadas pela mesma regra da edição atual (`SeasonWeekLock.forPlan`: na v1 só a
  concluída; no ajuste, também a corrente e a da prova) e as semanas seguintes com origem `COACH`.
  `AI_ACCEPTED` existe no enum, mas nenhum código a grava; é tratada como livre, igual ao `recalculate`
  (`SeasonPlanAdjustmentServiceImpl.java:216`).
- 422, sem mudar nenhuma semana, quando: a âncora não é de Base, Construção ou Pico; a âncora é descarga;
  a âncora fica com volume ou TSS zero; o pico é menor que o volume da âncora ou maior que 500; alguma
  semana calculada passa dos limites da edição (volume 500 km, TSS 3000); a prova mudou de data e o número
  de semanas não bate mais (mesma checagem e mensagem do `recalculate`,
  `SeasonPlanAdjustmentServiceImpl.java:182`). O pico é arredondado para uma casa.
- Sem migration.
- Log `season-plan.week-reanchored` com tenant, temporada, semana âncora, pico anterior e pico alcançado
  (maior volume gravado entre a âncora e as semanas de subida depois dela, antes e depois do
  recálculo; sem semana de subida depois, o volume da âncora), pico
  pedido e semanas regeneradas. O pico anterior mede quanto a proposta do motor errou. Os alertas já vão
  na resposta, pelo `SeasonPlanResponseMapper`.

### Frontend

- **O TSS acompanha o volume, à vista do treinador** (decisão do founder, 2026-11-25; na tela e não no
  backend, depois da revisão de produto). No `SeasonWeekEditDialog`, quando o treinador muda o volume e
  ainda não mexeu no campo TSS, o campo TSS é preenchido com
  `TSS original × volume novo / volume original`. Ele vê o número antes de salvar e pode trocar.
- **Só no ajuste.** A v1 (`PROPOSED` sem base) não tem tabela editável na tela (`SeasonTabPanel.tsx:135`
  só abre o ajuste de temporada `ACTIVE`). Na v1 o recálculo ancorado existe só pela API; a tela da v1
  segue com o recálculo por fases e a edição da partida.
- **Escolha no diálogo: "Só esta semana" (padrão) ou "Recalcular as semanas seguintes até a prova".** A
  segunda opção só aparece quando fase e descarga **no formulário** (o estado final, o mesmo que o
  backend valida) são Base, Construção ou Pico sem descarga.
- Sob cada opção, uma linha calculada da tabela, para o treinador decidir vendo a consequência:
  - "Só esta semana": "A semana 3 continua em 13,4 km" (o salto fica à vista);
  - "Recalcular": "Reescreve N semanas; M ficam como estão (editadas por você ou travadas). Fase e
    descarga não mudam."
- Escolhida a segunda, aparece o campo "Volume de pico (km)", com o pico atual ao lado ("hoje 16,2 km").
  Quando a edição sobe o volume, o campo vem pré-preenchido com
  `volume da última semana de subida × volume novo / volume original` (a curva sobe na proporção da
  edição); no caso real, 16,2 × 20 / 13 = 24,9 km. Quando a edição reduz o volume, o campo vem vazio:
  derrubar a temporada inteira precisa ser digitado.
- Depois de salvar, se o pico alcançado (maior volume entre a âncora e as semanas de subida depois dela, na
  resposta) ficar **0,5 km ou mais** abaixo do pedido, a tela avisa: "Pico pedido 30,0 km, alcançado
  26,4 km. O limite de rampa semanal ou uma semana editada por você segurou a curva." Abaixo de 0,5 km é
  arredondamento (pedido 24,2 dá 24,1) e não avisa. A conta é na tela, com o pico enviado e as semanas
  da resposta; o backend não ganha campo.
- O `SeasonAdjustTable` passa ao diálogo a lista de semanas, para as linhas de consequência (N e M saem
  de `locked` e `valueSource`) e para o pico atual e o sugerido.
- `SeasonPlan.ts` (`SeasonWeekUpdate`) e o adaptador `seasonWeekForm.ts` ganham o campo. Cliente curado à
  mão.
- Depois de salvar, a tabela mostra as semanas da resposta, como hoje.

### Fora de escopo

- Pico informado no `SeasonParametersForm` (recálculo desde a semana 1). O caminho único é a âncora.
- Piso de pico ou de longão por distância na geração inicial.
- Longão máximo informado (ver Riscos).
- Sugestão automática de ajuste quando o realizado supera o alvo (é o `add-season-plan-replanning`).
- Mudar fase, descarga ou marco das semanas seguintes: isso continua no recálculo por fases.

## Critérios de aceite

Semana âncora dos exemplos: semana 2 de 15, Base, 13,0 km e TSS 122; subida até a semana 13, descargas
nas semanas 4 e 8, Polimento na 14, prova na 15.

- **Dado** o diálogo dessa semana, **quando** o treinador digita volume 20,0, **então** o campo TSS mostra
  188 (122 × 20 / 13, arredondado) e é esse o valor enviado ao salvar.
- **Dado** o mesmo diálogo, **quando** o treinador digita TSS 150 e depois muda o volume, **então** o TSS
  continua 150.
- **Dado** uma semana sem TSS ou com volume zero, **quando** o treinador muda o volume, **então** o campo
  TSS não é preenchido sozinho.
- **Dado** a opção "Só esta semana", **quando** o treinador salva, **então** a requisição não leva
  `followingPeakVolumeKm` e só a semana editada muda.
- **Dado** a opção "Recalcular as semanas seguintes", volume 20,0 e última semana de subida em 16,2 km,
  **então** o campo de pico mostra 24,9.
- **Dado** a âncora em 20,0 km e TSS 188 e `followingPeakVolumeKm = 30`, **então** a semana 3 tem TSS 197
  e 21,0 km, a semana 4 (descarga) tem TSS 164 e 17,4 km, e a semana 13 tem TSS 282 e 30,0 km.
- **Dado** o mesmo recálculo, **então** a semana 1 e a âncora não mudam, e a semana 14 tem o TSS de 282
  reduzido pela mesma fração de Polimento de hoje.
- **Dado** a âncora com longão de 8,0 km, **então** a semana 13 tem longão de 12,0 km (40% de 30 km).
- **Dado** a semana 13 com origem `COACH` em 20,0 km e TSS 188, **então** ela não muda e o Polimento parte
  de 188.
- **Dado** uma âncora cujo recálculo levaria alguma semana acima de 500 km ou TSS 3000, **então** 422 e
  nenhuma semana muda.
- **Dado** a proposta v1 (sem ajuste), **quando** um `PATCH` ancora na semana corrente, **então** o
  recálculo é aceito e a semana da prova também é recalculada, como na edição atual da v1.
- **Dado** o mesmo recálculo, **então** fase, descarga e marco das semanas seguintes são os de antes.
- **Dado** um pico que exige mais que `MAX_TSS_RAMP_PER_WEEK` por semana, **então** a curva segue o teto e
  a última semana de subida fica abaixo do pedido.
- **Dado** uma semana seguinte com origem `COACH` ou travada, **então** ela não muda.
- **Dado** a âncora em Polimento, em descarga, ou com TSS zero, **quando** chega `followingPeakVolumeKm`,
  **então** 422 com mensagem e nenhuma semana muda, nem a âncora.
- **Dado** `followingPeakVolumeKm` menor que o volume da âncora, **então** 422 e nenhuma semana muda.
- **Dado** a mesma entrada da geração inicial, **então** `plan` devolve exatamente as semanas de hoje
  (teste com números fixos).
- **Dado** um ajuste aberto, **quando** o treinador ancora na próxima semana, **então** a semana corrente e
  a da prova não mudam.
- **Dado** `followingPeakVolumeKm` acima de 500, **então** 422 e nenhuma semana muda.
- **Dado** a prova remarcada e o número de semanas diferente do ciclo, **quando** chega
  `followingPeakVolumeKm`, **então** 422 com a mensagem do `recalculate` e nenhuma semana muda.
- **Dado** uma semana seguinte com TSS nulo, **então** o recálculo não quebra e ela é regravada.
- **Dado** a última semana de subida livre e em descarga, **então** o Polimento parte do TSS dela antes do
  fator de descarga, como no `gerar`.
- **Dado** o diálogo com fase Polimento ou descarga marcada no formulário, **então** a opção "Recalcular"
  não aparece.
- **Dado** a opção "Recalcular" e um pico menor que o volume digitado, **então** o botão salvar fica
  desabilitado com mensagem no campo.
- **Dado** a resposta com pico alcançado 26,4 e pedido 30,0, **então** a tela mostra o aviso; **dado**
  alcançado 24,1 e pedido 24,2, **então** não mostra.
- **Dado** a âncora como última semana de subida (20,0 km) e pico pedido 30, **então** só o Polimento e a
  semana da prova livres mudam (referência 188), o log registra pico alcançado 20,0 e a tela avisa.

## Open Questions & Assumptions

Premissas:

- O pico é informado em km. O treinador pensa em volume, não em TSS.
- A razão TSS por km da âncora vale para as semanas seguintes. Ela vem da edição do treinador, à vista
  dele no diálogo.
- A âncora segue a trava da edição atual (`SeasonWeekLock.forPlan`). No ajuste de uma temporada ativa,
  ela é futura; para subir a temporada no meio do ciclo, o treinador edita a próxima semana.
- Descargas marcadas nas semanas seguintes continuam onde estão; a cadência não é refeita.

Em aberto:

1. **Semana da prova.** No ajuste, é travada e fica com o alvo antigo, como no recálculo atual. O alvo antigo é mais
   baixo, então o teto fica conservador. Rever se o treinador reclamar.
2. **Alerta por sessão.** A literatura recente (Nielsen e colegas, BJSM 2025; citação de memória, a
   conferir) aponta risco no treino mais longo que o maior dos últimos 30 dias, mais que na soma semanal.
   O `SeasonPlanValidator` só olha a semana. Fica para quando houver longão informado.

## Riscos e mitigações

- **Pico alto demais para atleta em retorno.** O treinador decide e aprova com motivo. O motor semanal
  mantém cortes por lesão, por progressão e por teto de rampa (`7 × (CTL + 8)`).
- **Longão abaixo do que o treinador quer.** O longão segue a proporção da âncora, entre 28% e 50% do
  volume. Com âncora em 28%, o pico de 30 km dá 8,4 km para uma meia, contra 16 a 18 km que treinadores
  usam (revisão de produto, 2026-11-25). O treinador pode subir o longão da âncora no mesmo diálogo, e a
  proporção vai junto. Gatilho para a próxima change (longão máximo informado): treinadores editando o
  longão depois do recálculo ancorado.
- **A aprovação desfaz a âncora quando a semana vira antes de aprovar.** `SeasonPlanVersioning` recopia
  da temporada ativa toda semana que travou entre o ajuste e a aprovação. Ancorar no domingo e aprovar na
  segunda devolve a âncora aos valores antigos e deixa as seguintes recalculadas: 13 km, depois 21 km.
  Comportamento já existente para qualquer edição; aqui o efeito é maior. Fica registrado; a mitigação é
  ancorar e aprovar na mesma semana.
- **O recálculo por fases desfaz a curva ancorada.** Ele regenera as semanas `ENGINE` a partir da partida
  e preserva só a âncora (`COACH`), o que recria o dente de serra. Comportamento já existente do
  recálculo; o treinador que usar os dois deve ancorar de novo depois.
- **Treinador confunde exceção com novo patamar.** O padrão é "Só esta semana"; recalcular é escolha
  explícita, e o pico aparece antes de salvar.
- **Pico pedido diferente do alcançado.** A tabela mostra as semanas da resposta, e o log registra os dois.
- **Âncora com TSS incoerente.** A rampa herda a razão TSS por km da âncora. A tela escala o TSS com o
  volume, e a âncora com TSS zero é recusada.
- **Salto ao redor de semana `COACH` preservada.** A rampa conta a posição dela, mas não a regrava. O
  alerta `RAMP` do `SeasonPlanValidator` avisa.
- **Salto sem alerta depois de descarga.** O `SeasonPlanValidator` não alerta quando a semana anterior é
  descarga (pre-mortem do Codex, 2026-11-25). O teto de rampa limita a reta, não a volta da descarga: com
  pico muito alto, a semana depois da descarga pode subir quase 50% sobre ela. Comportamento já existente
  no `gerar`.
- **Regressão na geração inicial.** A função nova não toca `gerar`. Mesmo assim, teste com números fixos
  para `plan`.
- **Outro cliente da API edita volume sem TSS.** Só a tela escala. Hoje ela é o único cliente; se surgir
  outro, a regra sobe para o backend.
- **Rollback.** Campo opcional; sem ele o comportamento é o atual. Reverter é reverter os PRs. Um
  recálculo já gravado não tem desfazer: no ajuste, o caminho é descartar o ajuste; na v1 (só API), é
  recalcular por fases ou editar as semanas.

## Alternativas

- **Recalcular desde a semana 1 com pico informado** (versão anterior desta change). Rejeitada: com
  semanas passadas travadas, a primeira semana livre salta para a reta nova.
- **Cascata automática ao editar.** Rejeitada: a edição pode ser exceção, e só o treinador sabe.
- **Dois passos: salvar a semana e depois chamar o recálculo.** Rejeitada: se o segundo falha, fica o
  dente de serra gravado. Um campo no `PATCH` mantém tudo na mesma transação.
- **Só multiplicar as semanas seguintes pela razão da edição.** Rejeitada: não deixa o treinador escolher
  o pico, e a razão de uma semana não é a meta da temporada. A razão ficou como valor sugerido do pico.
- **Persistir o pico pedido em coluna.** Adiada: o log guarda o pedido e o alcançado; coluna só quando o
  `add-season-plan-replanning` precisar ler.
- Custo de LLM: nenhum, o motor é determinístico.

## Métrica de sucesso

Subir a curva de uma temporada em uma edição, em vez de uma edição por semana livre. Medidas, lidas dos
logs `season-plan.week-reanchored` e de edição de semana (`updateWeek`, que passa a logar temporada,
semana e `reanchored=true|false` numa linha só, para a contagem não depender de cruzar dois logs):

- % de edições de semana que pedem o recálculo das seguintes;
- % dessas aprovadas sem outra edição de semana depois, com alvo de 80%. Baseline: edições de semana por
  temporada aprovada antes da change, dos logs de edição existentes;
- razão pico pedido / pico anterior, e % de temporadas com recálculo ancorado na primeira semana
  editável. Se for alto, o conserto da causa é o piso de pico na geração (hoje fora de escopo), e esse é
  o gatilho para reabri-lo.

## Dependências e rollout

- Flag existente: `season-plan.enabled`.
- Backend primeiro; o front só envia o campo depois do backend em `develop`.
