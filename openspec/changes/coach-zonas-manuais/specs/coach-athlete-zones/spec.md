## ADDED Requirements

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
- **WHEN** o treinador grava um novo pace de limiar com o ritmo em `MANUAL`
- **THEN** o diálogo informa que as faixas manuais de ritmo continuam valendo e oferece "Recalcular a
  partir do limiar"; as faixas gravadas não mudam

#### Scenario: Faixa manual chega ao editor de etapas (E2E)
- **WHEN** o treinador muda o ritmo para manual, edita Z2 e salva
- **THEN** o card e o seletor de zona do editor de etapas mostram a Z2 editada
