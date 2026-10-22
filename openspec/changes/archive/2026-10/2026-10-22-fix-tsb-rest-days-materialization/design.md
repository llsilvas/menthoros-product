# Design: fix-tsb-rest-days-materialization

O "porquê" e o escopo estão em `proposal.md`. Aqui só as decisões.

## Como está hoje

```java
// TsbServiceImpl.recalcularDesde
LocalDate ultimoDia = metricasDiariasRepository.findDataUltimaMetrica(atletaId);
LocalDate fim = (ultimoDia == null || ultimoDia.isBefore(LocalDate.now())) ? LocalDate.now() : ultimoDia;
for (LocalDate dia = data; !dia.isAfter(fim); dia = dia.plusDays(1)) { ... }   // começa em `data`

// TsbDiaPersister
private MetricasDiarias buscarMetricasDiaAnterior(UUID atletaId, LocalDate data) {
    return metricasDiariasRepository.findByAtletaIdAndData(atletaId, data.minusDays(1)).orElse(null);
}
private double obterCtlAnterior(MetricasDiarias ontem) { return ontem != null && ontem.getCtl() != null ? ontem.getCtl() : 0.0; }
```

`ultimoDia` já é consultado — só é usado para o **fim** do laço, nunca para o **início**. E o seed
é D-1 ou zero. Nenhum processo roda em dia sem treino.

---

## D1 — `recalcularDesde` começa em `min(data, ultimaMetrica + 1)`

**Decisão:** uma linha.

```java
LocalDate inicio = (ultimoDia != null && ultimoDia.plusDays(1).isBefore(data)) ? ultimoDia.plusDays(1) : data;
```

- Treino em dia já coberto ou retroativo (`data <= ultimoDia + 1`): `inicio = data` — comportamento
  atual, inclusive o retroativo de `fix-intervals-icu-retroactive-tsb-recalc`.
- Treino depois de um buraco: `inicio = ultimoDia + 1` — os dias de descanso nascem com TSS 0 dentro
  do mesmo laço, cada um lendo o D-1 que o passo anterior acabou de gravar.

**Por que aqui e não só no persister (D3):** o persister corrige o *seed*, mas não *cria* as linhas
dos dias de descanso — o PMC continuaria esparso. D1 é o que fecha o gráfico.

**Custo:** o laço cresce em `k` dias de descanso, cada um numa `@Transactional` própria do
persister. Para o caso real (dias, não meses) é desprezível; para o patológico, ver D2 (teto).

---

## D2 — Job diário `TsbDecaimentoDiarioScheduler`

**Decisão:** `@Scheduled(cron = "0 30 0 * * *", zone = "America/Sao_Paulo")` em
`br.com.menthoros.backend.scheduler`, no mesmo molde do `SyncPullLogPurgeScheduler` (cross-tenant
por natureza, `Clock` injetado, try/catch por atleta, log com contagem).

```
para cada (atletaId, ultimaMetrica) em metricasDiariasRepository.findUltimaMetricaPorAtleta():
    hoje = hojeResolver.hoje(atletaId)              // fuso do atleta, como o resto do domínio
    if ultimaMetrica >= hoje: continue              // em dia
    if DAYS.between(ultimaMetrica, hoje) > TETO_DIAS (400): log.warn + continue
    tsbService.recalcularDesde(atletaId, ultimaMetrica.plusDays(1))
```

- **Consulta nova** no repositório: `findUltimaMetricaPorAtleta()` → `List<AtletaUltimaMetrica>`
  (`SELECT m.atleta.id, MAX(m.data) ... GROUP BY m.atleta.id`). Uma query para o lote inteiro, não N.
- **Só atletas que já têm métrica.** Atleta recém-cadastrado sem treino não ganha linhas de zero —
  a série começa no primeiro treino (CA2).
- **Por que 00:30 e não 03:00:** precisa rodar *antes* dos consumidores da manhã
  (`SugestaoCoachGeneratorJob` às 06:00 lê `tb_metricas_diarias`) e *depois* da virada do dia em
  qualquer fuso brasileiro (Acre = UTC-5 vira às 02:00 de Brasília; o job pula o atleta cujo "hoje"
  ainda é ontem e pega no ciclo seguinte — por isso a checagem é por fuso do atleta, não global).
- **Por que `recalcularDesde` e não `atualizarTsbDia` dia a dia:** reaproveita D1, resolve pace uma
  vez (`hoje = fim`) e grava metadados só no último dia — mesma semântica que o caminho de ingestão.
- **Teto de 400 dias:** atleta abandonado não vira uma transação por dia durante um ano todas as
  noites. Acima do teto, loga `WARN` com o id e pula; o reparo é manual
  (`recalcularHistoricoCompleto`). O número é o mesmo limiar que o Javadoc do histórico completo
  cita como "custoso".
- **Idempotente:** rodar duas vezes no mesmo dia não faz nada na segunda (`ultimaMetrica >= hoje`).
- **Sem ShedLock:** instância única (proposal, Open Questions). Se virar réplica, o job é o único
  lugar a tocar.

---

## D3 — Seed defensivo: última linha anterior, decaída pela distância

**Decisão:** `buscarMetricasDiaAnterior` passa a usar
`findTopByAtletaIdAndDataBeforeOrderByDataDesc(atletaId, data)`. Se a linha encontrada é de `D-k`
com `k > 1`, o seed é decaído `k-1` vezes com TSS 0 antes de aplicar o TSS de `D`:

```java
double ctl = anterior.getCtl(); double atl = anterior.getAtl();
for (int i = 1; i < k; i++) { ctl = calcularCtlCorreto(ctl, 0, atleta); atl = calcularAtlCorreto(atl, 0, atleta); }
```

**Por que não deixar D1+D2 sozinhos:** D1 e D2 garantem que o buraco não existe *quando o fluxo
roda inteiro*. D3 cobre o fluxo rodando *pela metade*: bloco de `recalcularHistoricoCompleto`
abortado, deploy no meio de um `recalcularDesde`, linha apagada à mão. Sem D3 qualquer um desses
volta a resetar CTL a zero silenciosamente — o bug original, só que mais raro.

**Por que decair em memória e não gravar as linhas intermediárias:** o persister é "um dia, uma
transação" por contrato; criar linhas de outros dias aqui mudaria o escopo transacional de um método
que tem Javadoc inteiro sobre isso. Quem *cria* linhas é D1/D2; D3 só não mente no seed.

**`rampRate`** (`findByAtletaIdAndData(atletaId, data.minusDays(7))`) continua como está: com D1/D2
em vigor a linha de D-7 existe; sem ela o ramp rate já devolve 0 hoje — não é reset destrutivo.

---

## D4 — `processarDiasDescanso` sai

Código morto com armadilha documentada (resolução de pace com `data` histórica vs FC com `now()`).
D2 é o substituto com a semântica certa. Remover evita que alguém o "reative" como atalho.

---

## D5 — Reparo em produção

Depois do deploy, para cada atleta com buraco (query:
`SELECT atleta_id, MIN(data), MAX(data), COUNT(*) FROM tb_metricas_diarias GROUP BY atleta_id HAVING COUNT(*) < MAX(data) - MIN(data) + 1`):
`recalcularDesde(atleta, primeiraDataDoBuraco)`. Com D1, uma chamada reconstrói a sequência até hoje.
Alternativa mais cara e mais segura: `recalcularHistoricoCompleto` — fica a critério do founder, por
atleta. O script SQL de diagnóstico vai em `docs/ops/` do backend; a execução é manual e única.

**O que NÃO precisa:** migration, mudança no DTO `PmcPontoDto`, mudança no front.

---

## Testes

| Camada | Classe | Cobre |
|---|---|---|
| Unit | `TsbServiceImplTest` | D1: `inicio` nos três casos (sem métrica, retroativo, pós-buraco) |
| Unit | `TsbDiaPersisterTest` | D3: seed decaído por `k`; `k = 1` idêntico ao atual; sem linha → zero |
| Unit | `TsbDecaimentoDiarioSchedulerTest` | D2: pula em dia, pula acima do teto, isola falha por atleta, fuso do atleta |
| IT | `TsbRecalculoJanelaMistaIT` (existente, estender) | CA1 ponta a ponta: ingestão após buraco → série densa, CTL monotônico decrescente nos dias de TSS 0 |
| IT | `AtletaProgressControllerTest` | CA7: `/pmc` denso após reparo |

Full track: pre-mortem (Codex, 2026-10-20) feito — ver "Revisões do pre-mortem" abaixo, que **tem
precedência sobre D1–D5 onde divergir**; QA = code-reviewer + security-reviewer (job cross-tenant
escreve em todos os atletas) + test-master. Gate de entrega é `./mvnw clean verify`, não `test`
(`TsbRecalculoJanelaMistaIT` só roda no `verify`).

---

## Revisões do pre-mortem (precedem D1–D5)

O pre-mortem cross-model deu NO-GO ao design original. Os achados procedem e mudam o desenho:

**R1 — Atomicidade: um recálculo = uma transação por atleta.** (substitui "uma `@Transactional` por
dia" de D1/D2.) `recalcularDesde` passa a executar *todo* o intervalo `[inicio, fim]` — inclusive
os dias depois do buraco já existentes — numa única transação. Consequência: reparo interrompido
faz rollback inteiro, nunca deixa série densa com seeds errados (achado "MAX(data) confunde reparo
interrompido"). No caminho de ingestão a transação já existe (participa); no job e no reparo, o
chamador abre a transação por atleta. Custo aceito: ≤ 400 linhas por transação.

**R2 — Serialização por atleta.** `pg_advisory_xact_lock(hashtext(atletaId::text))` como **primeira
operação** de `recalcularDesde`, antes de ler treinos e métricas. Vale para ingestão, job e reparo
(todos passam por `recalcularDesde`). O lock é liberado no commit; o job que espera uma ingestão
em curso só lê os treinos depois do commit dela — fecha o interleaving "job sobrescreve métrica com
TSS antigo". "Instância única" não protege: ingestão é `@Async`/web e roda em paralelo ao scheduler.
Teste com barreira (duas threads) obrigatório.

**R3 — Detecção por buraco, não por `MAX(data)`.** (substitui a query de D2/D5.) O job e o
diagnóstico procuram, por atleta, (a) primeiro dia ausente em `[MIN(data), MAX(data)]`
(`generate_series` anti-join) e (b) `MAX(data) < hoje do atleta`. O ponto de partida do recálculo é
o menor dos dois. Independente de densidade aparente e sem migration/tabela de pendência. Reparo
atômico (R1) elimina o estado intermediário que `MAX(data)` não enxergaria.

**R4 — Alvo explícito do dia.** `recalcularDesde(atletaId, inicio, fim)`: `fim` = `hoje` resolvido
pelo `AtletaHojeResolver` e passado adiante; `LocalDate.now()` do servidor sai dos limites do laço
(assinatura antiga delega com `fim = hoje do atleta`). Job passa a rodar **de hora em hora**
(`0 30 * * * *`, `America/Sao_Paulo`): pula quem já está em dia, então é barato e pega Acre/Manaus
após a virada do fuso deles. Substitui o horário único 00:30; nenhum consumidor das 06:00 fica
para trás por fuso.

**R5 — Tenant no job.** Para cada atleta o job resolve o tenant autoritativo, faz
`TenantContext.setTenantId` e `clear()` em `finally`. Sem isso `MelhorEsforcoService.buscar` falha,
`TsbServiceImpl` engole a falha e o limiar regride silenciosamente de `MELHOR_ESFORCO` para
`MEDIA_TREINOS`. Teste: dois tenants consecutivos + fonte de limiar preservada.

**R6 — D3 (seed defensivo) só decai quando não há treino no intervalo.** Antes de decair `k-1`
dias com TSS 0, verifica ausência de `TreinoRealizado` contabilizável em `(D-k, D)`. Se houver (linha
de métrica apagada que tinha treino): **não** publica valor plausível-mas-errado — loga `WARN` com
atleta/intervalo e cai no comportamento atual (seed zero), sinalizando para reparo via R3. Com R1–R3
em vigor D3 vira rede de segurança rara.

**R7 — Sem teto que bloqueia: progresso em blocos.** (substitui `TETO_DIAS = 400` que pulava.)
Atraso > 400 dias é recalculado em blocos de 400 dias por execução (retoma na próxima hora, R3
detecta o resto). Reparo manual e `recalcularHistoricoCompleto` com **fim explícito = hoje do
atleta**; diagnóstico inclui `MAX(data) < hoje`. Nunca fica "pulado para sempre". O `WARN` por bloco
é observável (R8).

**R8 — Observabilidade (product review).** Gauge Micrometer `tsb.atletas_defasados` (atletas com
`MAX(data) < hoje - 1` medido ao fim de cada execução do job) + log `processados/pulados/falhas`.
Atleta defasado > 1 dia após o job é o sinal de regressão que o coach, hoje, descobre sozinho.

**R9 — Ingestão após buraco longo.** `recalcularDesde` na ingestão herda a transação do chamador
(`registrar`/`reprocessar`/persister do intervals.icu): reconstruir até 400 dias adiciona latência ao
registro do treino. Aceito porque são ≤ 400 cálculos baratos numa transação já aberta e o gap
real é de dias. Acima de 400 dias de buraco, a ingestão processa só o primeiro bloco de 400 dias
(R7) e o job conclui nos ciclos seguintes — o treino nunca falha pelo tamanho do buraco. Medir no
IT o tempo de `registrar` com buraco de 400 dias.

**Reparo (D5) — acréscimos do product review:** relatório antes/depois (CTL por atleta tocado,
`docs/ops/`), validação de ≥ 2–3 atletas contra o decaimento esperado (τ = 42) e registro do resultado,
em vez de só "zero trechos `missing`".

---

## Mecânica transacional (DoR, 2026-10-20) — fecha R1/R2

O DoR achou que R1/R2 colidiam com o código: `recalcularDesde` é **deliberadamente sem transação**
(`refactor-threshold-call-outside-transaction`) porque `resolverPaceSeNecessario` chama o
intervals.icu; envolvê-lo em `TransactionTemplate` seguraria conexão do pool durante chamada externa.
Desenho definitivo:

- `recalcularDesde(atletaId, inicio, fim)` **continua sem `@Transactional`** e continua resolvendo o
  pace **fora** de transação. Depois chama um método novo, `@Transactional`, num bean separado
  (evita auto-invocação): `TsbRecalculoTransacional.recalcularIntervalo(atletaId, inicio, fim, paceResolvido)`.
- Esse método é o único lugar com a ordem **lock → ler treinos → ler métricas → laço do persister**,
  tudo na mesma transação. Nas três ingestões (que já abrem transação) ele **participa** da do
  chamador — o lock vale até o commit do treino. No job e no reparo ele abre a própria transação;
  não há `TransactionTemplate` no scheduler e a chamada externa nunca segura conexão.
- **Na ingestão o pace já roda dentro da transação do chamador** (`registrar`/`reprocessar`/persister
  do intervals.icu são `@Transactional`); "pace fora de transação" vale só para job e reparo. O IT de
  latência não deve presumir o contrário.
- O pace é resolvido antes do lock e pode enxergar treino ligeiramente defasado. Aceito: é a janela
  de concorrência do pace já fora de escopo (proposal); CTL/ATL/TSB, que é o que o lock protege, são
  lidos depois do lock.
- **Reparo usa `recalcularDesde`** (atômico, bloco ≤ 400 dias). `recalcularHistoricoCompleto`
  **não muda**: continua em blocos de 30 dias, sem rollback global, por contrato — não é o caminho de
  reparo desta change. (A menção anterior a "400 dias" como critério dele estava errada.)
- **"Hoje" do atleta:** `AtletaHojeResolver` expõe `hojeDe(Atleta)`, não `hoje(UUID)`. A consulta R3
  devolve `(atletaId, primeiroDia)`; o job carrega o `Atleta` por item (fornece fuso **e** tenant, R5)
  e chama `hojeDe(atleta)`.
- **Validação de data futura:** `TsbServiceImpl.validarEntrada` e `TsbDiaPersister.validarEntrada`
  barram `data > LocalDate.now()` do servidor; atleta em fuso à frente do servidor teria `fim` legítimo
  rejeitado. Ambas passam a validar contra o `hojeDe(atleta)`.
- **Metadados em bloco intermediário:** `atualizarMetaDados`/`atualizarLimiares` gravam só quando
  `fim == hoje do atleta`; blocos intermediários de atraso > 400 dias não tocam metadados.
- **R6 — consulta nova:** `TreinoRealizadoRepository` ganha existência de treino contabilizável no
  intervalo `(atletaId, de, ate)` (o método atual é por dia).
- **Rollback da change:** sem migration, desfazer = reverter o deploy; linhas de descanso geradas são
  recalculáveis por `recalcularDesde`.
