# Design: fit-running-dynamics-ingestion

## D1 — Colunas e tipos (migration V53)

Padrão de `db/migration` (tabelas `tb_`, snake_case, constraints nomeadas). Todas nullable —
running dynamics é dado opcional por natureza (depende de sensor).

```sql
-- =====================================================================
-- V53: Running dynamics + contexto por etapa e sessão (import .fit)
-- =====================================================================

ALTER TABLE tb_etapa_realizada
    ADD COLUMN IF NOT EXISTS gct_medio_ms          INTEGER,
    ADD COLUMN IF NOT EXISTS gct_equilibrio_pct    NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS passada_media_m       NUMERIC(4,2),
    ADD COLUMN IF NOT EXISTS oscilacao_vertical_cm NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS proporcao_vertical_pct NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS temperatura_media_c   NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS tempo_movimento       INTERVAL;

ALTER TABLE tb_treino_realizado
    ADD COLUMN IF NOT EXISTS gct_medio_ms          INTEGER,
    ADD COLUMN IF NOT EXISTS gct_equilibrio_pct    NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS passada_media_m       NUMERIC(4,2),
    ADD COLUMN IF NOT EXISTS oscilacao_vertical_cm NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS proporcao_vertical_pct NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS temperatura_media_c   NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS tempo_movimento       INTERVAL,
    ADD COLUMN IF NOT EXISTS calorias              INTEGER;

DO $$
BEGIN
    RAISE NOTICE '✅ V53 - running dynamics + contexto adicionados a tb_etapa_realizada e tb_treino_realizado';
END$$;
```

Cabeçalho da migration segue o padrão real de V51/V52 (comentário `--`, não bloco SQL executável
solto — evita que alguém copie/cole o rollback sem querer):

```
-- =====================================================================
-- V53: Running dynamics + contexto por etapa e sessão (import .fit)
--
-- ... (contexto/motivação)
--
-- Rollback:
--   ALTER TABLE tb_etapa_realizada
--       DROP COLUMN IF EXISTS gct_medio_ms, DROP COLUMN IF EXISTS gct_equilibrio_pct,
--       DROP COLUMN IF EXISTS passada_media_m, DROP COLUMN IF EXISTS oscilacao_vertical_cm,
--       DROP COLUMN IF EXISTS proporcao_vertical_pct, DROP COLUMN IF EXISTS temperatura_media_c,
--       DROP COLUMN IF EXISTS tempo_movimento;
--   ALTER TABLE tb_treino_realizado
--       DROP COLUMN IF EXISTS gct_medio_ms, DROP COLUMN IF EXISTS gct_equilibrio_pct,
--       DROP COLUMN IF EXISTS passada_media_m, DROP COLUMN IF EXISTS oscilacao_vertical_cm,
--       DROP COLUMN IF EXISTS proporcao_vertical_pct, DROP COLUMN IF EXISTS temperatura_media_c,
--       DROP COLUMN IF EXISTS tempo_movimento, DROP COLUMN IF EXISTS calorias;
-- Feature aditiva — nenhum dado existente é alterado ou removido.
-- =====================================================================
```
Seguro: todas as colunas são novas e nullable, sem dado derivado de terceiros escrito nelas fora
desta change (`DROP COLUMN` não afeta nenhuma outra feature).

Sem índices novos: nenhum lookup filtra por essas colunas; são payload de leitura do drilldown.

## D2 — Mapa SDK → coluna (unidades)

| SDK (`LapMesg`/`SessionMesg`) | Tipo SDK | Unidade FIT | Coluna | Conversão |
|---|---|---|---|---|
| `getAvgStanceTime()` | Float | ms | `gct_medio_ms` | round → Integer |
| `getAvgStanceTimeBalance()` | Float | % (pé esquerdo) | `gct_equilibrio_pct` | 1 casa |
| `getAvgStepLength()` | Float | **mm** | `passada_media_m` | ÷1000, 2 casas |
| `getAvgVerticalOscillation()` | Float | **mm** | `oscilacao_vertical_cm` | ÷10, 1 casa |
| `getAvgVerticalRatio()` | Float | % | `proporcao_vertical_pct` | 1 casa |
| `getAvgTemperature()` | Byte | °C | `temperatura_media_c` | direto, 1 casa |
| `getTotalTimerTime()` | Float | s | `tempo_movimento` | `Duration.ofMillis(round(s*1000))` |
| `getTotalCalories()` (Session) | Integer | kcal | `calorias` | direto |

Regra transversal: getter `null` → coluna `null`; nunca 0 fabricado. Sanidade defensiva no
persister: descartar (→ null) valores fisiologicamente impossíveis (GCT fora de 100–500 ms,
equilíbrio fora de 30–70%, passada fora de 0,3–3,0 m) — **descarte silencioso**, sem `log.warn`,
mesmo padrão já estabelecido em `sanitizarElevacao`/`sanitizarPotencia`/`sanitizarCadencia`
(`FitTreinoPersister`): dado de upload não confiável é rotina, não incidente; logar cada ocorrência
gera ruído sem ação associada. (Corrige o design original, que pedia `log.warn` — divergia do
padrão real do código.)

**`getTotalTimerTime()` precisa de helper próprio, não `duracaoDeSegundos()`:** o helper existente
em `FitParseServiceImpl` (`duracaoDeSegundos`, usado para `totalElapsedTime`) converte `null` em
`Duration.ZERO` — correto ali porque `totalElapsedTime` está sempre presente num lap válido. Para
`getTotalTimerTime()`, que pode faltar em dispositivos sem o campo, isso fabricaria um zero em vez
de "sem dado", quebrando a regra transversal acima e mascarando o fallback do CA7. Usar um segundo
helper (`tempoMovimentoDeSegundos`) que retorna `null` em vez de `Duration.ZERO`.

## D3 — Entidades e DTOs

- `EtapaRealizada` + `TreinoRealizado`: campos novos espelhando as colunas (`Integer`,
  `BigDecimal`, `Duration` com `@JdbcTypeCode(SqlTypes.INTERVAL_SECOND)` como o `duracao` atual).
- `FitLapData`/`FitSessionData`: campos novos como tipos-fonte (`Integer`/`Double`/`Duration`),
  conversão de escala acontece no persister (parser entrega o valor cru convertido de unidade,
  persister aplica arredondamento/BigDecimal — mesma divisão de responsabilidade do fix
  `velocidadeMedia`/`paceMedia`). `FitLapData` e `FitSessionData` ganham `Duration tempoMovimento`
  (nullable — ver D2, helper próprio) além das 6 métricas de running dynamics.
- `EtapaRealizadaOutputDto` e DTO do treino (`TreinoRealizadoOutputDto`): campos aditivos com
  `@Schema(description, example)`, `NON_NULL` já é o padrão do record. **Fluxo comum, não
  detalhe-only:** diferente da série de EF/envelope de decoupling (`fit-lap-derived-metrics`, que
  ficaram restritos a `toOutputDtoDetalhado` por serem estruturas computadas pesadas), estes são
  escalares simples do mesmo tipo de `elevacaoGanhoMetros`/`potenciaMedia` — que já são campos
  diretos em `EtapaRealizadaOutputDto`/`TreinoRealizadoOutputDto`, populados em todas as rotas.
  Mapeamento direto (sem `qualifiedByName`), sem tocar `toOutputDto`/`toOutputDtoDetalhado`.

## D4 — Decisão: sem camada de análise nesta change

A tentação é já emitir alertas ("assimetria > X%"). Deliberadamente fora: thresholds de forma são
decisão de produto/treinamento que exige dado acumulado para calibrar. Esta change entrega o dado
bruto persistido e exposto; `fit-lap-derived-metrics` e/ou `add-workout-metrics-analyzer` consomem.

## D5 — Interação com Strava

Splits do Strava não trazem running dynamics — os campos ficam `null` para essa fonte, o que é
correto e já sinalizado pelo `NON_NULL` no DTO. Nenhuma mudança no `StravaActivityServiceImpl`.

Nota sobre semântica de duração entre fontes (achado do adversarial review, resolvido como fora de
escopo): Strava usa `duracaoMin = moving_time` com `elapsed_time` à parte
(`TreinoRealizado.elapsedTimeSeg`); o FIT hoje usa `duracao = totalElapsedTime` (elapsed) sem um
campo "moving" equivalente até esta change. Alinhar as duas semânticas (ex.: `duracaoMin` do FIT
passar a ser moving time, como já é no Strava) é uma mudança de contrato maior, fora do escopo — D6
corrige só o cálculo derivado de pace/velocidade, não a coluna `duracao` em si (ver Open Questions
do proposal.md).

## D6 — Correção de pace/velocidade em laps com pausa (CA7)

`FitTreinoPersister.velocidadeMediaKmh(lap)` e `.paceMedia(lap)` hoje derivam de `lap.duracao()`
(= `totalElapsedTime`, tempo decorrido incluindo pausas). `fit-lap-derived-metrics` documentou que
isso diverge do Garmin em até 239 s/km nas voltas com pausa da fixture `corrida-15km-16laps.fit`
(voltas 4/9/10/12).

Fix: as duas funções passam a considerar `lap.tempoMovimento()` quando presente:

```java
private static Duration duracaoParaVelocidade(FitLapData lap) {
    Duration movimento = lap.tempoMovimento();
    return (movimento != null && !movimento.isZero() && movimento.compareTo(lap.duracao()) < 0)
            ? movimento
            : lap.duracao();
}
```

- `tempoMovimento == null` (dispositivo sem timer time) → fallback para `duracao` (comportamento
  atual, zero regressão).
- `tempoMovimento >= duracao` (não deveria acontecer, mas defensivo) → mantém `duracao` — timer
  time nunca é maior que elapsed time por definição; se vier maior é dado inconsistente do
  firmware, ignorar em vez de propagar.
- `tempoMovimento < duracao` (caso do lap com pausa) → usa `tempoMovimento`, corrigindo o pace.

`velocidadeMediaKmh`/`paceMedia` passam a chamar `duracaoParaVelocidade(lap)` no lugar de
`lap.duracao()` diretamente. **Não muda** `EtapaRealizada.duracao` em si (a coluna de duração
elapsed continua como está) — só o cálculo derivado de velocidade/pace.

Validação: teste de regressão reconstruindo a fixture real (mesmos dados que produziram o desvio
de 239 s/km documentado) e confirmando que, com `tempoMovimento` disponível, o erro cai para a
faixa das voltas sem pausa (~4,8-8 s/km).

## Pre-mortem (resumo)

- *"A migration quebra em produção"* → colunas nullable + `IF NOT EXISTS`, sem rewrite de tabela
  (ALTER ADD COLUMN nullable é metadata-only no PostgreSQL); rollback documentado em D1.
- *"Unidade errada passa despercebida"* → CA3 valida contra CSV real do Garmin Connect; testes
  fixam conversões mm→m e mm→cm; inclui validar o lado (E/D) do equilíbrio de GCT.
- *"Dispositivo grava lixo"* → faixa de sanidade do D2 descarta silenciosamente (mesmo padrão já
  usado para elevação/potência/cadência) — sem log.warn, sem derrubar o import.
- *"Ninguém consome o dado"* → métrica de sucesso monitora % preenchido; consumo no front é a
  change seguinte do funil — se não for priorizada em 2 sprints, revisar antes de expandir.
- *"Dado novo persistido mas o bug que motivou a dependência continua ativo"* (achado do DoR gate,
  convergente entre spec-reviewer e Codex) → D6/CA7 fecham o ciclo: `tempo_movimento` não é só
  coluna, corrige o cálculo de pace/velocidade em laps com pausa, com teste de regressão contra a
  fixture que documentou o desvio de 239 s/km.
