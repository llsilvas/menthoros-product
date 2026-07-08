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
- **`DadosPlanoDto`**: sem alteração — `DecisaoProgressao` é passado diretamente ao `PeriodizacaoPromptFormatter` como parâmetro avulso (conforme D5 do design.md), sem adicionar campo ao DTO.
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

**CA7 — Estado `PROGREDIR_LEVE` com atleta em adaptação parcial:**
- Given: atleta com aderência >= 70% (< 80%) nos últimos 21 dias e TSB entre -15 e -22
- When: coach solicita geração do plano semanal
- Then: `ProgressaoTreinoService.calcularDecisao` retorna `EstadoProgressao.PROGREDIR_LEVE` e o prompt enviado à IA contém instrução de progressão moderada com `ajusteVolumePercentual` entre 0 e o threshold de `PROGREDIR`; plano é gerado normalmente sem exceção

## Métrica de sucesso

**Métrica primária (observável em produção):** taxa de planos aprovados sem edição de volume/longão pelo coach, segmentada por `EstadoProgressao`, medida nas primeiras 4 semanas de uso em produção.

- Baseline implícito: taxa atual de edições de volume na fase de revisão (coletar antes do deploy via analytics de aprovação).
- Sinal de sucesso: quando `EstadoProgressao = PROGREDIR`, o coach não aumenta o volume (aceitou o plano como proposto); quando `EstadoProgressao = REDUZIR`, o coach não aumenta o volume.
- Sinal de falha: coach edita sistematicamente em direção oposta ao estado calculado → thresholds precisam de calibração.

**Proxy técnico (Gates):** testes de integração (Task 7) devem cobrir 100% dos planos gerados com estado de progressão correto no prompt para os quatro estados.

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
| OQ4 | Thresholds de `PROGREDIR` vs `PROGREDIR_LEVE`: aderência >= 80% vs >= 70% — calibrados para amadores (3-5 treinos/semana)? | Define as regras de `calcularDecisao`. Usar os valores do `tasks.md` como ponto de partida conservador; coach pode precisar de ajuste após feedback real. |
| OQ5 | `ajusteVolumePercentual` deve ser respeitado como limite duro pelo modelo ou como sugestão? | Define o framing do bloco no prompt. Recomendar como limite duro (ex.: "não exceder +6% de volume esta semana"). |
| OQ6 | Calibração de thresholds — de onde vêm os números e como validar? | Os valores atuais (TSB < -22, aderência >= 80%, RPE > 8.5) são estimativas conservadoras da literatura de treinamento para atletas de performance, **não calibrados empiricamente** para amadores. Risco identificado: aderência 80% pode ser alto demais para amadores típicos (65–75% estrutural por logística). Plano de observação: nas primeiras 4 semanas de produção, monitorar distribuição de `EstadoProgressao` e taxa de edição inversa pelo coach; se > 30% das edições contrariarem o estado calculado, revisar thresholds. |
| OQ7 | Hierarquia de precedência entre `DecisaoProgressao` e `calcularProgressaoSegura` no prompt quando os dois divergem? | Decidido em D7 do `design.md`: `calcularProgressaoSegura` (teto fisiológico de CTL/rampRate) é o limitador absoluto de segurança; `DecisaoProgressao` opera dentro desse teto como recomendação de direção. O prompt deve deixar explícita a hierarquia. |

### Premissas assumidas

- `TreinoRealizadoRepository.findByAtletaAndDataTreinoGreaterThanEqualOrderByDataTreinoDesc` já tem índice em `atleta_id + data_treino` (confirmado pela entidade `TreinoRealizado` com `@Index`).
- `semanasProgressaoContinua` continua como sinal auxiliar e não é removido — esta change é aditiva.
- `ProgressaoTreinoService` não persiste nada — é cálculo stateless a cada geração de plano.
- O coach não verá o `EstadoProgressao` diretamente no UI nesta change (é sinal interno para a IA). Exibir ao coach é follow-up em change separada (`coach-encerrar-semana-ui` ou nova change).
