# Prompt - Claude Code (Implementation Planning)

## Input
- `change-id`: `<change-id>`

## Task
Plan implementation for the next pending task only.

## Language Policy
- Escreva toda a saída narrativa em português do Brasil (pt-BR).
- Mantenha identificadores técnicos em inglês (nomes de arquivo, comandos, código, campos de API).

## Mandatory Context
Read and follow:
- Root/module `CLAUDE.md`
- Root/module `AGENTS.md`
- OpenSpec artifacts in `menthoros-product/openspec/changes/<change-id>`

## Output (required)
1. Current task selected and why.
2. Files to change and purpose of each change.
3. Risks and validation strategy.
4. Contract impact check (API, types, migrations, UI behavior).
5. Short step-by-step execution plan.

## Guardrails
- Do not execute tasks beyond the next pending one.
- Do not expand scope.
- State assumptions explicitly when context is incomplete.
