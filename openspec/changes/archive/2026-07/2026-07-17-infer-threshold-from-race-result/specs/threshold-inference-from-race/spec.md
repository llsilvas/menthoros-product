# Spec delta: threshold-inference-from-race

> Capability nova: deriva `paceLimiar` estimado do atleta a partir do resultado de uma prova real
> recente e válida, como segunda fonte com precedência sobre a inferência passiva por quintil já
> existente (`threshold-inference` — `ThresholdInferenceService.inferirPaceLimiar`). `fcLimiar`
> permanece exclusivamente na inferência por quintil. Formato: requirements com cenários BDD
> verificáveis.

## Requirement: Prova válida tem precedência sobre a inferência passiva por quintil
O sistema SHALL derivar `PlanoMetaDados.paceLimiarEstimado` a partir da prova realizada mais recente e válida do atleta quando ela existir, em vez da mediana do quintil mais rápido de treinos contínuos (`ThresholdInferenceService.inferirPaceLimiar`).

#### Scenario: Atleta com prova válida recente
- **WHEN** `TsbServiceImpl.atualizarLimiareInferidos` roda para um atleta com uma `Prova` com `foiRealizada=true`, `tempoRealizado` preenchido, distância resolvida entre 5000m e 21097m, e `dataProva` dentro dos últimos 90 dias
- **THEN** `paceLimiarEstimado` é calculado a partir dessa prova (fórmula de Riegel isolada + offset `+8s/km`), não do quintil

#### Scenario: Atleta sem prova válida (fallback preservado)
- **WHEN** o atleta não tem nenhuma `Prova` com `foiRealizada=true` dentro da janela de 90 dias e da faixa de distância válida
- **THEN** `paceLimiarEstimado` continua vindo de `inferirPaceLimiar` (quintil), comportamento idêntico ao anterior a esta change

## Requirement: Distância da prova é resolvida via `distanciaKm` OU o enum `DistanciaProva`
O sistema SHALL resolver a distância de uma `Prova` em metros considerando tanto o campo customizado `distanciaKm` quanto o enum obrigatório `distancia` (`DistanciaProva`), já que provas cadastradas pelo caminho padrão têm `distanciaKm = null`.

#### Scenario: Prova cadastrada pelo enum (caminho padrão)
- **WHEN** uma `Prova` tem `distancia = DistanciaProva.KM_21` e `distanciaKm = null`
- **THEN** a distância resolvida é 21097 metros e a prova é considerada válida para a faixa 5000-21097m

#### Scenario: Prova com distância customizada
- **WHEN** uma `Prova` tem `distanciaKm = 10.00` (preenchido, independente do valor de `distancia`)
- **THEN** a distância resolvida usa `distanciaKm` (10000 metros)

#### Scenario: Prova fora da faixa válida é ignorada
- **WHEN** a distância resolvida de uma `Prova` é menor que 5000m ou maior que 21097m
- **THEN** essa prova não é considerada pela inferência, mesmo que `foiRealizada=true` e dentro da janela de 90 dias

## Requirement: `fcLimiar` nunca é derivado de prova
O sistema SHALL manter `PlanoMetaDados.fcLimiarEstimado` vindo exclusivamente de `ThresholdInferenceService.inferirFcLimiar` (quintil), independentemente de existir uma prova válida para `paceLimiarEstimado`.

#### Scenario: Prova válida existe mas não afeta fcLimiar
- **WHEN** um atleta tem uma prova válida que altera `paceLimiarEstimado`
- **THEN** `fcLimiarEstimado` continua sendo calculado pelo quintil, sem nenhuma tentativa de correlação com a prova

## Requirement: Isolamento de tenant na busca de provas
O sistema SHALL restringir a busca de provas válidas ao tenant do atleta, via `Prova.assessoria`, nunca retornando provas de outro tenant mesmo com o mesmo `atletaId` por coincidência de dado corrompido.

#### Scenario: Prova de outro tenant nunca é considerada
- **WHEN** existe uma `Prova` válida com o `atletaId` correto mas `assessoria.id` de outro tenant
- **THEN** a query de busca não a retorna para o tenant corrente

## Requirement: Fonte do limiar é persistida e visível ao coach
O sistema SHALL persistir qual fonte gerou o `paceLimiarEstimado` atual (`PlanoMetaDados.fonteLimiarPace`: `PROVA_REGISTRADA` ou `MEDIA_TREINOS`) no momento do cálculo, e expor esse valor ao coach via `AtletaPerfilCoachOutputDto.fonteLimiarEstimado` sem recomputá-lo na leitura.

#### Scenario: Fonte persistida sobrevive a leituras posteriores
- **WHEN** `paceLimiarEstimado` foi calculado a partir de uma prova em um sync, e dias depois a prova sai da janela de 90 dias
- **THEN** o coach que abre o perfil do atleta nesse intervalo ainda vê `fonteLimiarEstimado = PROVA_REGISTRADA` (reflete o que gerou o valor salvo, não uma recomputação)

#### Scenario: Fonte atualiza no próximo recálculo
- **WHEN** um novo sync roda e a prova antes válida já não está mais dentro da janela de 90 dias
- **THEN** `paceLimiarEstimado` e `fonteLimiarPace` são recalculados via quintil, e `fonteLimiarEstimado` passa a retornar `MEDIA_TREINOS`
