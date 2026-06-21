# Proposal: fix-intervalado-distance-calculation

**Tamanho:** XS · **Trilha:** Fast
**Status:** Proposed
**Sprint:** 9g.1 (hotfix antes de `coach-edit-planned-workout`)
**Repos:** menthoros-backend

---

## Problema

Treinos intervalados com estrutura `aquecimento + tiros + recuperações + desaquecimento` são exibidos com distância total incorreta — tipicamente o dobro do esperado.

Exemplo reportado:
- Estrutura: 10min aquecimento + 5 × 400m + 2min recuperação cada + 10min desaquecimento
- Distância exibida: **10 km**
- Distância real esperada: **~6–7 km** dependendo do pace do atleta

## Causa Raiz

Dois defeitos cooperantes em `IaServiceImpl`:

**Defeito 1 — LLM usa pace errado para etapas temporais:**
O LLM atribui `distanciaKm` às etapas de AQUECIMENTO, DESAQUECIMENTO e RECUPERACAO usando o pace dos tiros (Z4/Z5, ex: 4:00/km) em vez do pace de esforço fácil (Z1/Z2, ex: 6:30–7:30/km).

Exemplo: AQUECIMENTO 10min a 4:00/km → `distanciaKm = 2.5 km` (errado)
Correto: AQUECIMENTO 10min a 7:00/km → `distanciaKm ≈ 1.4 km`

**Defeito 2 — `somarDistancias()` oculta o problema:**
O método trata `distanciaKm == null` como `0.0`. Quando o LLM omite `distanciaKm` das etapas temporais, elas somem do total — o contrário do Defeito 1, mas igualmente errado.

**Por que a reconciliação não pega:**
`reconciliarDistanciaComEtapas()` só corrige o total a nível de treino se o desvio entre treino-level e soma-de-etapas for > 10%. Com o Defeito 1, o LLM gera etapas com distâncias infladas que somam ~10km E define o total como ~10km — desvio ≈ 0%, reconciliação não dispara.

## Solução

Adicionar passo de pós-processamento **antes** de `normalizarTreinoIntervalado()` e `reconciliarDistanciaComEtapas()`: calcular `distanciaKm` das etapas temporais deterministicamente a partir de `duracaoMin ÷ paceZona`, substituindo qualquer valor fornecido pelo LLM.

**Mapeamento zona → pace:**
| Tipo de etapa | Zona | Pace relativo ao limiar |
|---|---|---|
| AQUECIMENTO | Z2 (aeróbico fácil) | `paceLimiar × 1.20` |
| DESAQUECIMENTO | Z2 | `paceLimiar × 1.20` |
| RECUPERACAO | Z1 (recuperação ativa) | `paceLimiar × 1.35` |

Se `paceLimiar == null`: usar defaults conservadores (Z2 = 7.0 min/km, Z1 = 8.0 min/km).

**Fórmula:** `distanciaKm = round(duracaoMin / paceMinKm, 3)`

Onde `paceMinKm` é em minutos por km (ex: 7.0 = 7:00/km).

**Escopo de aplicação:** Apenas tipos AQUECIMENTO, DESAQUECIMENTO e RECUPERACAO com `duracaoMin > 0`. Etapas INTERVALADO e TIRO mantêm sua `distanciaKm` explícita (ex: 400m = 0.4km por repetição).

Após a correção das etapas, o total do treino é recalculado por `reconciliarDistanciaComEtapas()` → `somarDistancias()`, que agora reflete a soma correta.

## Critérios de Aceitação

**CA1 — Distância correta para treino intervalado:**
Dado um atleta com `paceLimiar = 4.5` (4:30/km) e um treino gerado como:
`AQUECIMENTO 10min + 5×INTERVALADO 400m + 5×RECUPERACAO 2min + DESAQUECIMENTO 10min`,
quando o plano é gerado,
então `TreinoPlanejado.distanciaKm ∈ [5.5, 8.0]` km (não 10 km).

**CA2 — Etapas de tiro não são alteradas:**
Etapas INTERVALADO e TIRO com `distanciaKm` explícita (ex: 0.4km para 400m) não têm esse valor modificado pelo pós-processamento.

**CA3 — Fallback quando `paceLimiar` ausente:**
Dado um atleta sem `paceLimiar` cadastrado,
quando o plano é gerado,
então AQUECIMENTO/DESAQUECIMENTO usam 7.0 min/km e RECUPERACAO usa 8.0 min/km para calcular `distanciaKm`.

**CA4 — Etapas sem `duracaoMin` permanecem intocadas:**
Etapas temporais sem `duracaoMin` (campo nulo) não produzem `distanciaKm` — permanecem com o valor original (pode ser null).

**CA5 — Treinos não-intervalados não são afetados:**
Treinos CONTINUO, LONGO e TIRO sem etapas de AQUECIMENTO/DESAQUECIMENTO/RECUPERACAO têm distância calculada exatamente como antes.

## Não Faz Parte Desta Change

- Correção de distância para modalidades além de corrida (ciclismo, natação).
- Revisão das zonas de FC usadas pelo LLM para etapas de aquecimento.
- Cálculo de pace por zona a partir de FC (já existe como lógica separada).
- Exposição da distância por etapa na UI (é dado interno de geração).

## Riscos e Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Atleta com pace de limiar muito alto (iniciante 8:00/km) → AQUECIMENTO 10min a Z2 = 10/9.6 = 1.04km: distância pode parecer baixa | Ligeiramente abaixo do real | Valor correto para o atleta — o problema atual é o oposto (muito alto). CA1 usa tolerância ∈ [5.5, 8.0] |
| Mudança no comportamento de planos existentes gerados antes do fix | Distâncias futuras serão diferentes das históricas | Comportamento correto pós-fix; distâncias históricas no banco não são alteradas |
| `paceLimiar` em decimal minutos (ex: 4.5 = 4:30/km) vs. segundos/km — confusão de unidade | Cálculo errado | Confirmar unidade em `Atleta.paceLimiar` antes de implementar (ver task 1.1) |
