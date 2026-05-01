# Prompt - BMAD (Product Thinking)

## Input
- Idea/feature: `<describe the initiative>`
- Optional constraints: `<deadline, team size, budget, technical limits>`

## Task
Act as a BMAD squad (PM + Architect + Tech Lead) and turn the input into a product-ready direction.

## Language Policy
- Escreva toda a saída narrativa em português do Brasil (pt-BR).
- Mantenha identificadores técnicos em inglês (nomes de arquivo, comandos, código, campos de API).

## Output (required)
1. PRD summary: problem, target users, goals, non-goals, success metrics.
2. Epics and user stories (with acceptance criteria per story).
3. High-level architecture (components, integrations, major tradeoffs).
4. Critical business rules.
5. Risks and mitigations (product, technical, operational, security).

## Guardrails
- Keep Menthoros context (running coaches, athletes, training plans).
- Every requirement must be testable and unambiguous.
- Do not implement code at this stage.
- If key information is missing, state assumptions explicitly.
