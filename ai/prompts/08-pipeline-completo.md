# Prompt - Menthoros End-to-End Pipeline

## Input
- Feature request: `<describe feature>`

## Task
Execute the full pipeline in sequence, with objective evidence at each phase.

## Language Policy
- Escreva toda a saída narrativa em português do Brasil (pt-BR).
- Mantenha identificadores técnicos em inglês (nomes de arquivo, comandos, código, campos de API).

## Tool Roles
- BMAD -> product thinking
- OpenSpec -> contract definition
- Claude Code -> implementation
- Superpowers -> execution discipline
- Codex -> critical review
- Playwright -> real behavior validation

## Required Sequence
1. BMAD: PRD + epics + stories + risks.
2. OpenSpec: `proposal` + `design` + `tasks` + `spec` deltas.
3. Claude Code: implement one task at a time.
4. Superpowers: enforce checkpoints and done criteria.
5. Codex: issue `GO/NO-GO` with findings.
6. Playwright: validate critical e2e flows.

## Progression Rules
- Do not skip phases.
- Each phase must produce objective evidence before moving on.
- Without OpenSpec, there is no feature.
