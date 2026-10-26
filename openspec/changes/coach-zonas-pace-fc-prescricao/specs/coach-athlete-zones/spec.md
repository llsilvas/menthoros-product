# coach-athlete-zones (delta — ADDED)

## ADDED Requirements

### Requirement: Zonas de treino do atleta expostas ao treinador
O sistema SHALL expor `GET /api/v1/coach/atletas/{atletaId}/zonas` devolvendo as seis zonas de
treino do atleta (Z1–Z6) com faixa de pace (segundos/km, inteiros) e faixa de FC (bpm), as âncoras
(`paceLimiarMinKm`, `fcLimiar`, datas dos últimos testes, `fcLimiarEstimada`), o ajuste por fadiga
aplicado ao pace (`segundosPorKm`, `tsbProntidao`) e a disponibilidade de cada eixo. As faixas SHALL
ser as mesmas que `ZonaTreinoService` e `PaceZoneCalculator` produzem para o prompt e para o push —
o endpoint não SHALL reimplementar o cálculo.

#### Scenario: Atleta com limiares completos
- **WHEN** o treinador consulta as zonas de um atleta com `paceLimiar = 5.00` e `fcLimiar = 168`
- **THEN** Z2 devolve `pace = 322–352 s/km` (5:22–5:52) e `fc = 143–150`; Z6 devolve pace
  `253–277 s/km` e `fc` ausente com `motivoFc = FC_NAO_ESTABILIZA`

#### Scenario: Ajuste por fadiga
- **WHEN** o TSB de prontidão do atleta hoje é −12
- **THEN** todas as faixas de pace vêm acrescidas de 7 s/km e o corpo declara
  `ajusteFadiga = { segundosPorKm: 7, tsbProntidao: -12 }`; com TSB ≥ 0, `segundosPorKm = 0`

#### Scenario: Atleta sem pace de limiar
- **WHEN** o atleta não tem `paceLimiar` (nulo ou ≤ 0)
- **THEN** todas as zonas vêm com `pace` ausente, `disponibilidade.pace = false` e
  `disponibilidade.motivoPace = SEM_PACE_LIMIAR`; nenhuma faixa `0:00–0:00` nem o fallback sintético
  do push é devolvido

#### Scenario: FC de limiar estimada
- **WHEN** o atleta não tem `fcLimiar` informado e o valor vem do fallback etário
- **THEN** as zonas de FC são devolvidas e `ancoras.fcLimiarEstimada = true`

#### Scenario: Atleta de outro tenant
- **WHEN** o treinador consulta um `atletaId` que existe em outro tenant
- **THEN** o endpoint responde `404`

### Requirement: Tabela de zonas visível na revisão e na edição do plano
O front SHALL exibir, no painel de revisão do plano e nos dialogs de editar/adicionar treino, uma
seção recolhível "Zonas do atleta" com as seis zonas (pace, FC, RPE típico como referência genérica
com tooltip, uso típico), as âncoras com datas, o chip de
ajuste por fadiga quando `segundosPorKm > 0` e aviso quando o último teste de limiar tem mais de
90 dias. Estados de carregamento, erro e eixo indisponível SHALL ser explícitos.

#### Scenario: Plano em revisão
- **WHEN** o treinador abre um plano em `AGUARDANDO_REVISAO`
- **THEN** a seção existe, recolhida, e ao expandir mostra as seis linhas com os valores do endpoint

#### Scenario: Sem pace de limiar
- **WHEN** o atleta não tem `paceLimiar`
- **THEN** a coluna de pace mostra "indisponível" com link para informar o limiar; a coluna de FC
  segue preenchida

### Requirement: Cards do plano mostram a zona com o valor
Cada card de treino planejado (painel de revisão e plano vigente) SHALL mostrar, por etapa
principal, a zona e as faixas resolvidas (`Zn · pace · fc`), com o eixo `alvoPrimario` em destaque.
Quando um eixo não está disponível para o atleta, o card SHALL omiti-lo e sinalizar, nunca inventar
um valor.

#### Scenario: Etapa com os dois eixos
- **WHEN** a etapa tem `fcAlvoEtapa = "143-150 bpm"`, `ritmoAlvo = "5:22-5:52/km"` e
  `alvoPrimario = FC`
- **THEN** o card mostra `Z2 · 5:22–5:52 · 143–150 bpm` com a FC em destaque

#### Scenario: Atleta sem pace
- **WHEN** o atleta não tem `paceLimiar`
- **THEN** o card mostra só a FC e "pace indisponível"

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
- **WHEN** o treinador escolhe Z5 numa etapa `INTERVALADO` de atleta com `paceLimiar = 5.00` e
  `fcLimiar = 168`
- **THEN** `ritmoAlvo = "4:37-4:58/km"` (já com o ajuste por fadiga vigente), `fcAlvoEtapa =
  "168-178 bpm"`, `alvoPrimario = PACE`, e os dois valores aparecem na etapa com o pace em destaque

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
- **THEN** só `fcAlvoEtapa` é preenchido, `alvoPrimario = FC`, e aparece link para informar o limiar

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
