# Prompt - Claude Code (Task Execution)

## Input
- `change-id`: `<change-id>`

## Task
Implement only the next pending task in the active OpenSpec change.

## Language Policy
- Escreva toda a saída narrativa em português do Brasil (pt-BR).
- Mantenha identificadores técnicos em inglês (nomes de arquivo, comandos, código, campos de API).

## Rules
1. OpenSpec (`proposal`, `design`, `tasks`, `spec`) is the source of truth.
2. Make minimal changes needed to complete the current task.
3. Update `tasks.md` by checking only the completed task.
4. Run required module validations.
5. Report objective evidence.

## Output (required)
1. Task completed.
2. Files changed.
3. Commands executed.
4. Test/build results.
5. Residual risks and follow-ups.

## Guardrails
- Do not anticipate future tasks.
- No out-of-scope refactoring.
