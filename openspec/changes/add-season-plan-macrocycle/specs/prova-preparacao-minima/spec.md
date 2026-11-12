## ADDED Requirements

### Requirement: Tabela de semanas mínimas também alimenta o macrociclo

O `MacrocicloPlannerService` SHALL usar a mesma tabela de semanas mínimas por distância desta capability (via `RacePreparationRule`) para decidir se o macro é gerado com `preparacaoCurta = true`.

A tabela SHALL continuar sendo fonte única: prova e macro SHALL NOT divergir no mínimo de semanas. A escolha entre 8/10/12/16 e 8/10/14/18 é decisão do Gate 3 de `add-season-plan-macrocycle`; até lá, vale a tabela atual.

Preparação curta no macro SHALL seguir a regra desta capability: gera alerta e nunca bloqueia.

#### Scenario: Macro com janela abaixo do mínimo
- **WHEN** o coach gera o macro de uma maratona a 9 semanas
- **THEN** o macro nasce com `preparacaoCurta = true`, o alerta é retornado e a geração não é bloqueada

#### Scenario: Prova e macro concordam no mínimo
- **WHEN** a prova de 21 km tem `preparacaoCurta = false` com 12 semanas de janela
- **THEN** o macro gerado para ela também tem `preparacaoCurta = false`
