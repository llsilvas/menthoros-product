# ADR 0007 - Backend em Spring Boot com arquitetura em camadas

## Status
Aceito

## Data
2026-05-01

## Decisores
Arquiteto, Backend Lead, Tech Lead

## Contexto
O backend do Menthoros precisa manter consistência de manutenção, legibilidade e onboarding para novos desenvolvedores. Sem limites claros de responsabilidade por camada, o código tende a concentrar lógica em controllers, dificultando testes e evolução.

## Opções consideradas
1. Spring Boot com arquitetura em camadas (`controller/service/repository`)
2. Arquitetura sem separação rígida de responsabilidades
3. Arquitetura modular por feature sem padrão base comum

## Decisão
Adotar Spring Boot com arquitetura em camadas e regras explícitas:
- `controller`: transporte HTTP, serialização, validação de entrada e resposta.
- `service`: regras de negócio e orquestração.
- `repository`: acesso e persistência de dados.

Regras complementares:
- Validação por DTO com Bean Validation (`@Valid`, constraints explícitas).
- Erros de API padronizados com `ProblemDetail`.

## Consequências
### Positivas
- Maior previsibilidade estrutural do código.
- Melhor testabilidade por separação de responsabilidades.
- Onboarding mais rápido por convenções claras.

### Negativas / Trade-offs
- Mais boilerplate em fluxos simples.
- Exige disciplina para evitar vazamento de regra de negócio para controllers.

## Plano de revisão
Revisar em 6 meses com foco em:
- tempo de onboarding de novos devs;
- taxa de regressões em endpoints;
- qualidade de cobertura de testes por camada.

## Referências
- `apps/menthoros-backend/CLAUDE.md`
- `apps/menthoros-backend/AGENTS.md`
- `apps/menthoros-backend/src/main/java`
