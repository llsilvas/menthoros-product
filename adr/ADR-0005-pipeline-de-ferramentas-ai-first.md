# ADR 0005 - Pipeline de ferramentas AI-first no ciclo de desenvolvimento

## Status
Aceito

## Data
2026-05-01

## Decisores
Tech Lead, Product Manager, Arquiteto

## Contexto
O Menthoros utiliza múltiplas ferramentas de IA no desenvolvimento. Sem um pipeline explícito de responsabilidades, ocorrem sobreposição de papéis, lacunas de validação e inconsistência entre descoberta, contrato, implementação e revisão.

## Opções consideradas
1. Pipeline explícito por etapa com ferramenta responsável
2. Uso livre das ferramentas por preferência individual
3. Pipeline parcial apenas entre OpenSpec e implementação

## Decisão
Adotar pipeline AI-first obrigatório com papéis definidos por etapa:

1. BMAD -> pensar produto
2. OpenSpec -> definir contrato
3. Claude Code -> implementar
4. Superpowers -> disciplinar execução
5. Codex -> revisar e desafiar
6. Playwright -> validar comportamento real

## Consequências
### Positivas
- Redução de ambiguidades sobre responsabilidade por etapa.
- Melhor rastreabilidade de decisão até validação final.
- Maior previsibilidade de qualidade e governança de entrega.

### Negativas / Trade-offs
- Processo mais rígido para mudanças muito pequenas.
- Exige treinamento e aderência contínua do time.

## Plano de revisão
Revisar em 3 meses, avaliando:
- taxa de retrabalho entre etapas;
- tempo de entrega por change;
- incidência de regressões detectadas após merge.

## Referências
- `menthoros_ai_playbook.md`
- `menthoros-product/ai/prompts/08-pipeline-completo.md`
- `AGENTS.md`
- `CLAUDE.md`
