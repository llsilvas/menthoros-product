**Tamanho:** S · **Trilha:** Full (incerteza de design — regra de precedência entre fontes de
limiar e fórmula fisiológica de conversão prova→limiar precisam ser resolvidas antes da
implementação, não durante)

## Why

`ThresholdInferenceService` já infere `fcLimiar`/`paceLimiar` de forma passiva — mediana do
quintil mais rápido entre corridas contínuas/tempo/longas dos últimos 30 dias
(`inferirFcLimiar`/`inferirPaceLimiar`). É um proxy sem fricção para o atleta, mas ruidoso: mistura
"correu rápido num dia bom" com "de fato treina no limiar", e nunca reflete um esforço deliberado
e máximo.

`Prova` já guarda resultado de corrida real (`foiRealizada`, `tempoRealizado`, `distanciaKm`)
quando o coach registra o resultado pelo CRUD existente — a matéria-prima já existe, só falta o
caminho que a transforma em limiar. `RiegelCalculator` (`skills/race/`) já resolve o mesmo
problema matemático (normalizar um tempo de prova entre distâncias) para **projetar** tempos
futuros (`RaceProjectionServiceImpl`), mas está acoplado ao pipeline de projeção (exige
`RegressionResult`) — não é diretamente reaproveitável aqui (ver design.md D2); esta change usa a
mesma fórmula de Riegel de forma isolada.

`paceLimiar` alimenta zonas de treino (`fc-limiar-zones`), TSS/TSB e o prompt de geração de plano
— um valor mais preciso melhora a cadeia inteira sem tocar em nenhuma dessas camadas
consumidoras. `fcLimiar` fica fora do escopo (design.md D1).

## What Changes

- **Novo método em `ThresholdInferenceService`** (ex.: `inferirPaceLimiarDeProva(Prova
  provaValida)`) que, dado o resultado de prova mais recente e válido do atleta (ver critérios de
  validade abaixo), deriva **somente `paceLimiar`** (NÃO `fcLimiar` — ver D1 do design.md, `Prova`
  não tem FC própria e não há vínculo com `TreinoRealizado` para correlacionar) com uma fórmula
  isolada de Riegel + offset de literatura (D2 do design.md — não reusa `RiegelCalculator`
  diretamente, que exige um `RegressionResult` do pipeline de projeção e não é uma função pura
  reaproveitável aqui).
- **Critérios de validade de uma prova** para entrar na inferência: `foiRealizada = true`,
  `tempoRealizado` preenchido, distância **resolvida** (não só `distanciaKm` — ver abaixo) entre
  5000m e 21097m, e dentro da mesma janela de atualidade já usada pela inferência passiva
  (`DIAS_LIMIAR_DESATUALIZACAO` = 90 dias).
- **Resolução de distância — corrigida (2º achado do pre-mortem, D2b do design.md):** `Prova
  .distanciaKm` só é preenchido para distância customizada — uma prova cadastrada pelo caminho
  normal (enum `DistanciaProva`: `KM_5`/`KM_10`/`KM_21`/`KM_42`) tem `distanciaKm = null`. Um
  filtro só nesse campo ignoraria silenciosamente toda prova cadastrada do jeito padrão. A
  resolução (prioriza `distanciaKm` custom, senão resolve o enum em metros) já existe em
  `RaceProjectionServiceImpl.resolveDistanceM` — duplicada isoladamente aqui (mesmo motivo de não
  tocar `RaceProjectionServiceImpl`, D2b), não reinventada.
- **Regra de precedência** entre as duas fontes: quando existir uma prova válida dentro da janela
  de atualidade, ela tem prioridade sobre a inferência passiva por quintil (esforço deliberado e
  máximo é mais confiável que corridas de treino incidentais) — só para `paceLimiar`. `fcLimiar`
  continua sempre pelo quintil. Sem prova válida, mantém o comportamento atual (fallback por
  quintil) para os dois.
- **Novo método de repositório** em `ProvaRepository` para buscar as provas realizadas recentes de
  um atleta dentro da janela (`foiRealizada = true`, `tempoRealizado` não nulo, `dataProva` dentro
  da janela — **sem filtro de distância em SQL**, resolvido em código) — via `@Query` explícito
  com `p.assessoria.id = :tenantId` (não existe propriedade `tenantId` direta em `Prova`, o campo
  é `assessoria`; mesmo padrão já usado em `findByIdAndTenantId`/
  `findUpcomingByAtletaIdAndTenantId` neste repositório).
- **`TsbServiceImpl.atualizarLimiareInferidos`** passa a consultar primeiro a prova válida mais
  recente para `paceLimiarEstimado`; só cai para `inferirPaceLimiar` (quintil) quando não houver
  uma. `fcLimiarEstimado` sempre vem de `inferirFcLimiar` (quintil), inalterado.
- **Visibilidade E persistência da fonte para o coach (D4 + D6 do design.md, revisado):**
  `PlanoMetaDados` ganha coluna nova `fonteLimiarPace` (`PROVA_REGISTRADA` | `MEDIA_TREINOS`,
  nullable), escrita no mesmo ponto em que `paceLimiarEstimado` é escrito — **não recomputada no
  read** (2º achado do pre-mortem: recomputar na leitura poderia divergir do que de fato gerou o
  valor salvo). `AtletaPerfilCoachOutputDto` ganha campo aditivo `fonteLimiarEstimado` lendo esse
  valor persistido diretamente. Exibição na UI (badge/label) é follow-up de frontend, fora desta
  change de backend.

## Capabilities

### New Capabilities

- `threshold-inference-from-race`: deriva `paceLimiar` estimado a partir do resultado de uma
  prova real recente e válida, com precedência sobre a inferência passiva por quintil. `fcLimiar`
  não é afetado (D1 do design.md).

### Modified Capabilities

<!-- Nenhuma capability existente tem requisitos alterados — a inferência por quintil continua
existindo como fallback, comportamento inalterado quando não há prova válida. -->

## Impact

**Entidades e banco:** **1 migration aditiva** (revisado — a versão anterior deste proposal dizia
"nenhuma alteração de schema", corrigido após D6 do design.md): `ALTER TABLE tb_plano_metadados
ADD COLUMN fonte_limiar_pace VARCHAR(20)` (nullable, sem backfill — `null` = nunca calculado
por esta lógica, comportamento pré-existente). Sem impacto em dado existente.

**APIs:** nenhum endpoint novo. `AtletaPerfilCoachOutputDto` (já retornado pelo perfil do atleta
visto pelo coach) ganha um campo aditivo `fonteLimiarEstimado` (D4/D6 do design.md) — compatível
com clientes existentes (campo novo, não remove/renomeia nada).

**Repositórios:** `ProvaRepository` ganha uma query nova (provas realizadas recentes, sem filtro
de distância em SQL — D2b).

**Comportamento:** atletas com uma prova de 5000-21097m (resolvida via `distanciaKm` custom OU
enum `DistanciaProva`, D2b) registrada nos últimos 90 dias passam a ter `paceLimiarEstimado` (não
`fcLimiar`) estimado a partir dela em vez do quintil — valor pode mudar perceptivelmente no
primeiro recálculo pós-deploy (mitigação: log comparativo com sinalização de outlier, D5 do
design.md).

**Dependências:** nenhuma — `RiegelCalculator`/`Prova` já existem e não estão em outra change
ativa que altere sua interface.

## Critérios de aceite

1. **Given** um atleta com uma prova de 10K registrada (`foiRealizada=true`, `tempoRealizado`
   preenchido) há 30 dias, **when** `atualizarLimiareInferidos` roda no próximo sync de treino,
   **then** `PlanoMetaDados.paceLimiarEstimado` reflete o pace derivado da prova, não o quintil.
2. **Given** um atleta sem nenhuma prova válida (nenhuma realizada, ou só fora da faixa
   5000-21097m, ou fora da janela de 90 dias), **when** a inferência roda, **then** o
   comportamento é idêntico ao atual (fallback por quintil, sem regressão) para `paceLimiar` e
   `fcLimiar`, e `fonteLimiarPace = MEDIA_TREINOS`.
3. **Given** um atleta com uma prova válida de 30 dias atrás E outra de 100 dias atrás,
   **when** a inferência roda, **then** só a prova de 30 dias (dentro da janela) é considerada.
4. **Given** uma prova de 3K (fora da faixa 5000-21097m) registrada, **when** a inferência roda,
   **then** ela é ignorada e o quintil (ou o vazio) prevalece.
5. **Given** uma prova de meia-maratona **cadastrada pelo enum `DistanciaProva.KM_21`** (o
   caminho normal, `distanciaKm = null`), **when** a inferência roda, **then** ela é resolvida
   para 21097m e considerada válida (não ignorada por falta de `distanciaKm` — 2º achado do
   pre-mortem que quebrava exatamente o caso de uso mais comum).
6. **Given** uma prova com `distanciaKm = 10.0` preenchido (distância customizada — `distancia`
   continua com algum valor do enum, obrigatório em `Prova`, mas `distanciaKm` tem precedência
   quando presente), **when** a inferência roda, **then** ela também é considerada válida (os dois caminhos de
   distância funcionam).
7. **Given** um atleta cujo `paceLimiarEstimado` foi calculado a partir de uma prova, **when** o
   coach abre o perfil do atleta (mesmo dias depois, sem novo sync), **then**
   `fonteLimiarEstimado` retorna `PROVA_REGISTRADA` de forma estável — lido do valor persistido em
   `fonte_limiar_pace`, não recomputado no momento da leitura.

## Métrica de sucesso

**Sinalização de outlier no recálculo, não um sanity check tautológico** (revisado após achado do
pre-mortem — a métrica original comparava o resultado contra a própria fórmula que o gerou):
monitorar `Δ = paceLimiarEstimado_novo - paceLimiarEstimado_antigo` no primeiro recálculo
pós-deploy por atleta; `|Δ| > 20s/km` gera log de atenção para revisão manual do founder/coach
(D5 do design.md). Este é um refinamento de motor de cálculo, não uma feature nova voltada ao
coach — não há métrica de produto contínua associada.

## Open Questions & Assumptions

- **Resolvido (design.md D2):** fórmula prova→limiar não reusa `RiegelCalculator` diretamente
  (exige `RegressionResult` do pipeline de projeção, não é função pura reaproveitável aqui) — usa
  Riegel isolado com expoente fixo `1.06` (mesmo valor de `RiegelCalculator.DEFAULT_EXPONENT`,
  duplicado deliberadamente) + offset de literatura `+8s/km`, sem calibração por atleta no v1.
- **Resolvido (design.md D1):** `fcLimiar` fica fora do escopo desta change — `Prova` não tem FC
  própria e não há vínculo com `TreinoRealizado` para correlacionar com segurança. Candidato a
  change futura se o founder quiser esse vínculo.
- **Resolvido (design.md D4/D6, achado do product-reviewer + 2ª rodada do pre-mortem):** a
  mudança de fonte do limiar precisa ser visível ao coach E persistida (não recomputada no read)
  — `fonte_limiar_pace` novo em `PlanoMetaDados` (migration aditiva) + `fonteLimiarEstimado` em
  `AtletaPerfilCoachOutputDto` lendo esse valor direto. Exibição na UI é follow-up de frontend.
- **Resolvido (design.md D2b, 2ª rodada do pre-mortem):** `Prova.distanciaKm` só cobre distância
  customizada — a resolução de distância real (`distanciaKm` custom OU enum `DistanciaProva` em
  metros) duplica `RaceProjectionServiceImpl.resolveDistanceM` isoladamente, mesmo motivo de D2
  (não tocar `RaceProjectionServiceImpl`).
- **Assumido:** o coach já registra `tempoRealizado` de provas passadas pelo fluxo existente
  (`ProvaInputDto`/CRUD) — nenhuma mudança de UX é necessária para popular o dado-fonte.
- **Aberto:** o offset `+8s/km` não foi calibrado com dado real do Menthoros (nenhum atleta com
  prova E teste de limiar formal disponível hoje para validar). Mitigado por D5 (sinalização de
  outlier), não bloqueia o merge — ação de acompanhamento pós-deploy.
