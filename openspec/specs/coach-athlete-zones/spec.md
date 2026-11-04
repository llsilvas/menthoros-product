### Requirement: Zonas de treino do atleta expostas ao treinador
O sistema SHALL expor `GET /api/v1/coach/atletas/{atletaId}/zonas` devolvendo as seis zonas de
treino do atleta (Z1–Z6) com faixa de pace (segundos/km, inteiros) e faixa de FC (bpm), as âncoras
(`paceLimiarMinKm`, `fcLimiar`, datas dos últimos testes, `fcLimiarEstimada`), o ajuste por fadiga
aplicado ao pace (`segundosPorKm`, `tsbProntidao`) e a disponibilidade de cada eixo. As faixas SHALL
ser as faixas base que `ZonaTreinoService` produz para o prompt — o endpoint não SHALL reimplementar o
cálculo. O ajuste por fadiga SHALL ser informativo e separado das faixas.

#### Scenario: Atleta com limiares completos
- **WHEN** o treinador consulta as zonas de um atleta com `paceLimiar = 5.00` e `fcLimiar = 168`
- **THEN** Z2 devolve `pace = 315–345 s/km` (5:15–5:45) e `fc = 143–150`; Z6 devolve pace
  `246–270 s/km` e `fc` ausente com `motivoFc = FC_NAO_ESTABILIZA`

#### Scenario: Ajuste por fadiga
- **WHEN** o TSB de prontidão do atleta hoje é −12
- **THEN** as faixas de `zonas[].pace` permanecem as **base** (Z2 continua `315–345 s/km` para
  `paceLimiar = 5.00`) e o corpo declara `ajusteFadiga = { segundosPorKm: 7, tsbProntidao: -12 }`;
  com TSB ≥ 0, `segundosPorKm = 0`

#### Scenario: Atleta sem pace de limiar
- **WHEN** o atleta não tem `paceLimiar` (nulo ou ≤ 0)
- **THEN** todas as zonas vêm com `pace` ausente, `disponibilidade.pace = false` e
  `disponibilidade.motivoPace = SEM_PACE_LIMIAR`; nenhuma faixa `0:00–0:00` nem o fallback sintético
  do push é devolvido

#### Scenario: FC acima da máxima do atleta
- **WHEN** a zona escolhida tem FC acima de `fcMaxima.bpm` (ex.: Z5 168–178 com máxima 175)
- **THEN** o editor avisa que a FC não vai ao relógio (o push a descarta); salvar continua permitido

#### Scenario: FC de limiar estimada
- **WHEN** o atleta não tem `fcLimiar` informado e o valor vem do fallback etário
- **THEN** as zonas de FC são devolvidas e `ancoras.fcLimiarEstimada = true`

#### Scenario: Atleta de outro tenant
- **WHEN** o treinador consulta um `atletaId` que existe em outro tenant
- **THEN** o endpoint responde `404`

### Requirement: Tabela de zonas visível na revisão e na edição do plano
O front SHALL exibir, no painel de revisão do plano e nos dialogs de editar/adicionar treino, uma
seção recolhível "Zonas do atleta" com as seis zonas (pace, FC, RPE típico como referência genérica
com tooltip, uso típico), as âncoras com datas e origem, o chip de
ajuste por fadiga quando `segundosPorKm > 0` e aviso quando o último teste de limiar tem mais de
90 dias. Estados de carregamento, erro e eixo indisponível SHALL ser explícitos.

#### Scenario: Plano em revisão
- **WHEN** o treinador abre um plano em `AGUARDANDO_REVISAO`
- **THEN** a seção existe, recolhida, e ao expandir mostra as seis linhas com os valores do endpoint

#### Scenario: Sem pace de limiar
- **WHEN** o atleta não tem `paceLimiar`
- **THEN** a coluna de pace mostra "Ritmo não cadastrado"; quando o host permite edição, o texto é um
  link que abre o diálogo de cadastro na aba "Zonas de Ritmo"; a coluna de FC segue preenchida

### Requirement: Cards do plano mostram a zona com o valor
Cada card de treino planejado (painel de revisão e plano vigente) SHALL mostrar, por etapa
principal, a zona e as faixas resolvidas (`Zn · pace · fc`), com o eixo `alvoPrimario` em destaque.
Quando um eixo não está disponível para o atleta, o card SHALL omiti-lo e sinalizar, nunca inventar
um valor.

#### Scenario: Etapa com os dois eixos
- **WHEN** a etapa tem `fcAlvoEtapa = "143-150 bpm"`, `ritmoAlvo = "5:15-5:45/km"` e
  `alvoPrimario = FC`
- **THEN** o card mostra `Z2 · 5:15–5:45 · 143–150 bpm` com a FC em destaque

#### Scenario: Atleta sem pace
- **WHEN** o atleta não tem `paceLimiar`
- **THEN** o card mostra só a FC e "pace indisponível"; se a etapa tem `ritmoAlvo` persistido, o
  valor é exibido como está e não há aviso

### Requirement: Zona como seletor no editor de etapas
Nos dialogs de editar e adicionar treino, a intensidade de cada etapa SHALL ser escolhida por um
seletor de zona (Z1–Z6 e Personalizado). Escolher uma zona SHALL preencher `ritmoAlvo` e
`fcAlvoEtapa` com as faixas do atleta em formato canônico (`"M:SS-M:SS/km"`, `"NNN-NNN bpm"`) e
pré-preencher `alvoPrimario` por regra; o eixo SHALL ficar sempre visível e trocável pelo treinador,
em qualquer zona e em "Personalizado", e o editor não SHALL reaplicar o pré-preenchimento depois que o
treinador o alterou. Não SHALL existir campo de texto
livre de intensidade, nem por etapa nem no nível do treino; a zona do treino SHALL ser derivada das
etapas.

#### Scenario: Escolher Z5 em etapa INTERVALADO
- **WHEN** o treinador escolhe Z5 numa etapa `INTERVALADO` de atleta com `paceLimiar = 5.00`,
  `fcLimiar = 168` medido e TSB de prontidão ≥ 0
- **THEN** `ritmoAlvo = "4:30-4:45/km"` (0,90–0,95 × 5:00, faixa base), `fcAlvoEtapa =
  "168-178 bpm"`, `alvoPrimario = PACE`, e os dois valores aparecem na etapa com o pace em destaque

#### Scenario: Ajuste por fadiga não é somado ao preencher
- **WHEN** o mesmo atleta tem TSB de prontidão −12 (`ajusteFadiga.segundosPorKm = 7`) e o treinador
  escolhe Z5
- **THEN** `ritmoAlvo` continua `"4:30-4:45/km"`; o chip "hoje +7 s/km" é só informativo

#### Scenario: FC de limiar estimada não vira alvo
- **WHEN** o treinador escolhe uma zona para atleta com `fcLimiarEstimada = true`
- **THEN** só `ritmoAlvo` é preenchido, `fcAlvoEtapa` fica vazio com aviso de limiar estimado, e
  `alvoPrimario = PACE`; o treinador pode digitar a FC à mão (vira "Personalizado")

#### Scenario: Treinador troca o eixo
- **WHEN** o treinador troca o eixo de PACE para FC numa etapa Z5 e depois muda a zona para Z4
- **THEN** `alvoPrimario` permanece FC — a escolha dele prevalece sobre a regra

#### Scenario: Editar o valor à mão
- **WHEN** o treinador altera o pace preenchido pela zona
- **THEN** o seletor passa a "Personalizado" e a FC preenchida é mantida

#### Scenario: Sem objetivo
- **WHEN** o treinador limpa pace e FC
- **THEN** a etapa salva com `alvoPrimario = NENHUM`, distinguível de etapa legada sem o campo

#### Scenario: Z6 sem FC
- **WHEN** o treinador escolhe Z6
- **THEN** só `ritmoAlvo` é preenchido e `alvoPrimario = PACE`; o toggle de eixo fica desabilitado
  com a explicação "Z6 não tem alvo de FC" — único caso em que o treinador não escolhe

#### Scenario: Atleta sem pace de limiar
- **WHEN** o treinador escolhe uma zona para atleta sem `paceLimiar`
- **THEN** só `fcAlvoEtapa` é preenchido, `alvoPrimario = FC`, e aparece aviso "sem pace de limiar"
  (sem link — o cadastro de limiar está fora desta change)

#### Scenario: Z6 sem pace de limiar
- **WHEN** o treinador escolhe Z6 para atleta sem `paceLimiar`
- **THEN** nenhum valor é preenchido, `alvoPrimario = NENHUM` e o editor explica "Z6 precisa do pace
  de limiar do atleta"; salvar continua permitido

#### Scenario: Limpar um eixo
- **WHEN** a etapa tem pace e FC, `alvoPrimario = PACE`, e o treinador limpa o pace
- **THEN** `alvoPrimario` passa a FC (o que sobrou); se limpar também a FC, `alvoPrimario = NENHUM`

#### Scenario: Legado não parseável
- **WHEN** uma etapa com `fcAlvoEtapa = "trote leve"` é aberta
- **THEN** o seletor mostra "Personalizado" com o texto preservado e aviso de que não vira alvo no
  relógio; salvar sem alterar não modifica o campo

#### Scenario: Pace e FC em zonas diferentes
- **WHEN** o treinador informa pace que cai em Z5 e FC que cai em Z2 para o atleta
- **THEN** aparece aviso de divergência e salvar continua permitido

### Requirement: `alvoPrimario` persistido por etapa
A etapa de treino planejado SHALL carregar `alvoPrimario ∈ {PACE, FC, NENHUM}`, opcional. Quando
presente, o push para o relógio e `GET /me/treinos/hoje` SHALL obedecê-lo; quando ausente (legado),
SHALL manter a derivação atual (FC vence se os dois existem).

#### Scenario: PACE com FC preenchida
- **WHEN** a etapa tem `fcAlvoEtapa` e `ritmoAlvo` e `alvoPrimario = PACE`
- **THEN** o push emite alvo de ritmo e a FC vai como texto secundário

#### Scenario: Legado sem o campo
- **WHEN** a etapa tem os dois alvos e `alvoPrimario` nulo
- **THEN** o push emite FC, como antes desta change

#### Scenario: NENHUM explícito vence texto presente
- **WHEN** a etapa tem `fcAlvoEtapa` e `ritmoAlvo` preenchidos e `alvoPrimario = NENHUM`
- **THEN** nem o push nem `/me/treinos/hoje` emitem alvo; `alvoPrimario` da resposta é `NENHUM`

#### Scenario: NULL sem nenhum alvo
- **WHEN** a etapa não tem `fcAlvoEtapa`, nem `ritmoAlvo`, e `alvoPrimario` é nulo
- **THEN** resolve para `NENHUM` por derivação, igual a hoje

#### Scenario: Eixo escolhido sem valor
- **WHEN** `alvoPrimario = PACE` e `ritmoAlvo` está vazio
- **THEN** resolve como `NENHUM` — não inventa alvo, não cai para a FC

#### Scenario: Etapas iguais com eixos diferentes
- **WHEN** duas etapas consecutivas têm mesmo tipo, duração, distância, pace e FC, mas
  `alvoPrimario` diferente
- **THEN** não são agrupadas como repetição de um mesmo bloco, no push nem no editor

### Requirement: Treinador cadastra as âncoras das zonas do atleta
O sistema SHALL expor `PUT /api/v1/coach/atletas/{atletaId}/zonas/ancoras` para o treinador gravar as
âncoras de FC (limiar, máxima, data do teste, origem) e/ou de pace (limiar em segundos/km, data do
teste, origem). Grupo ausente SHALL manter os valores atuais daquele eixo. O grupo de FC SHALL exigir
o limiar; a máxima é opcional (vazia mantém a vigente). A máxima informada ou, se vazia, a gravada
SHALL ser no mínimo o topo da Z5 (`round(limiar × 1,06)`); máxima estimada SHALL NOT bloquear o
salvamento. Os limites aceitos SHALL ser os mesmos das restrições do banco. A resposta SHALL ser a mesma tabela de zonas
do `GET .../zonas`, recalculada. Acesso restrito a `TECNICO`/`ADMIN`; atleta de outro tenant responde `404`.

#### Scenario: Cadastrar pace de limiar
- **WHEN** o treinador envia `pace = { limiarSegKm: 290, dataTeste: "2026-10-12", origem: "TESTE_CAMPO" }`
  para um atleta sem `paceLimiar`
- **THEN** a resposta traz `disponibilidade.pace = true`, `ancoras.fonteLimiarPace = TESTE_CAMPO` e as
  seis zonas com `pace` calculado por `ZonaTreinoService`

#### Scenario: Só um eixo
- **WHEN** o corpo traz só o grupo `pace`
- **THEN** `fcLimiar`, `fcMaxima`, data e origem de FC permanecem como estavam

#### Scenario: FC máxima abaixo do topo da Z5
- **WHEN** `fc.maxima = 169` e `fc.limiar = 168`
- **THEN** a resposta é `400` apontando `fc.maxima` (mínimo 178) e nada é gravado

#### Scenario: Máxima estimada não bloqueia
- **WHEN** o atleta não tem `fc_maxima` gravada nem data de nascimento e o treinador envia só
  `fc.limiar = 185`
- **THEN** a resposta é `200` e `fcMaxima.estimada` continua `true`

#### Scenario: Atleta de outro tenant
- **WHEN** o `atletaId` pertence a outro tenant
- **THEN** o PUT e a simulação respondem `404`; perfil sem `TECNICO`/`ADMIN` recebe `403`

#### Scenario: Reenvio ao intervals.icu
- **WHEN** o treinador salva o grupo `fc` de um atleta com intervals.icu conectado e o intervals.icu falha
- **THEN** a resposta continua `200` e os valores ficam gravados; a falha só gera log

### Requirement: Simulação das zonas sem persistir
O sistema SHALL expor `POST /api/v1/coach/atletas/{atletaId}/zonas/simulacao`, com o mesmo corpo do
cadastro, devolvendo as zonas que aquelas âncoras gerariam, sem alterar o atleta. O front SHALL usar
este endpoint para a prévia e não SHALL reimplementar o cálculo das zonas.

#### Scenario: Simular não grava
- **WHEN** o treinador simula `pace.limiarSegKm = 290` e em seguida consulta `GET .../zonas`
- **THEN** o GET devolve os mesmos valores de antes da simulação

### Requirement: Diálogo de cadastro de zonas a partir do card
O card "Zonas do atleta" SHALL oferecer "Editar zonas" quando o host permitir edição, abrindo um
diálogo com abas "Zonas de FC" e "Zonas de Ritmo", campos de âncora, prévia das seis zonas vinda da
simulação e o aviso "Os próximos planos usam estes valores. Treinos já criados com alvo em bpm ou
ritmo fixo não mudam." Salvar SHALL atualizar, sem recarregar a página, todos os consumidores das
zonas do mesmo atleta que estiverem montados.

#### Scenario: Consumidores atualizados
- **WHEN** `PlanoDetalhePanel` e `CurrentWeekPlan` do mesmo atleta estão montados e o treinador salva
  no diálogo
- **THEN** o card e o seletor de zona passam a usar as novas faixas, e uma resposta mais antiga que
  chegue depois é descartada

#### Scenario: FC estimada
- **WHEN** `ancoras.fcLimiarEstimada = true`
- **THEN** o card continua mostrando a tabela de FC, com selo "estimada" e o CTA "Cadastrar limiar de FC"

#### Scenario: FC máxima estimada não é promovida
- **WHEN** o treinador salva só `fc.limiar` e a máxima vigente é estimada
- **THEN** `fcMaxima.estimada` continua `true`

#### Scenario: Âncora inválida no diálogo
- **WHEN** o treinador digita `fc.maxima` menor que o limiar
- **THEN** o campo mostra o erro, a prévia daquele eixo some e "Salvar zonas" fica desabilitado

### Requirement: Modo de zonas por eixo
Cada atleta SHALL ter, por eixo (FC e pace) e de forma independente, um modo de zonas: `LIMIAR`
(padrão — faixas calculadas a partir do limiar, como hoje) ou `MANUAL` (faixas De/Até gravadas pelo
treinador). Com o eixo em `MANUAL`, `ZonaTreinoService` SHALL devolver as faixas gravadas a todos os
consumidores de faixa de zona: prompt da IA, `ZoneResolver`/`SessionResolver`, alvo de zona do push
ao intervals.icu, validação de FC do plano, distribuição por zona do progresso e `GET .../zonas`.
O modo manual SHALL trocar só as faixas de zona — `paceLimiar` e `fcLimiar` escalares continuam
alimentando rTSS/TRIMP, estimativas de distância e a sincronização de `lthr`.

#### Scenario: FC manual chega ao prompt, ao resolver e ao push
- **WHEN** o eixo FC do atleta está em `MANUAL` com Z2 = 140–150 bpm e `fcLimiar = 168`
- **THEN** o prompt da IA lista Z2 como 140–150 bpm, `ZoneResolver.bpm(Z2)` devolve 140–150 e o alvo
  `Z2` do push ao intervals.icu vira 140–150 bpm — nenhum deles usa o Friel (143–150)

#### Scenario: FC manual sem limiar medido no push
- **WHEN** o eixo FC está em `MANUAL` e o atleta não tem `fcLimiar` gravado
- **THEN** o alvo `Z3` do push resolve para a faixa manual de Z3, sem descarte; um alvo percentual
  (`90-95%`) continua descartado por falta de limiar medido

#### Scenario: FC manual acima da máxima no push
- **WHEN** a Z5 manual vai até 195 bpm e a FC máxima do atleta é 188
- **THEN** o alvo `Z5` do push é descartado e registrado, como um bpm literal acima da máxima

#### Scenario: Valor numa lacuna entre zonas manuais
- **WHEN** Z2 termina em 150, Z3 começa em 153 e uma etapa tem FC média 152
- **THEN** a etapa é classificada como Z2; com FC 150 em borda compartilhada (Z2 até 150, Z3 a partir
  de 150), é Z3

#### Scenario: Eixos independentes
- **WHEN** o pace está em `MANUAL` e a FC em `LIMIAR`
- **THEN** as faixas de pace são as gravadas e as de FC as do cálculo pelo LTHR

#### Scenario: Voltar ao limiar
- **WHEN** o treinador grava o eixo pace como `LIMIAR` depois de tê-lo em `MANUAL`
- **THEN** todos os consumidores voltam ao cálculo pelo `paceLimiar` e as faixas manuais de pace são
  apagadas

### Requirement: Gravação das faixas manuais
O sistema SHALL expor `PUT /api/v1/coach/atletas/{atletaId}/zonas/manuais`, restrito a
`TECNICO`/`ADMIN`, com um grupo opcional por eixo (`fc`, `pace`), cada um com `modo` e, em `MANUAL`,
`faixas` (`zona`, `min`, `max` inteiros; FC em bpm Z1–Z5, pace em s/km Z1–Z6, `min` = limite mais
rápido). Grupo ausente SHALL manter o eixo. A resposta SHALL ser a mesma do `GET .../zonas`.
O sistema SHALL rejeitar com `400` e o caminho do campo (`fc.faixas[1].max`): zona faltando ou
repetida, `min ≥ max`, valor fora de 40–230 bpm ou 120–900 s/km, e sobreposição ou ordem invertida
entre zonas vizinhas. `faixas` SHALL vir ordenada por zona, e o índice do caminho é o índice do
array. Borda compartilhada e lacuna entre zonas SHALL ser aceitas.

#### Scenario: Faixas sobrepostas
- **WHEN** o treinador envia FC manual com Z2 = 140–152 e Z3 = 150–160
- **THEN** o PUT responde `400` com `fields["fc.faixas[2].min"]` e nada é gravado

#### Scenario: Lacuna aceita
- **WHEN** Z2 termina em 150 e Z3 começa em 153
- **THEN** o PUT responde `200` e grava as faixas como enviadas

#### Scenario: Atleta de outro tenant
- **WHEN** o `atletaId` pertence a outro tenant
- **THEN** o PUT responde `404`

### Requirement: Modo exposto e editável pelo treinador
`GET .../zonas` SHALL incluir `modos.fc` e `modos.pace`, e `zonas[]` SHALL trazer a faixa efetiva de
cada eixo; com pace em `MANUAL`, `disponibilidade.pace` SHALL ser `true` mesmo sem `paceLimiar`. O
diálogo de zonas SHALL oferecer, por aba, "Calcular pelo limiar / Informar manualmente"; o modo
manual SHALL começar com as faixas efetivas, validar as regras do PUT antes de salvar (zona inválida
marcada com `aria-invalid` e texto na linha) e oferecer "Recalcular a partir do limiar" com
confirmação. O card SHALL mostrar o modo de cada eixo.

#### Scenario: Recalcular sem pace de limiar
- **WHEN** o ritmo está em `MANUAL` e o atleta não tem `paceLimiar`
- **THEN** `zonas[].pacePeloLimiar` vem ausente e "Recalcular a partir do limiar" fica desabilitado no
  ritmo com o texto "Sem pace de limiar"

#### Scenario: FC manual no seletor de zona sem limiar medido
- **WHEN** a FC está em `MANUAL` e `ancoras.fcLimiarEstimada = true`
- **THEN** escolher `Z2` no editor de etapas preenche a FC com a faixa manual de Z2

#### Scenario: Card mostra o modo
- **WHEN** a FC está em `LIMIAR` e o pace em `MANUAL`
- **THEN** o card mostra "FC: pelo limiar · Ritmo: manual"

#### Scenario: Erro antes de salvar
- **WHEN** o treinador digita Z3 de ritmo com De mais lento que Até
- **THEN** a linha Z3 fica com `aria-invalid` e mensagem, e "Salvar" fica desabilitado

#### Scenario: Limiar novo com eixo manual
- **WHEN** o treinador altera o pace de limiar no diálogo com o ritmo em `MANUAL`
- **THEN** o diálogo informa, antes de salvar, que as faixas manuais de ritmo continuam valendo e
  aponta "Recalcular a partir do limiar"; salvar só o limiar não muda as faixas gravadas

#### Scenario: Faixa manual chega ao editor de etapas (E2E)
- **WHEN** o treinador muda o ritmo para manual, edita Z2 e salva
- **THEN** o card e o seletor de zona do editor de etapas mostram a Z2 editada
