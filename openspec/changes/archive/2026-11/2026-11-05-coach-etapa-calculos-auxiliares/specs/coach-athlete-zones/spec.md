## MODIFIED Requirements

### Requirement: Zona como seletor no editor de etapas
Nos dialogs de editar e adicionar treino, a intensidade de cada etapa SHALL ser escolhida por um
seletor de zona (Z1–Z6 e Personalizado). Escolher uma zona SHALL preencher `ritmoAlvo` e
`fcAlvoEtapa` com as faixas do atleta em formato canônico (`"M:SS-M:SS/km"`, `"NNN-NNN bpm"`) e
pré-preencher `alvoPrimario` por regra; o eixo SHALL ficar sempre visível e trocável pelo treinador,
em qualquer zona e em "Personalizado", e o editor não SHALL reaplicar o pré-preenchimento depois que o
treinador o alterou. Não SHALL existir campo de texto
livre de intensidade, nem por etapa nem no nível do treino; a zona do treino SHALL ser derivada das
etapas. Em "Personalizado", o seletor SHALL informar em que zona do atleta o valor digitado cai e por
qual eixo, sem alterar a escolha: escolher a zona continua sendo o clique no seletor.

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

#### Scenario: Zona sugerida no Personalizado
- **WHEN** a etapa está em "Personalizado" com pace `4:35/km` para atleta cuja Z5 vai de 4:30 a 4:45
- **THEN** o seletor mostra "Pace cai em Z5 para este atleta"; com só a FC `150-158 bpm`, mostra
  "FC cai em Z3 para este atleta"; com os dois eixos em zonas diferentes vale o `alvoPrimario`, e
  sem eixo nada é sugerido; valor fora de toda zona ou atleta sem zonas não sugere nada
