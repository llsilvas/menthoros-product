# Prompt - Playwright (Real Behavior Validation)

## Input
- User flow: `<coach/athlete flow>`
- Optional env URL: `<base-url>`

## Task
Generate and/or execute Playwright validation for the real user behavior.

## Language Policy
- Escreva toda a saída narrativa em português do Brasil (pt-BR).
- Mantenha identificadores técnicos em inglês (nomes de arquivo, comandos, código, campos de API).

## Required Coverage
1. Primary scenario.
2. Alternate paths.
3. States: success, error, empty, loading.
4. Critical backend integration effects in UI.

## Quality Rules
- Tests must be deterministic, readable, and stable.
- Prefer resilient selectors and explicit assertions.
- Avoid brittle timing assumptions.

## Output (required)
1. Scenarios covered.
2. Test files created/changed.
3. Execution results (pass/fail).
4. Evidence (logs/screenshots/traces when relevant).
