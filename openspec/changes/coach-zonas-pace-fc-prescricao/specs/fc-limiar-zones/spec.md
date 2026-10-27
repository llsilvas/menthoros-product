# fc-limiar-zones (delta — MODIFIED)

## MODIFIED Requirements

### Requirement: Zonas de pace contíguas sobre o pace de limiar
O sistema SHALL calcular as 6 zonas de pace multiplicando `paceLimiar` pelos fatores
Z1 = 1,15–1,25 · Z2 = 1,05–1,15 · Z3 = 1,00–1,05 · Z4 = 0,95–1,00 · Z5 = 0,90–0,95 · Z6 = 0,82–0,90,
de modo que `paceMin(Zn) == paceMax(Zn+1)` para toda zona adjacente — sem sobreposição e sem buraco.
(Antes: Z3 = 0,98–1,05 e Z5 = 0,90–0,97, que se sobrepunham a Z4.)

#### Scenario: Faixas contíguas
- **WHEN** `calcularZonasPace(5.00)` é chamado
- **THEN** Z3 = 5:00–5:15, Z4 = 4:45–5:00, Z5 = 4:30–4:45, e para n = 1..5
  `paceMin(Zn) == paceMax(Zn+1)`

#### Scenario: Pace de limiar ausente é sentinela, não zona
- **WHEN** `calcularZonasPace` é chamado com `paceLimiar` nulo
- **THEN** o retorno `0.00–0.00` é documentado como sentinela "sem limiar"; consumidores que exibem
  zonas ao usuário SHALL testar o limiar antes de chamar e apresentar "indisponível"
