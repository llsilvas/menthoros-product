## ADDED Requirements

### Requirement: Duração da etapa com precisão de segundos

A etapa de um treino planejado SHALL aceitar e devolver `duracaoSeg` (segundos, inteiro positivo,
opcional) além de `duracaoMin`. Quando `duracaoSeg` é informado, o sistema SHALL derivar
`duracaoMin = round(duracaoSeg / 60)`, sem piso (etapa abaixo de 30 s grava `duracaoMin = 0`, que
os leitores em minutos tratam como ausente), e ignorar o `duracaoMin` enviado. Sem `duracaoSeg`,
`duracaoMin` SHALL ser gravado como hoje e `duracaoSeg` fica ausente.

#### Scenario: Etapa gravada em segundos
- **WHEN** o treinador salva uma etapa com `duracaoSeg: 250`
- **THEN** a etapa persiste `duracaoSeg = 250` e `duracaoMin = 4`, e o GET devolve os dois

#### Scenario: Cliente que só envia minutos
- **WHEN** a etapa chega só com `duracaoMin: 4`
- **THEN** `duracaoMin = 4` é gravado e `duracaoSeg` fica ausente

#### Scenario: Segundo e minuto incoerentes
- **WHEN** a etapa chega com `duracaoSeg: 250` e `duracaoMin: 7`
- **THEN** vale o segundo: `duracaoMin` gravado é 4

#### Scenario: Etapa abaixo de 30 segundos
- **WHEN** a etapa chega com `duracaoSeg: 10` e sem `duracaoMin`
- **THEN** grava `duracaoSeg = 10` e `duracaoMin = 0`; o relógio recebe 10 s e os leitores em
  minutos tratam a etapa como sem duração

### Requirement: Relógio recebe a duração exata

A conversão do treino para o intervals.icu SHALL usar `duracaoSeg` como duração do step quando
presente e `duracaoMin × 60` caso contrário.

#### Scenario: Etapa com segundos
- **WHEN** uma etapa sem distância tem `duracaoSeg: 250`
- **THEN** o step convertido tem `duration: 250`

#### Scenario: Etapa só com minutos
- **WHEN** uma etapa sem distância tem só `duracaoMin: 4`
- **THEN** o step convertido tem `duration: 240`

### Requirement: Editor de etapas em minutos e segundos

O editor de etapas SHALL apresentar a duração em `m:ss`, aceitar `m` como `m:00` e `h:mm:ss`,
normalizar no blur e **bloquear o salvar** com texto inválido. Ao salvar, SHALL enviar
`duracaoSeg` e o `duracaoMin` derivado.

#### Scenario: Digitação em m:ss
- **WHEN** o treinador digita `4:10` na duração
- **THEN** o campo mostra `4:10` e o PATCH leva `duracaoSeg: 250` e `duracaoMin: 4`

#### Scenario: Minuto inteiro
- **WHEN** o treinador digita `4`
- **THEN** o campo normaliza para `4:00` e o PATCH leva `duracaoSeg: 240`

#### Scenario: Etapa carregada do backend
- **WHEN** a etapa chega com `duracaoSeg: 250`
- **THEN** o editor mostra `4:10`; com só `duracaoMin: 4`, mostra `4:00`

#### Scenario: Duração inválida
- **WHEN** o campo contém `abc` e o treinador tenta salvar
- **THEN** o campo mostra erro, o salvar é bloqueado e nenhum PATCH é enviado

### Requirement: Derivação entre distância, duração e pace

O editor SHALL derivar o campo ausente ou já derivado entre distância, duração e pace, com a
regra "último editado manda": editar duração recalcula a distância só se ela é derivada ou vazia;
editar distância recalcula a duração só se ela é derivada ou vazia; mudar pace ou zona recalcula
só o campo marcado como derivado. Um valor digitado pelo treinador MUST NOT ser sobrescrito. O
campo derivado SHALL ser indicado visualmente e MUST NOT ser enviado ao backend: o payload leva
só as medidas digitadas.

#### Scenario: Duração derivada
- **WHEN** a duração está vazia e o treinador informa `1` km e pace `4:10/km`
- **THEN** a duração mostra `4:10` e fica marcada como derivada

#### Scenario: Distância derivada
- **WHEN** a distância está vazia e o treinador informa `4:10` e pace `4:10/km`
- **THEN** a distância mostra `1` e fica marcada como derivada

#### Scenario: Pace muda com um campo derivado
- **WHEN** a duração é derivada e o pace passa de `4:10/km` para `5:00/km`
- **THEN** só a duração muda (`5:00`); a distância continua `1`

#### Scenario: Valor digitado vence
- **WHEN** o treinador digita a duração numa etapa cuja duração era derivada da distância digitada
- **THEN** a duração deixa de ser derivada e a distância digitada não muda

#### Scenario: Derivado fica fora do payload
- **WHEN** a etapa tem distância `1` digitada e duração `4:10` derivada, e o treinador salva
- **THEN** o PATCH leva `distanciaKm: 1` e nenhuma duração; ao reabrir, o editor mostra `4:10` como derivada
