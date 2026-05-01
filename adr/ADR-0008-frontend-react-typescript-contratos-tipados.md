# ADR 0008 - Frontend React + TypeScript com contratos tipados

## Status
Aceito

## Data
2026-05-01

## Decisores
Frontend Lead, Tech Lead, Arquiteto

## Contexto
O frontend do Menthoros integra com APIs em evolução contínua. Sem contratos tipados explícitos, aumentam drift com backend, regressões de UI e inconsistência entre módulos. Também havia risco de duplicação de tipos de domínio em múltiplos pontos do front.

## Opções consideradas
1. React + TypeScript com contratos tipados obrigatórios
2. Tipagem parcial com `any` em integrações rápidas
3. Tipos locais por feature sem governança

## Decisão
Adotar React + TypeScript com política obrigatória de contratos tipados:
- Proibir consumo de resposta de API sem tipagem explícita.
- Evitar duplicação de tipos de domínio quando já existir tipo canônico.
- Centralizar acesso de dados em hooks/services quando aplicável.

## Consequências
### Positivas
- Redução de drift entre frontend e backend.
- Menor incidência de regressões por mismatch de contrato.
- Melhor manutenção e refatoração assistida por tipos.

### Negativas / Trade-offs
- Maior esforço inicial para evolução de contratos.
- Dependência de disciplina na atualização de tipos.

## Plano de revisão
Revisar em 6 meses, observando:
- bugs de integração FE/BE;
- quantidade de hotfixes por erro de contrato;
- tempo de adaptação em mudanças de API.

## Referências
- `apps/menthoros-front/CLAUDE.md`
- `apps/menthoros-front/AGENTS.md`
- `apps/menthoros-front/src`
