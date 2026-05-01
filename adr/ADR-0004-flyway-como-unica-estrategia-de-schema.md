# ADR 0004 - Flyway como única estratégia de evolução de schema

## Status
Aceito

## Data
2026-05-01

## Decisores
Backend Lead, DBA/Platform Engineer, Arquiteto

## Contexto
O backend Menthoros evolui rapidamente e depende de consistência entre ambientes local, CI e produção. Mudanças manuais de schema e alteração de migrations já aplicadas geram drift e risco de incidentes.

## Opções consideradas
1. Flyway obrigatório com migrations versionadas imutáveis
2. Mudanças manuais controladas + scripts eventuais
3. Ferramenta alternativa de migration sem padrão definido

## Decisão
Adotar Flyway como única forma permitida de evolução de schema no backend.

Justificativa:
- Versionamento explícito e reproduzível.
- Redução de drift entre ambientes.
- Melhor rastreabilidade e rollback operacional planejado.

## Consequências
### Positivas
- Maior confiabilidade de deploy.
- Histórico claro de mudanças estruturais no banco.
- Compatibilidade direta com pipeline de build/teste atual.

### Negativas / Trade-offs
- Curva de disciplina para equipe em alterações rápidas.
- Maior rigor no desenho de migrations para evitar retrabalho.

## Plano de revisão
Revisar em 6 meses com foco em:
- falhas de deploy por migration;
- tempo médio de execução de migrations;
- necessidade de ajustes em estratégia de rollback.

## Referências
- `apps/menthoros-backend/src/main/resources/db/migration`
- `apps/menthoros-backend/AGENTS.md`
- `apps/menthoros-backend/CLAUDE.md`
