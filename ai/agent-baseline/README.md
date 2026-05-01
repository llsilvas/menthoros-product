# Agent Baseline Configuration

## Purpose

This baseline prevents configuration drift between backend and frontend Claude environments.

## Baseline File

- `CLAUDE_SETTINGS_BASELINE.json`

## Required Capabilities

- `superpowers` plugin enabled
- `playwright` MCP server configured via `npx @playwright/mcp@latest`

## How to Apply

1. Compare module settings with baseline:
   - `.claude/settings.json` (repo root)
   - `apps/menthoros-front/.claude/settings.json`
2. Keep differences only when they are module-specific and intentional.
3. Document intentional divergences in module notes or PR description.

Last reviewed on: 2026-05-01
