# Proposal: eval-progression-adherence-rollout

**Tamanho:** S · **Trilha:** Fast (só backend; medição + decisão + limpeza condicional de código já
existente, sem migration, sem contrato de API novo, sem risco de multi-tenancy)

## Status

- Proposta inicial (2026-10-01), abrindo a seção 3 (Pós-deploy) de `fix-progression-adherence-window`
  (arquivada em `changes/archive/2026-10/2026-10-01-fix-progression-adherence-window/`), que ficou
  deferida sem change própria.

## Why

`fix-progression-adherence-window` mudou a aderência usada pelo motor de progressão (janela de 3
semanas fechadas, só planejados devidos) atrás da flag
`menthoros.progressao.aderencia-devidos.enabled`, ligada em produção desde o merge do PR #155. O
gate de merge pré-deploy comparou a regra antiga × nova em dados reais do homelab e passou sem
bloqueio, mas isso é uma amostra pontual (5 atletas, 1 semana) — não confirma o efeito agregado em
produção ao longo do tempo. A métrica de sucesso definida no proposal original
(`specs/plan-progression/spec.md`) — taxa de aceitação sem edição de volume do plano semanal
(`WeekSuggestion`), 4 semanas antes vs. 4 depois do deploy — ainda não foi medida, e a flag segue
ligada indefinidamente sem decisão formal de mantê-la, desligá-la ou remover a regra antiga.

## What Changes

1. **Medir** a taxa de aceitação sem edição de volume do plano semanal (`PlanoSemanal` aprovado sem
   alteração do `volumePlanejadoKm` original gerado pela IA) em duas janelas de 4 semanas: as 4
   semanas imediatamente antes do deploy do PR #155 e as 4 semanas imediatamente depois, com n ≥ 20
   propostas aprovadas/rejeitadas em cada lado.
2. **Decidir**, pelo resultado da medição:
   - Queda > 5 p.p. em relação ao baseline (~60–65%) → desligar
     `menthoros.progressao.aderencia-devidos.enabled` (config, sem deploy de código) e registrar o
     achado; a regra antiga volta a valer até uma nova change investigar a causa.
   - Estável (sem queda > 5 p.p.) → prosseguir para a limpeza.
3. **Limpar** (só se a medição for estável): remover a flag
   `menthoros.progressao.aderencia-devidos.enabled`, o branch condicional dela em
   `ProgressaoTreinoServiceImpl` e os testes que exercitam exclusivamente a regra antiga (CA8), já
   que a regra nova passa a ser a única.

## Impact

- `ProgressaoTreinoServiceImpl` (remoção do branch da flag, só no caminho de limpeza).
- `application.yml`/propriedades de config (remoção de `menthoros.progressao.aderencia-devidos.enabled`).
- `ProgressaoTreinoServiceImplTest` (remoção dos testes da regra antiga/flag desligada — CA8).
- **Migration:** nenhuma. **Contrato de API:** nenhum. **Front:** nenhum.

## Critérios de aceite

- **CA1: medição com n mínimo**
  - **Given** as duas janelas de 4 semanas (antes/depois do deploy do PR #155)
  - **When** a consulta de aceitação sem edição de volume roda sobre `PlanoSemanal`
  - **Then** cada janela tem n ≥ 20 propostas aprovadas ou rejeitadas; se não tiver, a decisão fica
    registrada como "adiada" até acumular amostra suficiente, sem desligar nem limpar por falta de dado

- **CA2: gatilho de rollback por queda de aceitação**
  - **Given** a taxa pós-deploy cair mais de 5 p.p. em relação à taxa pré-deploy
  - **When** a decisão é tomada
  - **Then** a flag é desligada via config (sem deploy de código) e o achado é registrado no `tasks.md`

- **CA3: limpeza só com resultado estável**
  - **Given** a taxa pós-deploy não cair mais de 5 p.p.
  - **When** a decisão é tomada
  - **Then** a flag, o branch condicional e os testes da regra antiga são removidos, e
    `./mvnw clean verify` fica verde sem eles

## Métrica de sucesso

A própria medição é o artefato de saída desta change — não há métrica adicional além de CA1 confirmar
n ≥ 20 em cada janela e CA2/CA3 cobrirem os dois desfechos possíveis.

## Open Questions & Assumptions

1. **Como "aprovado sem edição de volume" é identificado no schema hoje?** `PlanoSemanal` não tem um
   campo dedicado tipo "aprovado sem edição" — `volumePlanejadoKm` é o volume no momento da geração;
   não há snapshot explícito do volume no momento da aprovação se um treino individual for editado
   depois (via `TreinoPlanejadoServiceImpl`) antes do coach aprovar. Assume-se que comparar
   `volumePlanejadoKm` da geração com o volume recalculado a partir dos `TreinoPlanejado` vigentes no
   momento da aprovação é equivalente a "sem edição de volume" — a confirmar na implementação, com o
   mesmo cuidado de fuso/data usado em `fix-progression-adherence-window` (D1/D2).
2. **Baseline ~60–65% e teto de 5 p.p.** vêm do proposal original, sem recalibração nesta change.
3. Se a amostra pós-deploy ainda não tiver n ≥ 20 no momento da execução desta change (depende de
   quando ela for retomada em relação ao merge do PR #155 em 2026-10-01), a tarefa 1 fica bloqueada
   até completar a janela — não é motivo para pular a medição.

## Riscos e mitigações

- **Decidir com amostra insuficiente** (MÉDIO se ignorado): uma decisão de manter/desligar a flag
  baseada em n < 20 pode ser ruído, não sinal. Mitigação: CA1 trava a decisão até n ≥ 20 nas duas
  janelas.
- **Remover a regra antiga antes de confirmar estabilidade** (MÉDIO se ignorado): perderia o caminho
  de rollback rápido por flag caso um problema apareça depois da limpeza. Mitigação: CA3 só limpa
  depois de CA1/CA2 confirmarem o resultado estável.

## Non-goals

- Recalibrar os limiares de aderência (60/70/80%) ou o teto de pendência (25%) — já fechados como
  fora de escopo em `fix-progression-adherence-window`.
- Investigar a causa de uma eventual queda de aceitação além de desligar a flag — fica para uma change
  nova se CA2 disparar.

## Referências

- `openspec/changes/archive/2026-10/2026-10-01-fix-progression-adherence-window/tasks.md` (seção 3,
  origem desta change)
- `openspec/specs/plan-progression/spec.md` (requirement "Rollback por flag")
- `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/services/impl/ProgressaoTreinoServiceImpl.java`
- `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/entity/PlanoSemanal.java`
  (`volumePlanejadoKm`, `reviewStatus`, `origemAprovacao`)
