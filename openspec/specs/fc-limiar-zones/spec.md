### Requirement: Zonas de FC calculadas com base em FC Limiar (LTHR)
O sistema SHALL calcular as 5 zonas de frequência cardíaca usando `fcLimiar` do atleta como única âncora fisiológica, aplicando os percentuais do modelo LTHR (Friel): Z1=75–85%, Z2=85–89%, Z3=89–94%, Z4=94–100%, Z5=100–106%.

#### Scenario: Atleta com fcLimiar definido
- **WHEN** `ZonaTreinoService.calcularZonasFC()` é chamado com um atleta com `fcLimiar = 160 bpm`
- **THEN** Z1 retorna `fcMin=120, fcMax=136` (75–85% de 160), Z2 retorna `136–142`, Z3 retorna `142–150`, Z4 retorna `150–160`, Z5 retorna `160–170`

#### Scenario: Atleta sem fcLimiar (fallback automático)
- **WHEN** `calcularZonasFC()` é chamado para atleta sem `fcLimiar` explícito
- **THEN** o sistema usa `getFcLimiarCalculada()` (85% da FCmax calculada) como base e retorna zonas válidas (sem NullPointerException)

### Requirement: Zonas em bpm absolutos enviadas ao prompt
O sistema SHALL incluir no prompt gerado pelo `PlanoTreinoPromptBuilder`, para cada zona Z1–Z5, os limites em bpm absolutos calculados com base em `fcLimiar`, junto com a FC limiar usada como referência.

#### Scenario: Prompt contém zonas em bpm absolutos
- **WHEN** `buildOptimizedPrompt()` é chamado com um atleta com `fcLimiar = 160 bpm`
- **THEN** a seção de dados fisiológicos do prompt inclui a FC limiar como referência e os limites bpm de cada zona (ex: `Z1 (Recuperação): 120–136 bpm`)

#### Scenario: Prompt indica fallback quando fcLimiar não foi testado
- **WHEN** `buildOptimizedPrompt()` é chamado com atleta sem `dataUltimoTesteFc`
- **THEN** o prompt inclui aviso de que o fcLimiar é estimado e recomenda teste de limiar

### Requirement: Schema JSON de fcAlvoEtapa aceita range em bpm absoluto
O schema JSON enviado ao OpenAI SHALL aceitar para o campo `fcAlvoEtapa` o formato `"NNN-NNN bpm"` (ex: `"140-160 bpm"`), em vez do formato percentual `"% FCmax"`.

#### Scenario: Schema valida formato bpm correto
- **WHEN** o OpenAI retorna `fcAlvoEtapa = "150-160 bpm"`
- **THEN** o schema JSON não rejeita o valor (pattern match bem-sucedido)

#### Scenario: Schema rejeita formato percentual antigo
- **WHEN** o OpenAI retorna `fcAlvoEtapa = "88-95% FCmax"`
- **THEN** o valor não satisfaz o novo pattern e a validação pós-geração o corrige

### Requirement: Validação pós-geração de FC por zona
O sistema SHALL verificar, após o retorno do LLM, se o `fcAlvoEtapa` de cada etapa está dentro dos limites fisiológicos esperados para o tipo da etapa, com base nas zonas calculadas do atleta. Em caso de divergência, o sistema SHALL corrigir automaticamente o valor para o centro da zona esperada e registrar um log de `WARN`.

#### Scenario: FC dentro da zona esperada — sem correção
- **WHEN** uma etapa `AQUECIMENTO` tem `fcAlvoEtapa = "120-136 bpm"` e a Z1 do atleta é `120–136 bpm`
- **THEN** o valor não é alterado

#### Scenario: FC fora da zona esperada — correção automática
- **WHEN** uma etapa `AQUECIMENTO` tem `fcAlvoEtapa = "155-165 bpm"` (zona Z4), mas o tipo de etapa esperado é Z1
- **THEN** o sistema substitui pelo centro de Z1 do atleta, registra `WARN` com o atletaId e o valor original, e continua o processamento

#### Scenario: fcAlvoEtapa não parseable — sem exceção
- **WHEN** o LLM retorna `fcAlvoEtapa` em formato inesperado que não pode ser parseado como range bpm
- **THEN** o sistema loga `WARN` e mantém o valor original sem lançar exceção

#### Scenario: Atleta sem dados fisiológicos — validação pulada
- **WHEN** `validarENormalizarPlanoGerado` é chamado para atleta sem `fcLimiar` e sem `fcMaxima` explícita
- **THEN** a validação de FC por etapa é pulada (sem erro), pois não há base para calcular zonas confiáveis

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
