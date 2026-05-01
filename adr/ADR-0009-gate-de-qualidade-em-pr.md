# ADR 0009 - Gate de qualidade em Pull Requests

## Status
Aceito

## Data
2026-05-01

## Decisores
Tech Lead, Arquiteto, Backend Lead, Frontend Lead

## Contexto
Embora o fluxo AI-first e OpenSpec estejam definidos, faltava um gate operacional padronizado no momento de PR para garantir evidência mínima de contrato, validação e revisão. Isso aumenta risco de merge com lacunas de qualidade.

## Opções consideradas
1. Template de PR com checklist obrigatório de qualidade
2. Processo informal baseado em revisão manual sem template
3. Validação apenas em CI sem checklist de contexto

## Decisão
Adotar gate de qualidade em PR via template obrigatório com os seguintes blocos:
- OpenSpec gate (`change-id`, `tasks.md`, atualização de spec quando aplicável)
- evidência de validação por módulo (`mvn test`, `npm test/build`)
- evidência Playwright para fluxos críticos
- gate de revisão (`GO/NO-GO` e findings)
- análise de impacto de contrato e riscos residuais

## Consequências
### Positivas
- Padronização de critérios mínimos antes de merge.
- Maior rastreabilidade entre change, implementação e validação.
- Redução de regressões por ausência de evidência.

### Negativas / Trade-offs
- Aumento de fricção para PRs pequenos.
- Exige disciplina do time para preencher evidências corretamente.

## Plano de revisão
Revisar em 3 meses com foco em:
- qualidade dos PRs (completude de evidências);
- tempo de revisão;
- regressões detectadas após merge.

## Referências
- `.github/PULL_REQUEST_TEMPLATE.md`
- `menthoros-product/openspec`
- `menthoros-product/ai/prompts/06-codex-revisao.md`
- `menthoros-product/ai/prompts/07-playwright-validacao.md`
