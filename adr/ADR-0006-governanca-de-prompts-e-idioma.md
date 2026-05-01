# ADR 0006 - Governança de prompts e política de idioma

## Status
Aceito

## Data
2026-05-01

## Decisores
Tech Lead, Product Manager, AI Enablement Lead

## Contexto
Prompts são parte central da operação AI-first do Menthoros. Sem padronização, surgem respostas inconsistentes, perda de contexto e dificuldades de colaboração entre áreas técnica e produto. Também havia mistura de idioma que dificultava consumo por stakeholders locais.

## Opções consideradas
1. Prompt library oficial versionada com política de idioma
2. Prompts ad-hoc por usuário
3. Biblioteca sem regra de idioma

## Decisão
Adotar governança formal de prompts em `menthoros-product/ai/prompts` com:
- estrutura padrão (`Input`, `Task`, `Output`, `Rules/Guardrails`);
- versionamento via Git;
- política de idioma: saída narrativa em pt-BR e identificadores técnicos em inglês.

## Consequências
### Positivas
- Consistência de execução entre agentes e times.
- Melhor auditabilidade e reuso de prompts.
- Comunicação mais clara para stakeholders de produto e engenharia.

### Negativas / Trade-offs
- Necessidade de manutenção contínua da biblioteca.
- Custo inicial de curadoria e revisão de prompts.

## Plano de revisão
Revisar em 3 meses com base em:
- taxa de reuso dos prompts oficiais;
- incidentes de ambiguidade operacional;
- feedback de clareza/qualidade das saídas.

## Referências
- `menthoros-product/ai/prompts`
- `menthoros_ai_playbook.md`
- `menthoros-product/adr/ADR_TEMPLATE.md`
