# Menthoros AI Development Playbook

## Visão Geral

BMAD → Produto  
OpenSpec → Contrato  
Claude Code → Implementação  
Superpowers → Disciplina  
Codex → Revisão  
Playwright → Validação  

---

## 1. BMAD (Produto)

### Quando usar
- Nova feature
- Estratégia
- Arquitetura alto nível

### Fluxo
Ideia → PRD → Épicos → Histórias → Arquitetura

### Prompt
Atue como time BMAD (PM + Arquiteto + Tech Lead)...
(Gerar PRD, épicos, histórias, regras, riscos, arquitetura)

---

## 2. OpenSpec (Contrato)

### Quando usar
- Antes de qualquer código

### Fluxo
BMAD → proposal → design → tasks → implementação

### Prompt
Crie uma change OpenSpec baseada no BMAD...

---

## 3. Claude Code (Execução)

### Fluxo
OpenSpec → plano → implementação → testes

### Prompt planejamento
Leia CLAUDE.md, AGENTS.md e OpenSpec...

### Prompt execução
Implemente apenas a próxima task...

---

## 4. Superpowers (Disciplina)

### Fluxo
Brainstorm → Plano → Execução → Testes → Review

### Prompt
Use Superpowers para executar esta feature...

---

## 5. Codex (Revisão)

### Quando usar
- Antes de commit/PR

### Prompt
Revise este código como Staff Engineer...

---

## 6. Playwright (Validação)

### Fluxo
Implementação → cenário → teste e2e

### Prompt
Gere testes Playwright para fluxo do treinador...

---

## Fluxo Completo

Ideia → BMAD → OpenSpec → Claude → Superpowers → Codex → Playwright → PR

---

## Regra de Ouro

Sem OpenSpec → não existe feature
