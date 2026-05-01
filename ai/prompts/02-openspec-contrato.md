# Prompt - OpenSpec (Contract Definition)

## Input
- BMAD output: `<paste BMAD result>`

## Task
Create an OpenSpec change that formalizes behavior before any code implementation.

## Language Policy
- Escreva toda a saída narrativa em português do Brasil (pt-BR).
- Mantenha identificadores técnicos em inglês (nomes de arquivo, comandos, código, campos de API).

## Output (required)
1. `change-id` in kebab-case.
2. `proposal.md` with scope, rationale, and expected outcomes.
3. `design.md` when technical decisions are non-trivial.
4. `tasks.md` with incremental, executable tasks.
5. `specs/**/spec.md` deltas for impacted capabilities.

## Quality Rules
- Traceability must be explicit: requirement -> spec -> task.
- Mark in-scope vs out-of-scope clearly.
- Highlight API/data contract impacts.
- Use testable language only (avoid vague wording).
- No coding until the change is complete enough to implement.

## Golden Rule
Without OpenSpec, there is no feature.
