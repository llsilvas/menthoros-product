# ADR 0010 - Expansao do time de agentes AI autonomos e otimizacao de custo

## Status
Aceito

## Data
2026-07-29

## Decisores
Founder (Leandro), CPO Agent

## Contexto
O Menthoros opera 3 cron jobs autonomos (Radar, CPO Weekly, Radar Review) que cobrem o pipeline de inteligencia externa -> auditoria de produto -> sintese de tendencias. Cinco agentes definidos no AI Team operam apenas sob demanda (Knowledge Keeper, Staff Engineer, AI Architect, Training Scientist, Orchestrator), sem autonomia.

Dois gaps estruturais foram identificados na analise CPO de 2026-07-29:

1. **Vault stale entre sessoes manuais.** O Knowledge Keeper existe mas nunca roda automaticamente. O Vault (memoria de longo prazo de todos os agentes) so sincroniza quando alguem pede. Agentes leem docs desatualizados.

2. **Janela cega entre auditorias.** O CPO Weekly roda segunda-feira. Se algo trava na terca, so descobrimos na segunda seguinte (6 dias depois). Nao ha early warning system.

3. **Custo de LLM nao otimizado.** Os 3 crons existentes rodam em horarios que entram no inicio do pico US (12h UTC = 8am EST), aumentando latencia e probabilidade de retries. Jobs de baixa complexidade usam o mesmo modelo caro (DeepSeek V4 Pro) que jobs de analise estrategica.

## Opcoes consideradas
1. Manter 3 crons, acionar agentes manualmente (status quo)
2. Expandir para 5 crons com otimizacao de horario e modelo (recomendado)
3. Expandir para 7+ crons incluindo AI Quality Evaluator, Cost Monitor, Code Review

## Decisao
Expandir de 3 para 5 cron jobs autonomos (opcao 2), com as seguintes adicoes e otimizacoes:

### Novos agentes/crons

| Job | Schedule (BRT) | Skills | Modelo | Funcao |
|-----|---------------|--------|--------|--------|
| Knowledge Sync Diario | Diario 5h | knowledge-sync-menthoros | deepseek-chat (V3) | Sincronizacao Git -> Vault |
| Mid-Sprint Pulse | Quarta 8h | mid-sprint-pulse | deepseek-chat (V3) | Early warning de sprint |

### Otimizacao de horarios (todos os 5 jobs)

Motivo: DeepSeek (China, UTC+8) tem menor contencao entre 08:00-11:00 UTC (China fim de expediente, US madrugada, Europa moderado). Jobs movidos para essa janela.

| Job | Antes (UTC) | Depois (UTC) | Antes (BRT) | Depois (BRT) |
|-----|------------|-------------|------------|-------------|
| Knowledge Sync | 09:00 | 08:00 | 6h | 5h |
| Radar Menthoros | 10:00 | 09:00 | 7h | 6h |
| CPO Weekly | 12:00 | 11:00 | 9h | 8h |
| Mid-Sprint Pulse | 12:00 | 11:00 | 9h | 8h |
| Radar Review | 10:00 | 09:00 | 7h | 6h |

### Model tiering

| Complexidade | Modelo | Jobs | Economia estimada |
|-------------|--------|------|-------------------|
| Baixa (leitura, sumario, classificacao) | deepseek-chat (V3) | Knowledge Sync, Mid-Sprint Pulse | ~50% vs V4 Pro |
| Alta (analise estrategica, ROI, impacto) | deepseek-v4-pro | Radar, CPO Weekly, Radar Review | mantido |

### Pipeline resultante



## Consequencias

### Positivas
- Vault sincronizado diariamente (todos os agentes leem dados frescos)
- Early warning de quarta-feira reduz janela cega de 6 para 2 dias
- Custo de LLM reduzido em ~50pct nos 2 jobs mais frequentes (Sync: 30x/mes, Pulse: 4x/mes)
- Horarios em janela de baixa contencao reduzem latencia e retries
- Skill mid-sprint-pulse ja entregou valor no primeiro dry-run (5 alertas acionaveis)

### Negativas / Trade-offs
- 2 jobs a mais consomem tokens (embora com modelo mais barato)
- Mid-Sprint Pulse so funciona se SPRINTS.md for mantido atualizado (dependencia de processo humano)
- deepseek-chat (V3) pode ter qualidade inferior ao V4 Pro em edge cases de classificacao — monitorar

## Custo
- Tempo de implementacao: 0.5 dia (configuracao, sem codigo)
- Custo recorrente: ~34 execucoes/mes com V3 (Sync 30x + Pulse 4x)
- ROI do investimento: 2.4 (Mid-Sprint Pulse) + 3.6 (Knowledge Sync) — ambos "Fazer agora"

## Plano de revisao
Revisar em 30 dias (2026-08-29):
- O Mid-Sprint Pulse flaggou itens que o CPO Weekly teria perdido?
- O Knowledge Sync reduziu incidentes de "Vault stale"?
- O V3 manteve qualidade aceitavel nos jobs de classificacao?
- Ha novos candidatos a automacao (AI Quality Evaluator, Cost Monitor)?

## Referencias
- Skill: /opt/data/profiles/cpo/skills/product/mid-sprint-pulse/SKILL.md
- Cron jobs: c2cbcb8983bb, 02c08e4672e1 (novos); 35b710cd12a6, e30feaa1ccc5, f5dcd09390ef (atualizados)
- Docs: /knowledge/menthoros-vault/00-System/Hermes OS.md, Weekly Rituals.md
- Analise CPO: sessao 2026-07-29 (ROI scoring, Propostas novas)
