# Design — use-best-effort-for-threshold-inference

> Anchors verificados em 2026-09-19 contra `develop` do backend, já com
> `refactor-threshold-call-outside-transaction` mergeada (`AthleteThresholdUpdater.resolverFontePace`,
> `TsbServiceImpl.resolverPaceSeNecessario`, `AthleteThresholdUpdater.buscarTreinos30d` — todos
> confirmados no código real, não presumidos do design da change anterior).
>
> **Pre-mortem (DeepSeek, fallback do Codex indisponível por limite de uso)** achou 4 pontos;
> abaixo, incorporados: D5 (catch amplo) mantido com justificativa explícita de precedente; D2
> ganhou nota de risco residual (mitigada por D7, mesmo tratamento já aceito pro risco análogo de
> "prova mal cadastrada"); D4 (fan-out no cache) registrado como decisão já coberta por ADR-0008;
> `TenantContext` (não estava em nenhum D — item novo) **verificado contra o código real**: os 2
> callers de produção fora de request HTTP (`StravaActivitySyncScheduler`,
> `IntervalsIcuActivitySyncScheduler`) já populam `TenantContext` por atleta antes de descer até
> `TsbService`, com precedente direto de outro código no mesmo call chain já depender disso
> (`FitTreinoPersister`, `AtletaTreinoFeedbackServiceImpl`) — seguro hoje, mas por **convenção**
> (set/clear manual), não por mecanismo; task 3.3 ganha teste de regressão dedicado pros 2
> schedulers pra travar esse comportamento.

## D1 — Onde entra o novo degrau

`AthleteThresholdUpdater.resolverFontePace` (`services/helper/AthleteThresholdUpdater.java:140-160`)
já decide prova vs. quintil nesta ordem:

```java
public Optional<PaceLimiarResolvido> resolverFontePace(UUID atletaId, UUID tenantId, LocalDate hoje,
                                                         List<TreinoRealizado> treinos30d,
                                                         BigDecimal paceLimiarAnterior) {
    // 1. prova válida (5000-21097m, ≤90d) — PROVA_REGISTRADA, confiança ALTA
    // 2. [NOVO] melhor esforço válido (5k/10k, janela 42d) — MELHOR_ESFORCO, confiança ALTA
    // 3. quintil passivo (treinos30d) — MEDIA_TREINOS, confiança amostral
}
```

**Decisão:** o novo degrau entra como passo 2, entre prova e quintil — exatamente a ordem já
resolvida no proposal (prova > melhor esforço > quintil). `resolverFontePace` ganha um novo
parâmetro `List<MelhorEsforcoDto> melhoresEsforcos` (já buscado pelo caller — ver D4, por quê não é
o próprio método que chama `MelhorEsforcoService`).

## D2 — Seleção da marca: 10k > 5k quando as duas estão presentes

`MelhorEsforcoService.buscar(atletaId, "42d")` pode devolver várias marcas (400m…10k, tolerância
1%); só `"5k"`/`"10k"` interessam aqui (proposal já resolveu isso pelo **rótulo**, não por checar a
distância real contra a faixa 5000-21097m de novo — `MelhorEsforcoDto.distanciaLabel` já garante
"5k"/"10k" o suficiente, sem re-derivar).

**Decisão:** quando as duas marcas existem na mesma resposta, **10k vence** — duração mais próxima
de sustentação de limiar (~40-60min) que 5k (~20-30min), mesmo raciocínio fisiológico já
documentado pro offset `+8s/km` (`ThresholdInferenceService`, "pace de limiar é tipicamente
6-10s/km mais lento que o pace de 10K"). Sem 10k, usa 5k. Sem nenhuma das duas, sem fonte (cai pro
quintil).

**Risco residual (achado do pre-mortem, DeepSeek):** um "10k" mal representativo (ex.: melhor
segmento contínuo dentro de um treino intervalado, não um esforço deliberado e contínuo) pode
passar mesmo com a distância dentro da tolerância de 1% que `MelhorEsforcoService` já garante — o
range-check de distância (que a prova usa) não pega esse caso, porque o problema não é a distância,
é a *natureza* do esforço (intervalado vs. contínuo), informação que `MelhorEsforcoDto` não carrega.
**Aceito, mitigado por D7** (log de outlier): um "10k" espúrio tende a produzir um
`paceLimiarEstimado` deslocado do valor anterior, disparando o WARN pra revisão manual — mesmo
tratamento já aceito pro risco análogo "prova mal cadastrada" em `infer-threshold-from-race-result`
("não vale a complexidade de detecção de outlier dedicada"). Detectar "é treino intervalado"
exigiria `MelhorEsforcoService` expor o tipo de atividade de origem — fora do escopo desta change.

```java
// AthleteThresholdUpdater — método de seleção, paralelo a encontrarProvaValidaMaisRecente
private Optional<MelhorEsforcoDto> encontrarMelhorEsforcoValido(List<MelhorEsforcoDto> marcas) {
    return marcas.stream()
            .filter(m -> "10k".equals(m.distanciaLabel()) || "5k".equals(m.distanciaLabel()))
            .min(Comparator.comparing(m -> "10k".equals(m.distanciaLabel()) ? 0 : 1));
}
```

## D3 — Fórmula: réplica isolada de `inferirPaceLimiarDeProva`, mesmo padrão de duplicação

`MelhorEsforcoDto` (`dto/output/MelhorEsforcoDto.java`) não tem pace decimal pronto — só
`tempoSegundos`/`distanciaMetros` (double) e um `paceLabel` formatado (string, não reaproveitável
pra cálculo). Mesmo padrão de `inferirPaceLimiarDeProva` (que já duplica a fórmula de Riegel em vez
de reusar `RiegelCalculator`, design.md D2 de `infer-threshold-from-race-result`):

```java
// ThresholdInferenceService — novo método público, mesma classe que já tem
// EXPONENTE_RIEGEL/OFFSET_LIMIAR_SEC_KM (package-private, sem mudança de visibilidade)
public BigDecimal inferirPaceLimiarDeMelhorEsforco(MelhorEsforcoDto melhorEsforco) {
    double tempo10kEquivalenteSegundos =
            melhorEsforco.tempoSegundos() * Math.pow(10000.0 / melhorEsforco.distanciaMetros(), EXPONENTE_RIEGEL);
    double paceLimiarSegundosPorKm = (tempo10kEquivalenteSegundos / 10.0) + OFFSET_LIMIAR_SEC_KM;

    return BigDecimal.valueOf(paceLimiarSegundosPorKm / 60.0).setScale(4, RoundingMode.HALF_UP);
}
```

Idêntica a `inferirPaceLimiarDeProva`, só a fonte do tempo/distância muda (`MelhorEsforcoDto` em
vez de `Prova`) — `distanciaMetros` já vem em metros (double), sem precisar de
`resolverDistanciaMetros` (esse resolvia a ambiguidade `distanciaKm` custom vs. enum `DistanciaProva`
que só existe em `Prova`).

## D4 — `MelhorEsforcoService.buscar()` é chamado por `TsbServiceImpl.resolverPaceSeNecessario`, não por `AthleteThresholdUpdater`

**Achado do levantamento:** `resolverPaceSeNecessario` (`TsbServiceImpl.java:133-154`) já roda
**fora de qualquer transação** (confirmado — nem o método nem os 2 pontos de entrada que o chamam
têm `@Transactional`; a persistência é bean separado, `TsbDiaPersister`). A pré-condição que
`refactor-threshold-call-outside-transaction` existiu pra criar **já está satisfeita** — não precisa
de nenhuma restruturação adicional de fronteira transacional nesta change.

**Decisão:** a chamada HTTP externa (`melhorEsforcoService.buscar(atletaId, "42d")`) acontece em
`resolverPaceSeNecessario`, não dentro de `AthleteThresholdUpdater.resolverFontePace` — mantém
`resolverFontePace` como função **pura recebendo dados já buscados** (mesmo padrão que já usa pra
`treinos30d`), em vez de `AthleteThresholdUpdater` ganhar uma dependência de I/O externo que hoje
não tem (só repositórios). `TsbServiceImpl` já orquestra I/O (repos, e agora mais um serviço) —
convém que continue sendo o único orquestrador de chamadas externas nesse fluxo.

```java
// TsbServiceImpl.resolverPaceSeNecessario — só a parte nova
List<MelhorEsforcoDto> melhoresEsforcos = buscarMelhorEsforcoSeguro(atletaId);
return athleteThresholdUpdater
        .resolverFontePace(atletaId, tenantId, hoje, treinos30d, melhoresEsforcos, paceLimiarAnterior)
        .orElse(null);
```

## D5 — Falha do intervals.icu (rede/API) é best-effort: cai pro próximo degrau, nunca propaga

**Achado do levantamento:** `MelhorEsforcoServiceImpl.buscarMarcas` propaga
`IntervalsIcuApiException` sem tratar quando a chamada HTTP falha (timeout, erro HTTP) — só o caso
"sem integração conectada" já devolve lista vazia sem lançar.

**Decisão:** `TsbServiceImpl` captura a exceção no ponto de chamada e trata como "sem melhor esforço
disponível" (lista vazia) — nunca deixa uma falha do intervals.icu quebrar a atualização de TSB do
dia inteiro (mesmo espírito best-effort já usado no resto da integração, ex.
`IntervalsIcuOAuthServiceImpl.sincronizarFcBestEffort`).

```java
private List<MelhorEsforcoDto> buscarMelhorEsforcoSeguro(UUID atletaId) {
    try {
        return melhorEsforcoService.buscar(atletaId, JANELA_MELHOR_ESFORCO);
    } catch (RuntimeException e) {
        log.warn("resolverPaceSeNecessario: falha ao buscar melhor esforço (best-effort, "
                + "cai pro próximo degrau). atletaId={}", atletaId, e);
        return List.of();
    }
}
```

`RuntimeException` (não só `IntervalsIcuApiException`) — mesma tolerância ampla já usada em pontos
best-effort equivalentes, cobre timeout de transporte (`status=null`) e qualquer outra falha
inesperada do client sem uma lista fechada de exceções a manter sincronizada.

**Achado do pre-mortem (DeepSeek):** capturar `RuntimeException` genérico pode mascarar um bug real
(NPE, `ClassCastException`) como "sem melhor esforço", não só falha externa legítima. **Decisão:**
manter a captura ampla — é o mesmo padrão já estabelecido em
`IntervalsIcuOAuthServiceImpl.sincronizarFcBestEffort` pra chamada best-effort equivalente ao mesmo
provedor, e o `log.warn(..., e)` grava o stack trace completo (não é silencioso — aparece nos logs
estruturados, só não interrompe o fluxo). Estreitar pra só `IntervalsIcuApiException` deixaria um
bug de parsing/NPE propagar e quebrar a atualização de TSB do dia inteiro — pior resultado que
logar e seguir. Sem mudança de escopo aqui; mesma decisão já validada nesse ponto de integração.

## D6 — `FonteLimiarInferencia` ganha `MELHOR_ESFORCO`; sem migration

`FonteLimiarInferencia` (`enums/FonteLimiarInferencia.java`) é hoje `{PROVA_REGISTRADA,
MEDIA_TREINOS}` — ganha `MELHOR_ESFORCO` (posição do meio, só por legibilidade — a precedência é
decidida em código, não pela ordem do enum). `PlanoMetaDados.fonteLimiarPace` é
`@Enumerated(EnumType.STRING) @Column(length = 20)` — `MELHOR_ESFORCO` tem 14 caracteres, cabe sem
migration (mesmo raciocínio já validado quando essa coluna foi criada em
`infer-threshold-from-race-result`).

## D7 — Sinalização de outlier (D5 de `infer-threshold-from-race-result`) estende pro novo degrau

`logSinalizacaoOutlierPace` (`AthleteThresholdUpdater.java:183-199`) já loga WARN quando o delta de
`paceLimiarEstimado` excede 20s/km na fonte "prova". **Decisão:** o degrau de melhor esforço
reaproveita o mesmo helper (mesma razão: uma marca de treino mal registrada ou um bug de
sincronização do intervals.icu pode produzir um salto grande, vale sinalizar pra revisão manual) —
sem criar um segundo limiar/mecanismo.

**Achado da 2ª rodada de pre-mortem (DeepSeek):** o WARN só dispara comparando contra
`paceLimiarAnterior` — um atleta **sem** limiar anterior (primeira inferência) ou cujo valor
anterior já estava errado no mesmo sentido não geram nenhum sinal, mesmo se o "10k" for espúrio
(D2). Diferente do "prova mal cadastrada" (que tem data/evento auditável no cadastro da prova em
si), um segmento de treino intervalado mal identificado como 10k contínuo não tem outro rastro.
**Decisão:** `logSinalizacaoOutlierPace` já loga INFO no caso "primeira vez" (`paceAntigo == null`,
linha 130-134 do código atual) — **estender esse INFO pra sempre incluir a fonte** (`MELHOR_ESFORCO`
vs. `PROVA_REGISTRADA`) e o `distanciaLabel`/`tempoSegundos` usados, não só o valor calculado.
Garante rastro auditável pra QUALQUER inferência via melhor esforço (outlier ou não, com ou sem
valor anterior) — sem exigir `paceLimiarAnterior` presente pra aceitar a fonte (isso excluiria
exatamente os atletas novos, que são quem mais se beneficia de ter uma inferência real em vez de
nenhuma).

## D8 — Janela fixa `"42d"`, não configurável

Já resolvido no proposal ("atual" = a mesma semântica da change original). Constante nomeada
(`JANELA_MELHOR_ESFORCO = "42d"`) em vez de string literal espalhada, mas sem parametrização nova —
não é uma opção do usuário, é uma decisão de produto fixa.

## Riscos e mitigações

- **`MelhorEsforcoService.buscar()` já é `@Cacheable` (TTL 30min), mas só amortiza repetição do
  mesmo atleta, não fan-out de frota (achado do pre-mortem, DeepSeek):** um pico de sync (ex.: cron
  noturno processando N atletas) gera N cache-misses simultâneos → N chamadas HTTP ao intervals.icu,
  sem rate-limit/circuit-breaker. **Aceito, sem mitigação nova** — mesma política já registrada em
  ADR-0008 ("No circuit breaker, by decision... onde calls repeat in bursts, stop after N falhas
  consecutivas em vez de nova dependência"); se o fan-out virar problema real observado em produção,
  a mitigação (parar após N falhas consecutivas no lote) é a mesma já prevista pro resto da
  integração intervals.icu, não algo específico desta change.
- **`TenantContext.getRequiredTenantId()` dentro de `MelhorEsforcoServiceImpl`** — lança se não
  houver tenant no contexto da thread. **Verificado contra o código real (2026-09-19), não só
  presumido:** os 2 callers de produção de `TsbService.recalcularDesde` fora de request HTTP
  (`StravaActivitySyncScheduler`, `IntervalsIcuActivitySyncScheduler`) já populam `TenantContext`
  por atleta, manualmente, antes de descer até `TsbService` — com precedente direto de outro código
  no mesmo call chain já depender disso (`FitTreinoPersister`, `AtletaTreinoFeedbackServiceImpl`).
  Seguro hoje, mas por **convenção** (set/clear manual por quem chama), não por mecanismo — task 3.3
  ganha teste de regressão dedicado pra travar isso (critério de aceite 5 do proposal).
- **Distância elegível verificada só pelo rótulo (`"5k"`/`"10k"`), não pela distância real
  (D2)** — aceito deliberadamente (proposal já resolveu assim); registrado aqui pra não parecer
  esquecimento se alguém notar a ausência do range-check que a prova tem.
- **Sem mudança de contrato/API, sem migration** — superfície de risco pequena, mesma já mapeada
  por `infer-threshold-from-race-result` (zonas, TSS/TSB, prompt de plano).
