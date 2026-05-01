# ADR 0002 - OpenSpec como gate obrigatório de feature

## Status
Aceito

## Data
2026-05-01

## Decisores
Tech Lead, Product Manager, Arquiteto

## Contexto
O time Menthoros opera em modelo AI-first com múltiplos agentes e risco de implementação prematura sem alinhamento de contrato. Sem uma etapa formal antes do código, há aumento de retrabalho, divergência funcional e regressões de comportamento.

## Opções consideradas
1. OpenSpec obrigatório antes de qualquer feature
2. OpenSpec opcional por criticidade
3. Implementação direta com documentação posterior

## Decisão
Adotar OpenSpec como gate obrigatório para qualquer feature ou mudança de comportamento.

Justificativa:
- Garante contrato explícito antes de implementação.
- Reduz ambiguidade entre produto, engenharia e revisão.
- Permite rastreabilidade clara entre requisito, spec, task e código.

## Consequências
### Positivas
- Maior previsibilidade e menor retrabalho.
- Melhor qualidade de revisão técnica e funcional.
- Histórico auditável de decisões e mudanças de comportamento.

### Negativas / Trade-offs
- Aumento de lead time inicial para mudanças pequenas.
- Exige disciplina de manutenção contínua dos artefatos.

## Plano de revisão
Revisar em 3 meses, avaliando:
- tempo médio de entrega por change;
- taxa de retrabalho pós-implementação;
- incidentes por ausência/baixa qualidade de spec.

## Referências
- `menthoros-product/openspec`
- `menthoros-product/ai/prompts/02-openspec-contrato.md`
- `AGENTS.md`
- `CLAUDE.md`
