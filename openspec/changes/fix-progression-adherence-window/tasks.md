# Tasks — fix-progression-adherence-window

Branch `feature/fix-progression-adherence-window` no backend. Depende de `fix-adherence-count-until-today`
(PR #154, **mergeado em `develop` em 2026-10-01**) — reusa a consulta com teto de data
(`findComRealizadoByAtletaAndPeriodoAteData`); o predicado de "devido" é novo, construído nesta change
(task 1.7).

## 1. Backend

**Ordem corrigida (achado do spec-reviewer, rodada 2):** 1.2 depende do predicado de 1.3 — a sequência
abaixo constrói o predicado antes de usá-lo na classificação.

- [ ] 1.1 `ProgressaoHistoricoResumo`: `treinosRealizados21d`, `treinosCumpridos`, `treinosFaltas`, `treinosPendentes`, `aderencia` (nullable) (D6)
- [ ] 1.2 Construir o predicado de "planejado devido" (exclui `DESCANSO`) local a `calcularHistorico` — não
  existe hoje nenhum predicado compartilhado com o painel para reusar (correção da DoR 2026-10-01)
  - verify: CA9 — teste isolado do predicado, cobrindo os casos de CA1–CA5
- [ ] 1.3 `calcularHistorico`: carregar `Atleta` (para `AtletaHojeResolver`) dentro do serviço sem mudar a
  assinatura pública (`UUID atletaId`); janela de 3 semanas fechadas no fuso do atleta; classificação por
  planejado usando `contaNaCarga()` (cumprido vs. vínculo cancelado) e `reconciliationStatus` +
  `reconciledBy != "SYSTEM"` (pendência vs. falta por triagem humana) (D1, D2, predicado de 1.2)
  - verify: `ProgressaoTreinoServiceImplTest` — CA1 (em cada dia da semana), CA2, CA3, CA4, CA5, CA7,
    CA10 (vínculo cancelado), CA11 (triagem humana via `reconciledBy`), CA12 (`NAO_PLANEJADO` automático
    continua pendente)
- [ ] 1.4 `calcularDecisao`: tabela com aderência ausente, avaliada só depois do gate de histórico mínimo
  já existente (D3)
  - verify: CA6; bordas 59/60/69/70/79/80% com aderência presente
- [ ] 1.5 Flag `menthoros.progressao.aderencia-devidos.enabled` (D7)
  - verify: CA8 — flag desligada reproduz a regra antiga nos casos existentes
- [ ] 1.6 Um histórico por geração: propagar `ProgressaoHistoricoResumo` do `PlanGenerationContextLoader`
  até o `PlannerShadowService` (mesmo caminho já usado para `DecisaoProgressao`), em vez de o shadow
  recalcular por conta própria (D5)
  - verify: teste do loader/shadow com o mesmo instante e o mesmo resumo
- [ ] 1.7 Inventariar e reconstruir fixtures do construtor do resumo (planner, golden set, shadow); revisar expectativas semanticamente (ex.: `semVinculoAtletaFicaSemProgressao`)
- [ ] 1.8 Validação: `./mvnw clean verify`

## 2. Gate de merge (D4) — antes do PR
- [ ] 2.1 Comparação antiga × nova, atletas ativos do homelab, sexta/sábado/domingo: todas as transições com motivo; atletas com pendência e peso. **Não bloqueia** a transição só porque extras pararam de inflar (efeito esperado de CA3) — ver critério completo no proposal.
  - verify: nenhuma transição em direção a REDUZIR causada por pendência mal classificada ou semana em curso; mudanças sem causa ≤ 20% (senão, change de recalibração antes de ligar a flag). Resultado registrado aqui.

## 3. Pós-deploy
- [ ] 3.1 Aceitação sem edição de volume do `WeekSuggestion`: 4 semanas antes vs. 4 depois, n ≥ 20 em cada lado; queda > 5 p.p. → desligar a flag
- [ ] 3.2 Após 4 semanas estáveis: change de limpeza removendo a flag e a regra antiga

## Follow-ups
- Expor ao coach o motivo da decisão de progressão e a aderência usada (product-reviewer)
