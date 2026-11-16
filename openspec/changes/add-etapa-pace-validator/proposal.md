# add-etapa-pace-validator — distância coerente com o ritmo em toda etapa, e eval sobre o plano normalizado

**Tamanho:** S · **Trilha:** Fast
**Status:** proposta, reescrita em 2026-11-16 (escopo menor depois da medição)
**Criado:** 2026-09-14
**Bloqueia:** o rollout (7.3) de `migrate-openai-retired-models`.

> Fast: correção num passo existente da normalização e ajuste do harness de eval, só no backend,
> sem schema nem contrato. O nome da change ficou do escopo original; não há validador novo.

## Por que

A revisão cega de 15 pares de planos (`apps/menthoros-backend/docs/ia/revisao-cega-planos-2026-11-16.md`)
reprovou o CA4b da migração por etapas com pace implícito absurdo (13 a 28 min/km) e distância 0,0 km.
A medição sobre os mesmos 30 planos (`RevisaoCegaNormalizacaoMedicaoTest`) mostrou que:

- **A revisão viu a resposta bruta da LLM**, não o plano que o coach recebe: `EvalCandidateRunner` e
  `RevisaoCegaPlanosRealTest` não passam por `NormalizacaoDeTreino`.
- **A normalização já corrige o que o coach barrou:** 0 km cai de 31 para 0 etapas, e o pace incoerente
  da PRINCIPAL zera (`distanciaPrincipalPorPace`, de `fix-etapas-continuos-pace`).
- **Sobra um bug da própria normalização:** 50 etapas de AQUECIMENTO/DESAQUECIMENTO ficam incoerentes
  porque `corrigirDistanciasEtapasTemporais` deriva a distância de `paceLimiar × 1,20` (Z2) ou `× 1,35`
  (Z1) e ignora o `ritmoAlvo` que a etapa declara. Ex.: 10 min marcados 6:00–6:30/km saem com 2,38 km
  (4:12/km).

**Decisão do coach-fundador (2026-11-16):** o `ritmoAlvo` declarado é a verdade; repara-se a distância.

## O que muda

1. **`TreinoNormalizador.corrigirEtapaTemporal`:** quando a etapa tem `ritmoAlvo` legível, a distância
   vem de `duracaoMin ÷ pace médio do ritmoAlvo` (mesma regra de `distanciaPrincipalPorPace`, mesmo
   `PaceValidator.calcularPaceMedia`). O fator sobre `paceLimiar` fica só como fallback para etapa sem
   ritmo.
2. **Eval sobre o plano normalizado:** `EvalCandidateRunner` (e com ele o bake-off e
   `RevisaoCegaPlanosRealTest`) passa cada treino por `NormalizacaoDeTreino` antes de gradar e gravar.
3. **Check no grader:** `EvalDeterministicGrader` ganha a violação de qualidade de pace implícito fora do
   `ritmoAlvo` ±10% ou etapa sem distância (a regra de `RevisaoCegaNormalizacaoMedicaoTest.avaliar`).
4. **Fixture `avancado-tsb-baixo`:** `paceLimiar` 3.50 está em decimal (3:30/km) e não bate com a
   `velocidadeLimiar` 15,65 km/h (3:50/km); passa a 3.83.
5. **Nova revisão cega** com os planos normalizados — fecha a 3.5 da migração.

## Fora de escopo

- **Calibrar `FATOR_PACE_Z2`/`FATOR_PACE_Z1`** (fallback para etapa sem ritmo): pela literatura, rodagem
  leve de atleta treinado fica em ~1,25–1,40 × o pace de limiar, e 1,20 é rápido demais. Muda a
  distância de todo aquecimento sem ritmo; vira change própria se o coach confirmar.
- Cobertura dos 7 dias; regra de dor para tendinite; cruzar o `ritmoAlvo` com a zona fisiológica do
  atleta (o ritmo declarado pode estar errado para o tipo de etapa — ver caso do sub-3h abaixo).

## Critérios de aceite

- **CA1** — GIVEN AQUECIMENTO `duracaoMin=10`, `ritmoAlvo="6:00-6:30/km"`, WHEN normalizado, THEN
  `distanciaKm` = 1,60 (10 ÷ 6,25) e não a de `paceLimiar × 1,20`.
- **CA2** — GIVEN AQUECIMENTO sem `ritmoAlvo` legível, THEN comportamento atual (fator sobre `paceLimiar`).
- **CA3** — GIVEN os 30 planos de `target/revisao-cega/`, WHEN medidos depois da normalização, THEN 0
  etapas com pace implícito fora do ritmo ±10% e 0 com 0 km.
- **CA4** — GIVEN `EvalCandidateRunner`, THEN o JSON gradado e o gravado são os do plano normalizado.
- **CA5** — GIVEN etapa incoerente, THEN `EvalDeterministicGrader` reporta a violação; coerente, não.
- **CA6** — `NormalizacaoDeTreinoCaracterizacaoTest`: só mudam os esperados de etapas temporais com
  `ritmoAlvo`, um por um, com o motivo no commit.

## Métrica de sucesso

O coach recebe planos em que distância, duração e ritmo de cada etapa contam a mesma história; a nova
revisão cega não tem caso barrado por ritmo implícito.

## Open Questions & Assumptions

- **Domínio (coach, 2026-11-16):** para o sub-3h, aquecimento de 6:00–6:30/km é lento e 4:12/km é ritmo
  de maratona. Pela literatura (tabelas de Daniels para ~2h55–3h00; limiar ~3:50–4:00/km), rodagem
  leve/aquecimento fica em ~4:50–5:30/km. Esta change torna a etapa coerente com o ritmo que a LLM
  escreveu; se o ritmo escrito estiver lento demais, é problema do prompt/zonas, fora daqui.
- **Assumido:** a medição usou contexto sem zonas de FC e sem teto/piso histórico; com eles, o passo
  `corrigir-pace-teto-piso` pode mudar o `ritmoAlvo` antes do reparo. A ordem da receita resolve: o
  reparo usa o ritmo que sair do passo.
