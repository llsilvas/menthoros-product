# Proposal: fix-intervalado-tiro-shrink-normalizacao

**Tamanho:** S · **Trilha:** Fast (bug isolado num único método de um arquivo, backend-only, sem
mudança de contrato de API nem de schema de banco, sem incerteza de design)

## Status

- Proposta inicial (2026-09-11) — origem: log local de geração de plano + relato do founder.

## Why

Geração de plano real (atleta `07e276e0-91bf-45a6-a456-734649c23c5d`, 2026-09-11 11:06–11:09,
`logs/menthoros.log`):

```
11:06:25 EXPANSÃO NxDist [INTERVALADO]: 'Intervalado 5x800m Z4' → 5 tiros (10 etapas)
11:08:29 VALIDAÇÃO ALERTA: Soma das etapas (9.47 km) difere da distância planejada (8.0 km) em 1.47 km
11:09:24 VALIDAÇÃO OK: Treino INTERVALADO - 12 etapas (5 tiros, 5 recuperações, 9.47 km - tiros: 4.0 km, rec: 1.9 km)
```

A expansão de "5x800m" para 5 tiros individuais de 0,8 km está correta. O problema está no passo
seguinte, `IaServiceImpl.normalizarTreinoIntervalado` (`:654-711`): o LLM declarou
`distanciaKm=8.0` para o treino inteiro, mas a estrutura real (aquecimento + 5×800m + 4×recuperação
+ desaquecimento) soma 9,47 km. Como `gap = alvo - soma = -1,47` é negativo, o método chama
`distribuirDeltaPorTipo(etapas, "INTERVALADO", gap, min=0.4, max=1.2)` — que **encolhe os próprios
tiros de 800m** (não só aquecimento/desaquecimento/recuperação) para forçar a soma a bater com os
8,0 km do LLM. É esse mecanismo que reduz os tiros para ~0,53 km cada.

Existe `reconciliarDistanciaComEtapas` (`:720-753`), que faz o inverso e correto — recalcula
`distanciaKm` do treino a partir da soma real das etapas quando o desvio é >10%. Mas ela roda
**depois** de `normalizarTreinoIntervalado` já ter mutilado os tiros, então nunca age: a soma já foi
forçada a bater com o alvo errado antes de chegar lá.

Isso quebra o estímulo fisiológico prescrito. 800m é uma distância consagrada para desenvolvimento
de VO2max justamente pela cinética de O2 — o atleta leva ~60-90s para o consumo de oxigênio subir
até a intensidade alvo, então o tiro precisa ter duração suficiente (tipicamente 2-4min) para
efetivamente passar tempo em VO2max. Encolher 800m para ~534m corta a duração do tiro em ~33%,
provavelmente abaixo do piso necessário para o estímulo pretendido.

## What Changes

- `IaServiceImpl.normalizarTreinoIntervalado`: quando `gap < 0` (soma das etapas excede o alvo do
  LLM), **não** aplicar `distribuirDeltaPorTipo` sobre etapas `INTERVALADO`. O ajuste de "sobra"
  continua válido apenas para `RECUPERACAO` (já coberto) — que é folga entre tiros, não o estímulo
  em si.
- Etapas `INTERVALADO` deixam de ser candidatas a encolhimento por baixo em qualquer fluxo de
  normalização; distâncias de tiro nascidas da expansão (400/800/1000/1200m, etc.) ficam intocadas.
- Sem mudança em `reconciliarDistanciaComEtapas`: ao rodar depois, ela passa a ver a soma real
  (9,47 km) e corrige `distanciaKm` do treino para refletir isso — o comportamento que já existia,
  agora efetivo.
- Sem mudança no caminho de crescimento (`gap > 0.6` → adicionar tiro+recuperação inteiros): esse
  fluxo já preserva distâncias redondas.

## Impact

- Um método em `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/services/impl/IaServiceImpl.java`.
- Sem migration, sem mudança de contrato de API/DTO, sem impacto em outro repositório.
- Efeito no produto: treinos INTERVALADO/TIRO gerados pela IA passam a manter a distância de tiro
  prescrita; a distância total do treino (`distanciaKm`) pode divergir do valor que o LLM declarou
  originalmente — o que é o comportamento desejado (a estrutura real manda, não a soma que o LLM
  chutou).

## Critérios de aceite

- **CA1 — Tiro não encolhe abaixo do valor expandido**
  - **Given** um treino INTERVALADO expandido com tiros de 0,8 km e soma de etapas maior que a
    `distanciaKm` declarada pelo LLM
  - **When** `normalizarTreinoIntervalado` normaliza o treino
  - **Then** todas as etapas `INTERVALADO` mantêm `distanciaKm == 0.8` (não são reduzidas)

- **CA2 — Recuperação e aquecimento/desaquecimento continuam absorvendo a sobra**
  - **Given** o mesmo cenário do CA1
  - **When** a normalização roda
  - **Then** etapas `RECUPERACAO`/`AQUECIMENTO`/`DESAQUECIMENTO` continuam podendo ser ajustadas
    dentro dos limites já existentes (comportamento inalterado)

- **CA3 — `distanciaKm` do treino reflete a estrutura real após reconciliação**
  - **Given** soma das etapas (após CA1/CA2) ainda diverge >10% do `distanciaKm` original do LLM
  - **When** `reconciliarDistanciaComEtapas` roda em seguida
  - **Then** `distanciaKm` do treino passa a ser a soma real das etapas

- **CA4 — Caso em que a soma já bate com o alvo permanece sem alteração**
  - **Given** um treino INTERVALADO cuja soma de etapas já está dentro de 0,05 km do alvo do LLM
  - **When** a normalização roda
  - **Then** nenhuma etapa é alterada (comportamento idêntico ao atual)

- **CA5 — Crescimento (gap positivo) continua intocado**
  - **Given** um treino cuja soma de etapas é menor que o alvo do LLM
  - **When** a normalização roda
  - **Then** o comportamento de adicionar tiro+recuperação (ou distribuir delta positivo) permanece
    exatamente como hoje

## Métrica de sucesso

- Zero ocorrências, em logs de geração pós-deploy, de etapa `INTERVALADO` com `distanciaKm` menor
  que o valor originalmente expandido da descrição do LLM (verificável comparando o log
  `EXPANSÃO NxDist` com a distância final persistida do mesmo treino).

## Open Questions & Assumptions

1. Assumo que o limite inferior (`min=0.4`) do `distribuirDeltaPorTipo` para `RECUPERACAO` continua
   adequado — não é alterado por esta change.
2. Assumo que não há teste existente que dependa do encolhimento de `INTERVALADO` (comportamento
   considerado bug, não contrato). A verificar na Definition of Ready / implementação.

## Riscos e mitigações

- **`distanciaKm` do treino pode divergir mais do que hoje do valor pedido ao LLM** (BAIXO, aceito
  por design): é o comportamento correto — a estrutura real (tiros redondos) passa a mandar sobre o
  total declarado pelo LLM, que era o objetivo desta change.

## Non-goals

- Revisar os limites (`min`/`max`) de `RECUPERACAO`/`AQUECIMENTO`/`DESAQUECIMENTO`.
- Mudar a lógica de crescimento (`gap > 0.6`, `maxTirosPorNivel`).
- Mudar o prompt da IA ou o schema de saída do LLM.

## Referências

- Log de origem: `logs/menthoros.log`, geração 2026-09-11 11:06–11:09, atleta
  `07e276e0-91bf-45a6-a456-734649c23c5d`.
- Código: `IaServiceImpl.normalizarTreinoIntervalado` (`:654-711`),
  `IaServiceImpl.distribuirDeltaPorTipo` (`:802-844`),
  `IaServiceImpl.reconciliarDistanciaComEtapas` (`:720-753`).
