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
- `score_tempo` (calculado por diferença de data no timezone do atleta — Design D13)
  - mesma data (0 dias): 1.0
  - 1 dia de diferença: 0.75
  - 2 dias de diferença: 0.50
  - > 2 dias: 0.0

  **Justificativa**: sincronização incremental opera com granularidade **diária**; score por horas requereria `start_date` com hora exata do Strava no MVP, informação não garantida no campo `dataTreino` (`LocalDate`, sem hora). Abordagem por dias é robusta para ciclo diário e timezone-normalizado.
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

## D15: Frontend Review Interface Specification

### Overview

A interface de revisão permite que o **treinador** visualize atividades sincronizadas que não foram auto-vinculadas (`AMBIGUO` ou `NAO_PLANEJADO`) e execute ações manuais de reconciliação.

**Atores:** Treinador de assessoria (autenticado, com acesso ao tenant)

**Objetivos:**
- Listar atividades pendentes de revisão por atleta
- Revisar candidatos de vínculo para casos ambíguos
- Executar ações: vincular manualmente, marcar como não planejado, desfazer vínculos incorretos
- Manter auditoria completa de cada intervenção

### D15.1: Screen Structure - "Atividades Pendentes"

#### Layout Principal
```
┌─────────────────────────────────────────────────────┐
│ Atividades Pendentes de Revisão                     │
├─────────────────────────────────────────────────────┤
│ Filtros: [Atleta ▼] [Status ▼] [Data ▼] [Buscar]  │
├─────────────────────────────────────────────────────┤
│ Tabela:                                             │
│ ┌─────┬────────┬──────────┬──────┬──────┬────────┐ │
│ │Data │Atleta  │Atividade │Tipo  │Dist. │Ação    │ │
│ ├─────┼────────┼──────────┼──────┼──────┼────────┤ │
│ │5/3  │João    │Corrida   │FÁCIL │10km  │Revisar │ │ (status: AMBIGUO)
│ │5/3  │Maria   │Ciclismo  │-     │25km  │Revisar │ │ (status: NAO_PLANEJADO)
│ └─────┴────────┴──────────┴──────┴──────┴────────┘ │
└─────────────────────────────────────────────────────┘
```

#### Cards Expandíveis (por atividade)
Ao clicar "Revisar", expande para:
```
┌──────────────────────────────────────────┐
│ AMBIGUO - João Silva - 5/3/2026          │
├──────────────────────────────────────────┤
│ Atividade Real:                          │
│ • Data: 5/3/2026                         │
│ • Tipo: Corrida (FÁCIL)                  │
│ • Distância: 10.2 km                     │
│ • Duração: 1h 05min                      │
│ • Fonte: Strava (ID: strava_12345)       │
├──────────────────────────────────────────┤
│ Candidatos de Vínculo (Score):           │
│ ☐ [0.75] Corrida fácil (seg, 5/3) - 10km│
│ ☐ [0.65] Corrida moderada (ter, 4/3)    │
├──────────────────────────────────────────┤
│ Ações:                                   │
│ [Vincular] [Marcar Não Planejado] [Fechar]
└──────────────────────────────────────────┘
```

### D15.2: API Endpoints (Backend Responsibility)

#### 1. Listar atividades pendentes por atleta
```
GET /api/v1/reconciliation/atletas/{atletaId}/pendentes
Query params: ?status=AMBIGUO,NAO_PLANEJADO&dataInicio=2026-05-01&dataFim=2026-05-31&sortBy=data&order=desc

Response: 200 OK
{
  "data": [
    {
      "id": "uuid-activity-1",
      "externalId": "strava_12345",
      "dataTreino": "2026-05-03",
      "tipoTreino": "FÁCIL",
      "distanciaKm": 10.2,
      "duracaoMin": 65,
      "reconciliationStatus": "AMBIGUO",
      "reconciliationScore": 0.75,
      "fonte": "STRAVA",
      "atletaId": "uuid-joao",
      "atletaNome": "João Silva"
    }
  ],
  "pagination": {
    "total": 5,
    "page": 1,
    "pageSize": 20
  }
}
```

#### 2. Obter candidatos de vínculo para atividade AMBIGUO
```
GET /api/v1/reconciliation/{treinoRealizadoId}/candidatos

Response: 200 OK
{
  "atividadeId": "uuid-activity-1",
  "status": "AMBIGUO",
  "candidatos": [
    {
      "treino_planejado_id": "uuid-plan-1",
      "data": "2026-05-03",
      "tipoTreino": "FÁCIL",
      "distanciaKm": 10.0,
      "duracaoMin": 60,
      "score": 0.75,
      "scoreBreakdown": {
        "scoreTempora": 1.0,
        "scoreDuracao": 0.8,
        "scoreDistancia": 0.5
      }
    },
    {
      "treino_planejado_id": "uuid-plan-2",
      "data": "2026-05-04",
      "tipoTreino": "CONTINUO",
      "distanciaKm": 12.0,
      "duracaoMin": 70,
      "score": 0.65,
      "scoreBreakdown": {
        "scoreTempora": 0.75,
        "scoreDuracao": 0.7,
        "scoreDistancia": 0.6
      }
    }
  ]
}
```

#### 3. Executar ação de reconciliação
```
POST /api/v1/reconciliation/{treinoRealizadoId}/acao

Content-Type: application/json
{
  "action": "VINCULAR_MANUALMENTE",  // ou "MARCAR_NAO_PLANEJADO" ou "DESFAZER_VINCULO"
  "treinoPlanejadoId": "uuid-plan-1",  // obrigatório para VINCULAR_MANUALMENTE
  "reasonText": "Atleta confirmou que é este treino"  // opcional
}

Response: 200 OK
{
  "atividadeId": "uuid-activity-1",
  "reconciliationStatus": "VINCULADO_MANUAL",
  "treinoPlanejadoId": "uuid-plan-1",
  "reconciliationScore": 0.75,
  "reconciledAt": "2026-05-03T10:50:00Z",
  "reconciledBy": "USER:uuid-treinador"
}

Response: 400 Bad Request
{
  "status": 400,
  "error": "Bad Request",
  "message": "Não é possível vincular a um treino de outro atleta"
}
```

#### Header obrigatório de tenant
Todos os endpoints de reconciliação manual exigem `X-Tenant-ID` (UUID).

Quando ausente:

```json
{
  "status": 400,
  "error": "Bad Request",
  "message": "Header obrigatório ausente: X-Tenant-ID"
}
```

### D15.3: Frontend State Management

#### Data Structure in Frontend State
```typescript
interface PendingActivityReview {
  id: string;
  externalId: string;
  atletaId: string;
  atletaNome: string;
  dataTreino: string;  // ISO date
  tipoTreino: string;
  distanciaKm: number;
  duracaoMin: number;
  reconciliationStatus: "AMBIGUO" | "NAO_PLANEJADO";
  reconciliationScore: number | null;
  fonte: "STRAVA";
  
  // UI State
  isExpanded: boolean;
  candidates?: CandidateMatch[];
  selectedCandidateId?: string;  // para AMBIGUO
  isSubmitting: boolean;
  error?: string;
}

interface CandidateMatch {
  treinoPlanejadoId: string;
  data: string;
  tipoTreino: string;
  distanciaKm: number;
  duracaoMin: number;
  score: number;
  scoreBreakdown: {
    scoreTempora: number;
    scoreDuracao: number;
    scoreDistancia: number;
  };
}
```

### D15.4: User Workflows

#### Workflow 1: Revisar AMBIGUO e Vincular
```
1. Treinador acessa "Atividades Pendentes"
2. Sistema mostra lista com AMBIGUO + NAO_PLANEJADO
3. Treinador clica "Revisar" em atividade AMBIGUO
4. Frontend: GET /api/v1/reconciliation/{id}/candidatos
5. Sistema exibe card com candidatos ranqueados por score
6. Treinador seleciona o candidato correto
7. Treinador clica "Vincular"
8. Frontend: POST /api/v1/reconciliation/{id}/acao
   {
     "action": "VINCULAR_MANUALMENTE",
     "treinoPlanejadoId": "uuid-selecionado"
   }
9. Backend valida, persiste, retorna novo estado
10. Frontend atualiza lista, marca atividade como VINCULADO_MANUAL
11. Toast/alert: "✓ Atividade vinculada com sucesso"
```

#### Workflow 2: Marcar como Não Planejado
```
1. Treinador revisa atividade (AMBIGUO ou NAO_PLANEJADO)
2. Confirma que atividade é extra/não planejada
3. Clica "Marcar como Não Planejado"
4. Frontend: POST /api/v1/reconciliation/{id}/acao
   {
     "action": "MARCAR_NAO_PLANEJADO",
     "reasonText": "Treino extra do atleta, não estava no plano"
   }
5. Backend persiste, atualiza status para NAO_PLANEJADO
6. Frontend remove da lista pendentes
```

#### Workflow 3: Desfazer Vínculo Incorreto
```
1. Treinador visualiza atividade vinculada (VINCULADO_AUTOMATICO ou VINCULADO_MANUAL)
2. Nota que vínculo está incorreto
3. Clica "Desfazer"
4. Frontend: POST /api/v1/reconciliation/{id}/acao
   {
     "action": "DESFAZER_VINCULO",
     "reasonText": "Erro ao vincular, tipo de treino diferente"
   }
5. Backend volta status para AMBIGUO (com novos candidatos) ou NAO_PLANEJADO
6. Atividade volta para fila de revisão
```

### D15.5: Frontend Validation Rules

#### Validações obrigatórias
- **VINCULAR_MANUALMENTE:**
  - `treinoPlanejadoId` deve estar presente
  - Treino planejado deve pertencer ao mesmo atleta
  - Não é permitido vincular ao mesmo treino planejado múltiplas vezes
  
- **MARCAR_NAO_PLANEJADO:**
  - Nenhuma validação além de autorização (mesmo tenant)
  
- **DESFAZER_VINCULO:**
  - Atividade deve estar em estado `VINCULADO_AUTOMATICO` ou `VINCULADO_MANUAL`

#### Feedback ao usuário (Frontend)
- ✅ Sucesso: Toast verde, remove da lista ou atualiza status
- ❌ Erro: Modal ou snackbar vermelho com mensagem clara
  - "Treino planejado pertence a outro atleta"
  - "Atividade já está vinculada a este treino"
  - "Erro ao conectar com servidor (retry automático em 5s)"

### D15.6: Filtros e Busca

#### Filtros Disponíveis
```
- Status: [Ambiguo] [Não Planejado] (checkboxes multi-select)
- Atleta: [Dropdown com lista de atletas do tenant]
- Data: [Data Início] - [Data Fim] (range picker)
- Fonte: [Strava] (por enquanto apenas)
```

#### Ordenação Padrão
- Primary: `dataTreino DESC` (mais recentes primeiro)
- Secondary: `reconciliationStatus` (AMBIGUO antes de NAO_PLANEJADO)

#### Busca Textual
- Campo de busca por nome do atleta ou `externalId`

### D15.7: Error Handling and Edge Cases

#### Cenários de Erro
```
1. Atleta desconectou do Strava entre sincronização e revisão
   → Aviso ao usuário: "Dados podem estar desatualizados"

2. Treino planejado foi deletado
   → Candidato desaparece da lista
   → Mensagem: "Treino planejado foi removido"

3. Outra instância reconciliou a atividade enquanto era revista
   → Aviso: "Atividade foi reconciliada por outro usuário"
   → Reload automático da lista

4. Timeout na chamada POST
   → Retry automático 3x com backoff exponencial
   → Após 3 falhas, exibir modal com opção de retry manual
```

### D15.8: Accessibility & Performance

#### Accessibility
- ARIA labels em botões de ação
- Tabindex correto para navegação por teclado
- Suporte a leitores de tela para status de reconciliação

#### Performance
- Lazy load de imagens de atleta
- Paginação: 20 itens por página (carregamento on-demand)
- Cache local de candidatos enquanto card expandido (até 5 min ou ao fechar)
- Debounce em filtros: 500ms antes de disparar GET

#### Load Time Targets
- Time to First Paint: < 2s
- GET /pendentes com 20 itens: < 500ms
- GET /candidatos: < 300ms
- POST /reconciliation/{id}/acao: < 1s
