**Tamanho:** M · **Trilha:** Full

## Why

A lógica atual de progressão de treinos baseia-se apenas em um contador de semanas de aumento de volume (`semanasProgressaoContinua`), sem considerar aderência, qualidade de execução, longões realizados, RPE ou resposta real do atleta nos últimos ciclos. Isso impede que a IA receba um envelope técnico confiável e leva a planos que podem ignorar sinais claros de fadiga ou subutilizar um atleta bem adaptado.

## What Changes

- **Novo serviço** `ProgressaoTreinoService`: consolida histórico real do atleta nas janelas de 7, 21 e 42 dias e produz uma decisão objetiva de progressão.
- **Novos DTOs** `ProgressaoHistoricoResumo` e `DecisaoProgressao` (record), com enum `EstadoProgressao` (`PROGREDIR`, `PROGREDIR_LEVE`, `MANTER`, `REDUZIR`).
- **Ampliação do histórico** em `PlanoServiceImpl`: de `LIMITE_TREINOS_HISTORICO = 7` para busca por janela de 42 dias via repositório.
- **Integração no fluxo de geração de plano**: a `DecisaoProgressao` é calculada antes da chamada à IA e passada como contexto no prompt via `PeriodizacaoPromptFormatter`.
- **Reutilização** de `calcularProgressaoSegura` (TSB/rampRate) como limitador de teto dentro do novo serviço.

## Capabilities

### New Capabilities

- `progressao-treinos`: Motor de decisão de progressão baseado em janelas de histórico real (7/21/42 dias), aderência, longões, RPE e métricas TSB/ATL/CTL. Produz um `DecisaoProgressao` que define o envelope seguro para os próximos treinos.

### Modified Capabilities

- `fc-limiar-zones`: sem alteração de requisitos — não afetado.

## Impact

- **`PlanoServiceImpl`**: integra chamada ao `ProgressaoTreinoService` antes da geração; amplia janela de histórico passada ao `DadosPlanoDto`.
- **`PeriodizacaoPromptFormatter`**: recebe `DecisaoProgressao` e inclui estado, limites de volume/longão e motivo no prompt.
- **`TreinoRealizadoRepository`**: reutiliza `findByAtletaAndDataTreinoGreaterThanEqualOrderByDataTreinoDesc` já existente.
- **`DadosPlanoDto`**: adiciona campo `decisaoProgressao` (ou recebe o resumo como parâmetro do formatter).
- **`TsbServiceImpl`**: `recalcularSemanasProgressao` permanece inalterado; `semanasProgressaoContinua` continua como sinal auxiliar.
- Sem breaking changes de API REST.

## Critérios de aceite

**CA1 — Decisão de progressão calculada antes da geração do plano:**
- Given: atleta com >= 3 treinos realizados nos últimos 21 dias, aderência >= 80%, 2+ longões no período e TSB > -15
- When: coach solicita geração do plano semanal
- Then: `PlanoServiceImpl` chama `ProgressaoTreinoService`, obtém `EstadoProgressao.PROGREDIR`, e o prompt enviado à IA contém o bloco de progressão com `ajusteVolumePercentual > 0`

**CA2 — Fallback gracioso com histórico insuficiente:**
- Given: atleta novo com menos de 3 treinos nos últimos 21 dias
- When: geração de plano é solicitada
- Then: `ProgressaoTreinoService.calcularDecisao` retorna `EstadoProgressao.MANTER` com motivo "histórico insuficiente"; plano é gerado normalmente; nenhuma exceção é lançada

**CA3 — Fallback gracioso quando serviço falha:**
- Given: `ProgressaoTreinoService` lança exceção inesperada durante cálculo
- When: `PlanoServiceImpl` tenta calcular a decisão
- Then: exceção é capturada, logada, e plano é gerado sem bloco de progressão; `PeriodizacaoPromptFormatter` aceita `DecisaoProgressao null` sem erro

**CA4 — Estado `REDUZIR` com atleta sobrecarregado:**
- Given: atleta com TSB < -22 (calculado via `TsbService`) ou aderência < 60% nos últimos 21 dias
- When: geração de plano é solicitada
- Then: `EstadoProgressao` retornado é `REDUZIR` e o prompt indica ao modelo que deve reduzir volume

**CA5 — RPE ausente não bloqueia cálculo:**
- Given: atleta com treinos realizados que não têm `percepcaoEsforco` preenchido
- When: `ProgressaoTreinoService.calcularHistorico` é chamado
- Then: campo `rpeMedioTreinosDuros` do `ProgressaoHistoricoResumo` fica nulo; decisão é tomada com base nos demais indicadores sem lançar exceção

**CA6 — Longão identificado por `TipoTreino.LONGO`:**
- Given: histórico do atleta contém treinos com `tipoTreino == LONGO`
- When: `calcularHistorico` é chamado
- Then: contagem de longões nas janelas de 7/21 dias reflete apenas treinos de tipo `LONGO` realizados; treinos de tipo diferente não contam como longão

## Métrica de sucesso

Proxy observável após deploy:
- **Redução de erros de progressão no prompt** (evidência qualitativa): o coach, ao revisar planos gerados após a change, deve encontrar menos instâncias de "plano propõe aumento agressivo para atleta que não treinou" ou "plano conservador para atleta em boa fase" — aferível via feedback no campo de revisão.
- **Proxy técnico**: em testes de integração, 100% dos planos gerados para perfis extremos (atleta consistente vs. atleta em baixa aderência) devem ter estado de progressão correspondente no prompt.

## Open Questions & Assumptions

### Resolvidas antes da implementação

| # | Pergunta | Resposta |
|---|----------|---------|
| OQ1 | Campo RPE em `TreinoRealizado`: existe `rpeMedio`? | **Resolvido:** o campo é `percepcaoEsforco` (Integer, 1-10). Usar em cálculo de RPE médio dos treinos duros. |
| OQ2 | Como identificar treinos-chave (longões)? | **Resolvido:** usar `TipoTreino.LONGO` para longões. Treinos duros para RPE: `INTERVALADO`, `TIRO`, `TEMPO_RUN`, `SUBIDA` (fatorImpacto >= 1.25). |
| OQ3 | Threshold de longão: distância ou tipo? | **Resolvido:** usar `TipoTreino.LONGO` como critério primário. O enum já carrega a semântica de "longa duração (>90min), Zona 2". |

### Abertas (não bloqueiam a implementação, mas devem ser decididas antes da task 2.7)

| # | Pergunta | Impacto |
|---|----------|---------|
| OQ4 | Thresholds de `PROGREDIR` vs `PROGREDIR_LEVE`: aderência >= 80% vs >= 70% — calibrados para amadores (3-5 treinos/semana)? | Define as regras de `calcularDecisao`. Usar os valores do `tasks.md` como ponto de partida; coach pode precisar de ajuste após feedback real. |
| OQ5 | `ajusteVolumePercentual` deve ser respeitado como limite duro pelo modelo ou como sugestão? | Define o framing do bloco no prompt. Recomendar como limite duro (ex.: "não exceder +6% de volume esta semana"). |

### Premissas assumidas

- `TreinoRealizadoRepository.findByAtletaAndDataTreinoGreaterThanEqualOrderByDataTreinoDesc` já tem índice em `atleta_id + data_treino` (confirmado pela entidade `TreinoRealizado` com `@Index`).
- `semanasProgressaoContinua` continua como sinal auxiliar e não é removido — esta change é aditiva.
- `ProgressaoTreinoService` não persiste nada — é cálculo stateless a cada geração de plano.
- O coach não verá o `EstadoProgressao` diretamente no UI nesta change (é sinal interno para a IA). Exibir ao coach é follow-up em change separada (`coach-encerrar-semana-ui` ou nova change).
