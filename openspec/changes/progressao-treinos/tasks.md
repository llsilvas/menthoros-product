## 1. DTOs e Enum de Progressão

- [x] 1.1 Criar enum `EstadoProgressao` em `enums/` com valores `PROGREDIR`, `PROGREDIR_LEVE`, `MANTER`, `REDUZIR`
- [x] 1.2 Criar record `ProgressaoHistoricoResumo` em `dto/` com campos de volume (7d/21d/42d), TSS, aderência, longões, RPE, CTL/ATL/TSB e semanasProgressaoContinua
- [x] 1.3 Criar record `DecisaoProgressao` em `dto/` com estado, ajusteVolumePercentual, ajusteLongoMinutos, permitirProgressaoIntensidade e motivo

## 2. ProgressaoTreinoService

- [x] 2.1 Criar interface `ProgressaoTreinoService` com métodos `calcularHistorico(UUID atletaId)` e `calcularDecisao(ProgressaoHistoricoResumo resumo)`
- [x] 2.2 Criar `ProgressaoTreinoServiceImpl` com injeção de `TreinoRealizadoRepository`, `TreinoPlanejadoRepository` (fonte de treinos planejados para aderência) e `PlanoMetadadosService` (fonte de TSB/CTL/rampRate via `buscarOuCriarMetadados`)
- [x] 2.3 Implementar `calcularHistorico`: buscar treinos dos últimos 42 dias via `findByAtletaAndDataTreinoGreaterThanEqualOrderByDataTreinoDesc`, calcular janelas de 7/21/42 dias
- [x] 2.4 Implementar cálculo de aderência 21d: `treinosConcluidos21d / treinosPlanejados21d`; `treinosConcluidos21d` vem de `TreinoRealizadoRepository.findByAtletaAndDataTreinoBetween`; `treinosPlanejados21d` vem de `TreinoPlanejadoRepository.findComRealizadoByAtletaAndPeriodo`; quando `treinosPlanejados21d = 0` retornar aderência 0.0 (atleta sem plano → fallback MANTER via task 2.8)
- [x] 2.5 Implementar identificação de longões: usar `TipoTreino.LONGO` como critério exclusivo (conforme OQ3 resolvida); nenhum threshold numérico adicional
- [x] 2.6 Implementar cálculo de RPE médio dos treinos duros (tipos `INTERVALADO`, `TIRO`, `TEMPO_RUN`, `SUBIDA` com fatorImpacto >= 1.25, conforme OQ2 resolvida), com fallback gracioso quando `percepcaoEsforco` for nulo
- [x] 2.7 Implementar `calcularDecisao`: thresholds OQ4 confirmados — PROGREDIR: aderência >= 80%, 2+ longões, RPE <= 7.5, TSB > -15; PROGREDIR_LEVE: aderência >= 70%, TSB > -22; MANTER: demais; REDUZIR: TSB < -22 ou aderência < 60% ou RPE > 8.5
- [x] 2.8 Garantir fallback `MANTER` quando `treinosConcluidos21d < 3` ou dados insuficientes

## 3. Testes Unitários do Serviço

- [x] 3.1 Testar `calcularHistorico` com atleta com histórico completo (42 dias de treinos)
- [x] 3.2 Testar `calcularHistorico` com atleta sem treinos (novo atleta) — sem exceção, campos zerados
- [x] 3.3 Testar `calcularDecisao` → `PROGREDIR` (aderência >= 80%, 2+ longões, RPE <= 7.5, TSB > -15)
- [x] 3.4 Testar `calcularDecisao` → `PROGREDIR_LEVE` (aderência >= 70%, TSB entre -15 e -22)
- [x] 3.5 Testar `calcularDecisao` → `MANTER` (aderência entre 60-70% ou longão oscilante)
- [x] 3.6 Testar `calcularDecisao` → `REDUZIR` (aderência < 60%, TSB < -22, ou RPE > 8.5)
- [x] 3.7 Testar fallback `MANTER` com histórico insuficiente (< 3 treinos em 21 dias)
- [x] 3.8 Testar que semana boa isolada não vence histórico ruim de 42 dias

## 4. Ampliar Histórico no Fluxo de Geração

- [x] 4.1 Em `PlanoServiceImpl.prepararDadosPlano`, substituir `LIMITE_TREINOS_HISTORICO = 7` por `JANELA_HISTORICO_DIAS = 42` com `findByAtletaIdAndDataTreinoBetween`
- [x] 4.2 Verificar que `DadosPlanoDto.ultimosTreinos()` continua com o mesmo tipo de lista (sem breaking change de contrato) — tipo preservado, 7 stubs de teste atualizados

## 5. Integração no Fluxo de Geração de Plano

- [x] 5.1 Em `PlanoServiceImpl`, chamar `progressaoTreinoService.calcularHistorico` e `calcularDecisao` antes da chamada à IA
- [x] 5.2 Tratar exceção em `calcularDecisao` com try-catch: logar erro e continuar geração sem `DecisaoProgressao` (fallback gracioso)
- [x] 5.3 Passar `DecisaoProgressao` para `PeriodizacaoPromptFormatter`: como o formatter é chamado DENTRO de `iaService.geraPlanoSemanalAvancado`, é necessário também atualizar a assinatura de `geraPlanoSemanalAvancado` para aceitar `DecisaoProgressao` como parâmetro adicional; alternativa: adicionar parâmetro em `gerarPlanoSemanal(DadosPlanoDto, ModoGeracaoPlano)` e passar para o IA service

## 6. Atualizar PeriodizacaoPromptFormatter

- [x] 6.1 Adicionar método (ou sobrecarga) que recebe `DecisaoProgressao` e a inclui no bloco de periodização do prompt
- [x] 6.2 Incluir no prompt: estado de progressão, ajuste máximo de volume (% formatado), instrução sobre longão e motivo
- [x] 6.3 Garantir que quando `DecisaoProgressao` é `null` (fallback), o formatter funciona como antes sem erro

## 7. Testes de Integração

- [ ] 7.1 Testar que geração de plano para atleta consistente (mock de histórico) inclui estado `PROGREDIR` no prompt
- [ ] 7.2 Testar que geração de plano para atleta com TSB muito negativo inclui estado `REDUZIR` no prompt
- [ ] 7.3 Testar que falha no `ProgressaoTreinoService` não impede geração do plano (plano gerado sem bloco de progressão)
- [ ] 7.4 Validar manualmente 5 gerações com históricos sintéticos (um por `EstadoProgressao` + fallback) antes do deploy — confirmar que o plano resultante é coerente com o estado (QA de prompt, não automatizado)

## 8. Follow-up comprometido (fora do escopo desta change — registrar como débito)

Estes itens não são implementados nesta change mas precisam ter sprint-alvo definido para evitar que o valor do `motivo` seja perdido:

- [ ] 8.1 *(Sprint 15 ou pós-`llm-code-switching`)* Surfacing do `motivo` ao coach no `CoachPlanReviewPage`: badge ou painel lateral exibindo `Estado: REDUZIR | TSB: -24 | Motivo: "sobrecarga acumulada"` para que o coach entenda o contexto do plano sem editar no escuro.
- [ ] 8.2 *(Sprint 15)* Log estruturado da `DecisaoProgressao` em formato recuperável: evento com `atletaId`, `semanaInicio`, `estado`, `ajusteVolumePercentual` e `motivo` — correlacionável futuro com ações do coach (aprovação/edição/rejeição) para calibração de thresholds e `rag-coach-methodology-personalization`.
