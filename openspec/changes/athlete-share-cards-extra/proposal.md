# athlete-share-cards-extra — Recorde, Nota do treinador, Rumo à prova e instrumentação

**Tamanho:** S · **Trilha:** Full
**Status:** proposta — **bloqueada** por `athlete-share-data` e `athlete-share-cards`
**Criado:** 2026-11-08
**Repos afetados:** `apps/menthoros-front`

> Fatia saída do DoR de `athlete-share-cards` (2026-11-08). Referência visual: canvas
> "Compartilhar treino — cards sociais", v2 · Kinetic (Recorde, Nota do treinador, Rumo à prova).

## Escopo

1. **Recorde** (feed): disponível quando o melhor esforço aponta para o treino aberto; tempo em
   destaque e diferença para a marca anterior.
2. **Nota do treinador** (story): só com nota publicável do treinador para o treino.
3. **Rumo à prova** (story): dias para a prova-alvo, semana do ciclo, curva de CTL e projeção —
   **atribuição Garmin** do agregado depende de saber se o PMC tem contribuição Garmin (DoR do
   núcleo: o PMC não traz proveniência); resolver no DoR desta change (proveniência no backend ou
   atribuição conservadora sempre que o atleta tiver conexão Garmin ativa).
4. **Logo real** na assinatura (blob do endpoint liberado em `athlete-share-data`).
5. **Instrumentação:** evento de compartilhamento a cada card gerado/compartilhado.

## Métrica de sucesso

Cards compartilhados por atleta ativo por semana e % com assinatura ligada, medidos pelo evento.
Critério de parada da trilha (ver `add-activity-gps-trace`): < 10% dos atletas ativos com ≥ 1 card
em 8 semanas após o núcleo em produção → `athlete-share-cards-mapa` não entra.
