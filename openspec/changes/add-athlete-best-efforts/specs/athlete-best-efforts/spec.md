# Spec delta: athlete-best-efforts

> Capability nova: melhor esforço por distância de referência em janela rolante (default 42 dias),
> computado internamente a partir de streams, persistido como resultado derivado e exposto em
> endpoint read-only por atleta (self + coach). Formato: requirements com cenários BDD verificáveis.

## Requirement: Cálculo de melhor esforço por distância a partir de streams

Um `BestEffortCalculator` DEVE, dados dois arrays cumulativos `time[]`/`distance[]` de uma
atividade, devolver o menor tempo em que o atleta percorreu cada distância alvo (400m, 800m, 1.5k,
1mi, 3k, 5k, 10k). A busca é uma janela rolante sobre a distância acumulada (two-pointer).
Distâncias maiores que a activity não geram esforço.

#### Scenario: Activity contínua
- **Given** streams cumulativos de uma corrida contínua
- **Then** o calculador devolve o melhor tempo de cada distância alvo presente, batendo com a
  fixture golden

#### Scenario: Activity mais curta que a distância
- **Given** activity de 6 km
- **Then** devolve esforços para 400m…5k, e nada para 10k

#### Scenario: Tempo parado
- **Given** streams com um trecho de tempo acumulado sem avanço de distância
- **Then** o resultado reflete o contrato do Bloco 0 (moving vs elapsed) sem quebrar

## Requirement: Persistência derivada, nunca o stream cru

A ingestão de uma atividade de corrida DEVE persistir em `tb_melhor_esforco` uma linha por
(distância, treino) com esforço — nunca o stream cru. `paceMinKm` NÃO é persistido (derivado no
read).

#### Scenario: Import de corrida
- **Given** import de uma atividade `Run` do intervals.icu com streams
- **Then** `tb_melhor_esforco` ganha uma linha por distância alvo presente no treino

#### Scenario: Import de não-corrida
- **Given** import de uma atividade que não é corrida
- **Then** nenhuma chamada de streams e nenhuma linha de esforço

#### Scenario: Falha de streams
- **Given** a chamada de streams falha (rate limit / 5xx)
- **Then** o treino é importado sem esforços (log), e o import não aborta

#### Scenario: Re-import
- **Given** re-import do mesmo treino
- **Then** nenhuma linha duplicada (unique `(treino_realizado_id, distancia_label)`)

## Requirement: Backfill do passivo

`POST /api/v1/intervals-icu/atletas/{atletaId}/activities/backfill-best-efforts` DEVE, para cada
corrida `INTERVALS_ICU` do atleta sem esforço persistido, buscar streams e preencher
`tb_melhor_esforco`. Idempotente; falha em um treino não aborta os demais; não sobrescreve dados do
treino.

#### Scenario: Backfill em passivo misto
- **Given** 10 corridas sem esforço, 3 com esforço, 1 com falha de streams
- **Then** as 10 ganham esforço, as 3 são ignoradas, a falha é logada e não interrompe

#### Scenario: Idempotência
- **Given** backfill rodado duas vezes
- **Then** a segunda não insere duplicata

## Requirement: Endpoint read-only, tenant-aware, com agregação na janela

`GET /api/v1/atletas/me/melhores-esforcos` DEVE devolver a lista do atleta autenticado;
`GET /api/v1/atletas/{id}/melhores-esforcos` a do atleta `{id}` para TECNICO/ADMIN do tenant. Cada
item: `distancia`, `tempoSegundos`, `paceMinKm`, `data`. A agregação é `min(tempo_segundos)` por
distância dentro da janela (default 42 dias), ordenada por distância canônica.

#### Scenario: Atleta autenticado com esforços
- **Given** esforços persistidos dentro da janela
- **When** `GET /me/melhores-esforcos`
- **Then** `200` com a lista ordenada por distância; `paceMinKm` consistente com
  `tempoSegundos / (distanciaMetros/1000)`

#### Scenario: Esforço fora da janela é ignorado
- **Given** o melhor de 5k aconteceu há 60 dias
- **Then** não aparece na resposta (janela rolante de 42 dias)

#### Scenario: Sem integração ou sem esforços
- **Then** `200 []`

#### Scenario: Coach do tenant lê o atleta
- **Then** `200` com a lista do atleta

#### Scenario: Atleta lê outro atleta
- **Then** `404`

#### Scenario: Cross-tenant
- **Then** `404`

## Requirement: Tabela no front com estados explícitos

A página Progresso DEVE ter a aba "Esforços" com a tabela distância × tempo × pace/km, e o perfil
do atleta visto pelo coach DEVE exibir a mesma tabela. Ambos DEVEM renderizar loading, erro e vazio
explicitamente.

#### Scenario: Tabela carregada
- **Then** mostra distância, tempo (`HH:MM:SS`) e pace (`M:SS/km`)

#### Scenario: Vazio
- **Given** `200 []`
- **Then** estado vazio explícito ("Ainda sem melhores esforços")

#### Scenario: Erro
- **Then** estado de erro com retry

## Requirement: Recordes existentes permanecem intactos

`GET /me/recordes` e `GET /{id}/recordes` DEVEM continuar devolvendo os PRs de todos os tempos
(5k/10k/21k), sem mudança de contrato ou comportamento.

#### Scenario: Sem regressão
- **Given** atleta com PRs registrados
- **Then** o endpoint `recordes` devolve exatamente o que devolvia antes da change
