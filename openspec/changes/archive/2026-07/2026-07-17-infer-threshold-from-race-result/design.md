# Design — infer-threshold-from-race-result

## D1 — Escopo do MVP: só `paceLimiar`, não `fcLimiar`

**Decisão:** esta change deriva **apenas `paceLimiarEstimado`** de uma prova válida. `fcLimiar`/
`fcLimiarEstimado` continuam vindo **só** da inferência passiva por quintil
(`inferirFcLimiar`, inalterado) — em NENHUM ponto desta change (proposal, capabilities, impacto,
critérios de aceite) o `fcLimiarEstimado` deve ser mencionado como derivado de prova.

**Por quê:** `Prova` não tem campo de FC média própria. A única forma de obter FC da prova seria
correlacionar com um `TreinoRealizado` do mesmo dia (`tipoTreino=PROVA`), mas não existe vínculo
explícito entre as duas entidades — inferir essa correlação por data seria um match heurístico
novo, fora do escopo de uma change S. Vincular `Prova`↔`TreinoRealizado` fica registrado como
candidato a change futura (ver "Riscos e mitigações"), não uma promessa vaga.

## D2 — Fórmula prova→limiar (v1, heurística documentada — NÃO reusa `RiegelCalculator`)

**Achado do pre-mortem (Codex, 2026-07-16):** a v1 deste design assumia reuso direto de
`RiegelCalculator.calculate(...)`. Verificado contra o código real: a assinatura é
`calculate(RegressionResult regression, List<PastRace> raceHistory, List<Integer>
targetDistances)` — **exige um `RegressionResult`** (saída da Camada 1 de
`RaceProjectionSkill`, projeção de pace por regressão) como parâmetro obrigatório, e a seleção do
tempo-âncora (`selectAnchor`) combina esse regression com o histórico de provas. Não é uma função
pura "converte prova A em prova B" — está acoplada ao pipeline de projeção completo.
**Decisão revisada: NÃO chamar `RiegelCalculator.calculate()`.** Fabricar um `RegressionResult`
falso só para satisfazer a assinatura arriscaria acoplar semântica de projeção (que tem seu
próprio significado de confiança/calibração) a um cálculo de limiar que é conceitualmente
diferente, e um refactor de `RiegelCalculator` para extrair a matemática pura arriscaria regredir
`RaceProjectionServiceImpl` (fora do escopo desta change).

**Fórmula (versão isolada, mesmo padrão de duplicação proposital já usado em
`IntervalsIcuActivityMapper` — não acopla com código de outro domínio):**
1. Normaliza o resultado da prova para o pace equivalente de 10K com a fórmula de Riegel aplicada
   **localmente e sem calibração por atleta**: `t_10k = t_prova * (10000m / distancia_prova_m) ^
   1.06` — `1.06` é o mesmo valor de `RiegelCalculator.DEFAULT_EXPONENT`, duplicado como
   constante própria (não importado), já que calibração por histórico do atleta (a parte que de
   fato agregaria valor de reuso) fica fora do escopo v1 — ver "Riscos e mitigações".
2. `paceLimiarEstimado = pace_10k_equivalente + OFFSET_LIMIAR_SEC_KM` (constante, `+8s/km`).

**Por quê +8s/km:** aproximação padrão de literatura de treino de corrida (Jack Daniels/Pete
Pfitzinger/McMillan): para corredores bem treinados, o pace de limiar de lactato (sustentável por
~60min) é tipicamente 6-10s/km mais lento que o pace de 10K. `+8s/km` é o ponto médio dessa faixa
— constante única, fácil de ajustar depois. **Não foi calibrado com dado real do Menthoros** —
documentado como heurística de literatura, não como fórmula própria validada (ver D5, métrica de
sucesso revisada).

**Faixa de distância válida:** 5000m a 21097m (inclusive) em metros resolvidos — ver D2b abaixo
para como esse valor é obtido. Abaixo de 5K o esforço é predominantemente anaeróbico (não
representa limiar); acima de 21097m o ritmo já é sub-limiar (gestão de glicogênio domina).

## D2b — Resolução de distância: `distanciaKm` NÃO é o campo confiável (2º achado do pre-mortem)

**Achado do pre-mortem, 2ª rodada (Codex, 2026-07-16):** a v1 corrigida ainda filtrava só por
`p.distanciaKm BETWEEN :min AND :max` na query. Verificado contra o schema real de `Prova.java`:
`distancia` (enum `DistanciaProva` — `KM_5`/`KM_10`/`KM_21`/`KM_42`) é o campo **obrigatório**
(`nullable = false`); `distanciaKm` (`BigDecimal`) é **opcional**, documentado no código como
"para distâncias customizadas" — ou seja, uma prova comum de 10K ou meia-maratona cadastrada pelo
enum (o caminho normal) tem `distanciaKm = null`. Um filtro só em `distanciaKm` ignoraria
silenciosamente toda prova cadastrada pelo caminho padrão — quebra o caso de uso principal, não
um edge case.

**Resolução já existe no código, não precisa ser inventada:** `RaceProjectionServiceImpl
.resolveDistanceM(Prova)` (linhas 202-212) já resolve exatamente isso: prioriza `distanciaKm`
(custom) quando presente, senão resolve pelo enum (`KM_5→5000, KM_10→10000, KM_21→21097,
KM_42→42195`). **Decisão: duplicar essa função isolada** (mesmo padrão de D2 para o expoente de
Riegel — não modificar `RaceProjectionServiceImpl`, zero risco de regressão na projeção de
provas) em vez de extrair/compartilhar, já que o método é `private` hoje e extraí-lo tocaria um
arquivo fora do escopo desta change por um ganho de reuso pequeno (10 linhas).

**Consequência no design:** a query de repositório (Bloco 1) **não filtra mais por distância em
SQL** — busca só por `foiRealizada/tempoRealizado/dataProva/tenant`, retorna a lista ordenada; o
filtro de distância válida (5000-21097m) roda em código, depois de resolver `distanciaKm` **ou**
`distancia` via a função duplicada. Evita depender de JPQL para lidar com o `OR` entre os dois
campos + conversão de unidade (km custom vs metros do enum) de forma legível.

## D3 — Regra de precedência e ponto de disparo

**Onde:** `TsbServiceImpl.atualizarLimiareInferidos` (único caller de
`ThresholdInferenceService.inferirFcLimiar`/`inferirPaceLimiar` hoje) — sem novo endpoint, sem
scheduler novo. Continua rodando em todo sync de treino (mesmo padrão atual, `on-demand`).

**Precedência:**
1. Busca as provas realizadas recentes do atleta (`ProvaRepository`, nova query) — `foiRealizada =
   true`, `tempoRealizado` não nulo, `dataProva` dentro dos últimos `DIAS_LIMIAR_DESATUALIZACAO`
   (90 dias, constante já existente), tenant-scoped via `assessoria`. **Sem filtro de distância em
   SQL** (D2b) — resolve a distância de cada candidata em código e filtra 5000-21097m ali, pega a
   primeira válida (lista já vem ordenada por `dataProva DESC`).
2. Se existir → `paceLimiarEstimado` vem da fórmula D2, e `fonteLimiarPace` (D6) é persistido como
   `PROVA_REGISTRADA`. `fcLimiarEstimado` continua vindo do quintil (D1), inalterado.
3. Se não existir → comportamento atual, inalterado (quintil para os dois);
   `fonteLimiarPace = MEDIA_TREINOS`.

## D4 — Visibilidade da fonte para o coach (achado do product-reviewer, 2026-07-16)

**Problema levantado:** uma troca silenciosa de fonte de `paceLimiarEstimado` (quintil → prova)
muda zonas de treino, TSS/TSB e o prompt de geração de plano sem o coach saber *por quê* o valor
mudou — mesmo sem exigir aprovação, o princípio de coach-in-the-loop pede visibilidade mínima.
Verdict do product-reviewer: **Refine**, condicionado a resolver isso no design antes de
implementar.

**Decisão:** `AtletaPerfilCoachOutputDto` (já expõe `paceLimiarEstimadoFormatado`/
`fcLimiarEstimado` ao coach, `dto/output/AtletaPerfilCoachOutputDto.java:131,134`) ganha um novo
campo `fonteLimiarEstimado` (enum: `PROVA_REGISTRADA` | `MEDIA_TREINOS`). Custo mínimo — mesmo DTO
já existente, sem endpoint novo, sem tela nova. Exibir esse campo de forma visível na UI
(ex.: badge "Fonte: Prova 10K de 12/07" ao lado do valor) fica registrado como follow-up de
frontend fora do escopo desta change de backend — o campo precisa existir na API agora para que
esse follow-up seja possível sem outra volta ao backend.

## D6 — `fonteLimiarEstimado` precisa ser persistido, não recomputado no read (2º achado do pre-mortem)

**Achado do pre-mortem, 2ª rodada (Codex, 2026-07-16):** a v1 do D4 dizia que o mapper preenche
`fonteLimiarEstimado` "com base em qual caminho gerou o `paceLimiarEstimado` atual" sem persistir
essa informação em lugar nenhum — `PlanoMetaDados` só guarda o valor numérico. Sem persistência,
não há como saber de forma confiável e auditável qual foi a fonte do valor **armazenado no
momento em que foi calculado**: recomputar no read (rodar a mesma busca de novo) responde "qual
seria a fonte se recalculasse agora", que pode divergir do que gerou o valor atualmente salvo
(prova mudou de status, atleta editou `tempoRealizado`, prova saiu da janela de 90 dias entre o
sync e o coach abrir o perfil).

**Decisão:** `PlanoMetaDados` ganha uma coluna nova `fonte_limiar_pace` (enum `STRING`:
`PROVA_REGISTRADA` | `MEDIA_TREINOS`, nullable — `null` = nunca calculado, estado pré-existente
antes desta change), mesmo padrão de `confiancaInferenciaPace`
(`PlanoMetaDados.java:151-153`, já existe como `@Enumerated(EnumType.STRING)` sibling). Escrita
em `TsbServiceImpl.atualizarLimiareInferidos` no mesmo ponto em que `paceLimiarEstimado` é
escrito (D3). Leitura direta desse campo em `AtletaPerfilCoachOutputDto`/mapper — sem
recomputação no read.

**Impacto revisado:** esta change **deixa de ser "sem alteração de schema"** — ganha uma
migration aditiva (`ALTER TABLE tb_plano_metadados ADD COLUMN fonte_limiar_pace VARCHAR(20)`,
nullable, sem backfill necessário). Ver proposal.md "Impact" atualizado.

## D5 — Métrica de sucesso revisada (achado do pre-mortem, Codex)

A métrica original ("% de atletas cujo `paceLimiarEstimado` diverge <5% do pace da própria
prova") é tautológica — como a fórmula é `pace_prova_normalizado + 8s/km` (constante fixa), quase
todo resultado passa nesse teste mesmo que a fórmula esteja fisiologicamente errada; não detecta
o risco real (viés sistemático do offset não calibrado).

**Métrica revisada:** monitorar a distribuição de `Δ = paceLimiarEstimado_novo -
paceLimiarEstimado_antigo` no primeiro recálculo pós-deploy por atleta (log comparativo, D3/D4) —
sinaliza (não bloqueia) quando `|Δ| > 20s/km` para revisão manual do founder/coach, já que um
salto tão grande indica prova mal cadastrada ou offset inadequado para aquele perfil de atleta.
Sem dado real (prova + teste de limiar formal do mesmo atleta) disponível hoje para validar a
fórmula contra um ground truth — essa validação fica como ação de acompanhamento pós-deploy, não
pré-condição de merge (não há como obter esse dado antes do primeiro uso real).

## Riscos e mitigações

- **Offset `+8s/km` não calibrado com dado do Menthoros:** mitigado por D5 (log comparativo +
  sinalização de outlier), não por bloqueio de merge.
- **Prova mal cadastrada** (coach registra `tempoRealizado` de um treino de rodagem como se fosse
  prova, ou erra a distância): mitigado pela faixa 5K-21.1K e pelo alerta de outlier de D5; não
  vale a complexidade de detecção de outlier dedicada para o volume de dado esperado.
- **`Prova`↔`TreinoRealizado` sem vínculo** (por que `fcLimiar` fica de fora, D1): registrado como
  candidato a change futura.
- **Duplicação da constante de expoente Riegel (`1.06`)** entre `RiegelCalculator` e esta change
  (D2): aceito deliberadamente para não acoplar com o pipeline de projeção — se
  `RiegelCalculator.DEFAULT_EXPONENT` mudar no futuro, esta change não é notificada
  automaticamente (mesmo tradeoff já documentado para `sanitizeCadenciaIntervalsIcu` vs
  `StravaActivityServiceImpl` na change `intervals-icu-activity-ingestion`).
- **Duplicação da resolução enum→metros** entre `RaceProjectionServiceImpl.resolveDistanceM` e
  esta change (D2b): mesmo tradeoff acima — se `DistanciaProva` ganhar um 5º valor no futuro, os
  dois `switch` precisam ser atualizados juntos manualmente; nenhum teste cruza os dois arquivos
  para pegar essa divergência automaticamente. Aceito pelo mesmo motivo (evitar tocar
  `RaceProjectionServiceImpl`), mas é uma dívida real, não hipotética — marcado aqui para não se
  perder.
  (Extração para um resolvedor compartilhado fica como candidato de follow-up quando um 3º
  consumidor aparecer — regra prática de "duplicar até a 3ª ocorrência".)
