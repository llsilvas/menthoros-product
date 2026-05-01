## Context

Este change cobre a etapa pós-onboarding: sincronização diária de atividades Strava e reconciliação com treinos planejados.

Pré-condição: atleta já conectado ao Strava e com bootstrap inicial tratado por `strava-async-import`.

## Goals

- Sincronizar atividades novas do Strava no ciclo diário
- Comparar realizado com planejado no dia alvo
- Vincular automaticamente quando houver match confiável
- Sinalizar ambiguidades e não correspondências para revisão do treinador

## Non-Goals

- Importação histórica de 90 dias (fora deste change)
- Webhook/hard real-time obrigatório nesta fase
- Alterar geração de plano neste change

## Reconciliation Flow

```text
Strava Activity (dia D)
        |
        v
Buscar TreinoPlanejado do atleta (janela D-1 a D+1)
        |
        +--> 0 candidatos --> status: NAO_PLANEJADO
        |
        +--> 1 candidato forte --> status: VINCULADO_AUTOMATICO
        |
        +--> N candidatos / baixa confiança --> status: AMBIGUO
```

## Matching Strategy

### D1: Janela temporal controlada

- Candidatos por atleta dentro da janela de data (`D-1` a `D+1`)
- Mesmo tenant sempre obrigatório

### D2: Score de correspondência (v1)

Fórmula inicial:

```text
score_total = 0.45*score_tempo + 0.35*score_duracao + 0.20*score_distancia
```

Pré-filtro obrigatório:
- mesmo atleta e mesmo tenant
- tipo de treino compatível (incompatibilidade forte descarta candidato)

Subscores (0..1):
- `score_tempo`
  - diferença <= 2h: 1.0
  - diferença <= 6h: 0.7
  - diferença <= 12h: 0.4
  - diferença > 12h: 0.1
- `score_duracao` (erro relativo `abs(real-plan)/plan`)
  - <= 10%: 1.0
  - <= 20%: 0.8
  - <= 35%: 0.5
  - > 35%: 0.2
- `score_distancia` (erro relativo `abs(real-plan)/plan`)
  - <= 10%: 1.0
  - <= 20%: 0.8
  - <= 35%: 0.5
  - > 35%: 0.2

Decisão por limiar:
- `score >= 0.80`: `VINCULADO_AUTOMATICO`
- `0.50 <= score < 0.80`: `AMBIGUO`
- `score < 0.50`: `NAO_PLANEJADO`

Regra de empate:
- Se diferença entre top1 e top2 for `< 0.10`, classificar como `AMBIGUO`.

### D3: Idempotência e deduplicação

- Deduplicar ingestão por `externalId + atletaId`
- Reprocessamento diário não pode criar vínculos duplicados

### D4: Estados de reconciliação

- `VINCULADO_AUTOMATICO`
- `AMBIGUO`
- `NAO_PLANEJADO`
- `VINCULADO_MANUAL` (quando treinador corrige)

### D5: Auditabilidade

Persistir metadado mínimo de reconciliação:
- candidato escolhido (quando houver)
- score final
- razão principal da decisão
- timestamp da decisão

## Manual Reconciliation Contract (v1)

### D6: Ações manuais suportadas

- `VINCULAR_MANUALMENTE`: treinador escolhe um `TreinoPlanejado` para um `TreinoRealizado` pendente
- `MARCAR_NAO_PLANEJADO`: treinador confirma que a atividade foi extra e não tem correspondente
- `DESFAZER_VINCULO`: treinador remove um vínculo manual/automático incorreto, retornando para pendência

### D7: Validações obrigatórias

- treinador só pode agir em dados do mesmo tenant
- `TreinoRealizado` alvo deve existir e pertencer ao atleta esperado
- `TreinoPlanejado` escolhido deve pertencer ao mesmo atleta
- não permitir múltiplos `TreinoRealizado` vinculados ao mesmo `TreinoPlanejado` quando regra de domínio exigir unicidade
- mudanças manuais devem ser idempotentes (repetição do mesmo comando não cria efeito duplicado)

### D8: Auditoria da intervenção humana

Cada ação manual deve registrar:
- `actorId` (quem executou)
- `actionType` (`VINCULAR_MANUALMENTE`, `MARCAR_NAO_PLANEJADO`, `DESFAZER_VINCULO`)
- `beforeState` e `afterState`
- `beforePlannedId` e `afterPlannedId` (quando aplicável)
- `reasonCode` e `reasonText` opcional
- `occurredAt`

## Persistence Model (v1)

### D9: Estado atual no `TreinoRealizado`

Persistir o estado atual da reconciliação diretamente em `TreinoRealizado` para leitura rápida operacional:
- `reconciliationStatus` (enum)
- `plannedTreinoId` (nullable)
- `reconciliationScore` (nullable)
- `reconciliationReasonCode` (nullable)
- `reconciledAt` (nullable)
- `reconciledBy` (nullable; `SYSTEM` ou `USER:{id}`)

Objetivo:
- consultas de tela/listagem sem join obrigatório com histórico
- decisão atual sempre disponível em uma linha

### D10: Histórico imutável em tabela de eventos

Criar tabela dedicada, ex.: `tb_treino_reconciliacao_evento`, com append-only:
- `id`
- `tenant_id`
- `treino_realizado_id`
- `action_type`
- `before_status`, `after_status`
- `before_planned_id`, `after_planned_id`
- `score`
- `reason_code`, `reason_text`
- `actor_id`
- `occurred_at`

Regras:
- nunca atualizar/deletar eventos (somente inserir)
- cada transição relevante gera 1 evento
- reprocessamento idempotente não cria evento duplicado para mesma transição

### D11: Índices e constraints mínimas

- índice por `(tenant_id, treino_realizado_id, occurred_at desc)` em eventos
- índice por `(tenant_id, reconciliation_status)` em `TreinoRealizado`
- constraint de integridade para `plannedTreinoId` pertencer ao mesmo atleta/tenant (via regra de aplicação + validação transacional)

### D12: Trigger Strategy (MVP)

Estratégia híbrida no MVP:
- `scheduler` incremental diário como caminho principal de atualização
- `manual on-demand` por atleta para suporte operacional e urgências

Evolução planejada:
- webhook/event-driven após término de treino para latência near-real-time
- manter `scheduler` como fallback permanente

### D13: Timezone Oficial de Reconciliação

- Timezone de referência para comparação de data e janela (`D-1..D+1`): timezone do atleta
- Fallback obrigatório quando timezone do atleta estiver ausente: `America/Sao_Paulo`
- Antes do cálculo de score, normalizar `start_date` Strava e `data_treino_planejado` para a timezone de referência

### D14: Amostra Inicial para Qualidade de Matching

- Para validar falso positivo do auto-vínculo, usar amostra inicial de 200 atividades reconciliadas automaticamente
- Distribuição mínima da amostra:
  - pelo menos 3 assessorias (tenants)
  - pelo menos 30 atletas
  - pelo menos 14 dias corridos de operação
- A medição de `falso positivo <= 2%` deve usar revisão humana cega em relação ao score

## Risks

- Falso positivo de vínculo automático
- Ambiguidade frequente em atletas com múltiplos treinos no dia
- Diferenças de timezone afetando janela de data
- Correções manuais sem rastreabilidade adequada

## Mitigations

- Limiar conservador para auto-vínculo
- Fallback para revisão manual quando confiança baixa
- Normalização de timezone antes de comparar
- Auditoria obrigatória para qualquer override manual

## Quality Targets (MVP)

- Precisão do auto-vínculo: falso positivo <= 2% em casos `VINCULADO_AUTOMATICO`
- Taxa de ambiguidade: `AMBIGUO` <= 25% das atividades reconciliáveis
- Cobertura automática diária: >= 70% com decisão sem intervenção humana (`VINCULADO_AUTOMATICO` ou `NAO_PLANEJADO`)
- Latência operacional (scheduler): p95 <= 5 min entre atividade disponível no Strava e reconciliação persistida
- Latência operacional (manual): p95 <= 1 min para reconciliação persistida após disparo
- Integridade de deduplicação: 0 duplicatas por `externalId + atletaId`
- Integridade de auditoria: 100% das ações manuais com trilha completa
- Saúde de sync diário: taxa de falha técnica < 3% (com retry)
