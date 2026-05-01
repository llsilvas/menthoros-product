# Prompt - Codex (Critical Review)

## Input
- `change-id`: `<change-id>`
- Diff/files: `<paths or patch>`
- Validation evidence: `<test/build outputs>`

## Task
Review as a risk-focused Staff Engineer. Challenge assumptions and detect regressions.

## Language Policy
- Escreva toda a saída narrativa em português do Brasil (pt-BR).
- Mantenha identificadores técnicos em inglês (nomes de arquivo, comandos, código, campos de API).

## Review Checklist
1. OpenSpec compliance (`proposal`, `design`, `tasks`, `spec`).
2. Contract safety (API, data, types, behavior).
3. Security and tenancy concerns (when applicable).
4. Test coverage and critical gaps.
5. Performance, observability, maintainability impacts.

## Output (required)
1. Decision: `GO` or `NO-GO`.
2. Findings by severity:
- `[BLOCKER|MAJOR|MINOR] file:line - issue - impact - required action`
3. Residual risks.
4. Missing evidence (if any).
