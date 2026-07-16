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

**Faixa de distância válida — CORRIGIDA (achado do pre-mortem):** a v1 usava `distanciaMaxKm=21`
como corte rígido, o que **excluiria silenciosamente toda meia-maratona real** (distância oficial
21,097km — provas cadastradas como `21.1` ou `21.097` km cairiam fora do corte e a prova seria
ignorada, quebrando exatamente o caso de uso mais comum da faixa longa). Corrigido para
`distanciaMinKm=5, distanciaMaxKm=21.1` (com tolerância cobrindo a distância oficial de meia).
Abaixo de 5K o esforço é predominantemente anaeróbico (não representa limiar); acima de 21.1K o
ritmo já é sub-limiar (gestão de glicogênio domina).

## D3 — Regra de precedência e ponto de disparo

**Onde:** `TsbServiceImpl.atualizarLimiareInferidos` (único caller de
`ThresholdInferenceService.inferirFcLimiar`/`inferirPaceLimiar` hoje) — sem novo endpoint, sem
scheduler novo. Continua rodando em todo sync de treino (mesmo padrão atual, `on-demand`).

**Precedência:**
1. Busca a prova mais recente válida do atleta (`ProvaRepository`, nova query) — `foiRealizada =
   true`, `tempoRealizado` não nulo, `distanciaKm` entre 5 e 21.1, `dataProva` dentro dos últimos
   `DIAS_LIMIAR_DESATUALIZACAO` (90 dias, constante já existente).
2. Se existir → `paceLimiarEstimado` vem da fórmula D2. `fcLimiarEstimado` continua vindo do
   quintil (D1).
3. Se não existir → comportamento atual, inalterado (quintil para os dois).

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
