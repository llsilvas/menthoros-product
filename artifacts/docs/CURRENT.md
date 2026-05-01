# CURRENT Documentation Map

## Purpose

This file defines the current source-of-truth documents for Menthoros.
Anything not listed here should be treated as historical/supporting material unless explicitly referenced by an active OpenSpec change.

## Product and Contract (Primary)

- `menthoros-product/openspec/`:
  - `config.yaml`
  - `changes/<change-id>/*`
  - `specs/**/spec.md`
- `menthoros-product/adr/INDEX.md`
- `menthoros-product/adr/ADR-*.md`

## AI-first Operating Model (Primary)

- `menthoros-product/ai/prompts/01-bmad-produto.md`
- `menthoros-product/ai/prompts/02-openspec-contrato.md`
- `menthoros-product/ai/prompts/03-claude-planejamento.md`
- `menthoros-product/ai/prompts/04-claude-execucao.md`
- `menthoros-product/ai/prompts/05-superpowers-disciplina.md`
- `menthoros-product/ai/prompts/06-codex-revisao.md`
- `menthoros-product/ai/prompts/07-playwright-validacao.md`
- `menthoros-product/ai/prompts/08-pipeline-completo.md`
- `menthoros-product/ai/agent-baseline/CLAUDE_SETTINGS_BASELINE.json`
- `menthoros-product/ai/agent-baseline/README.md`

## Execution and Governance (Primary)

- Repository root:
  - `README.md`
  - `AGENTS.md`
  - `CLAUDE.md`
- Backend module:
  - `apps/menthoros-backend/README.md`
  - `apps/menthoros-backend/AGENTS.md`
  - `apps/menthoros-backend/CLAUDE.md`
- Frontend module:
  - `apps/menthoros-front/README.md`
  - `apps/menthoros-front/AGENTS.md`
  - `apps/menthoros-front/CLAUDE.md`

## Historical / Archive

- `menthoros-product/artifacts/docs/archive/`

Use for reference only. Do not treat archived docs as active source of truth unless linked by current OpenSpec work.

Last reviewed on: 2026-05-01
