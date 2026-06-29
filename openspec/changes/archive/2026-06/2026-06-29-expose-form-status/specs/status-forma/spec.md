# Capability: status-forma

Classificação de forma **atual** do atleta (TSB → faixa) como fonte única no backend, exposta via contrato e consumida pela UI sem reimplementação de limiares.

## ADDED Requirements

### Requirement: Backend é a fonte única da classificação de forma

A classificação de forma a partir do TSB DEVE ser derivada exclusivamente pela regra de domínio do backend (`FaixaTsb` / `MetricasThresholds`) e exposta nos DTOs que carregam o TSB ao cliente.

#### Scenario: TSB resolvido em status de forma
- **Given** um ponto de métrica com `tsb` não-nulo
- **When** o backend monta um DTO que carrega esse `tsb` (`PmcPontoDto`, `CoachAtletaResumoDto`, `AtletaHomeDto.MetricasChave`)
- **Then** o DTO inclui `statusForma` igual ao nome da `FaixaTsb` correspondente

#### Scenario: TSB ausente
- **Given** um ponto de métrica com `tsb` nulo
- **When** o DTO é montado
- **Then** `statusForma` é nulo (sem classificação inventada)

### Requirement: UI consome o status resolvido para a forma atual, não recomputa

A UI DEVE exibir a forma **atual** a partir do `statusForma` resolvido pelo backend e NÃO DEVE conter limiares numéricos de classificação para a forma atual.

#### Scenario: Exibição da forma atual
- **Given** um atleta com `statusForma` no contrato
- **When** a UI (inbox do coach, linha de atleta) renderiza a forma atual
- **Then** usa o valor resolvido e mapeia faixa → apresentação (label/cor) sem números

#### Scenario: Ausência de limiares de forma atual no cliente
- **Given** o código-fonte do frontend em `src/features`
- **When** auditado por limiares de forma atual (ex.: `formFromTSB` aplicado à forma atual, `tsb >= n`)
- **Then** não há ocorrência — `formFromTSB` permanece apenas na projeção de taper (`calcularPrevisaoForma`), tratada por change separada
