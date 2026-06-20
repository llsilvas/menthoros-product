# Proposal: athlete-profile-drilldown

**Tamanho:** M · **Trilha:** Full

## Status

Proposed

## Why

O shell do coach hoje tem um roster (grid de atletas com KPIs) e um calendário semanal da equipe. São visões de **equipe**. Mas toda decisão de treinamento é individual: o coach que vai gerar ou ajustar o plano da Ana precisa saber o CTL dela nos últimos 90 dias, quantas semanas seguidas ela aderiu ao plano, qual é a prova alvo, se a fila de atenção disparou algum sinal recentemente, e o que a IA sugeriu da última vez.

Hoje esse contexto não existe em lugar nenhum no sistema — o coach busca de memória, de planilha, ou vai pro WhatsApp perguntar. O resultado é decisão mais lenta, mais rasa, e sem histórico.

O **perfil do atleta** é o "prontuário" — a tela que o coach abre antes de qualquer ação sobre aquele atleta. É o contexto que transforma o coach de "gerenciador de pendências" em "tomador de decisão informado". Sem ele, o valor das outras features (fila de atenção, inbox de sugestões, geração de plano) fica fragmentado: o coach vê os alertas mas não tem onde mergulhar.

O dado já existe: `add-athlete-progress-endpoints` (Sprint 5 ✅) entregou PMC, zonas, recordes, readiness e resumo. A fila de atenção ✅ e o inbox de sugestões ✅ já têm endpoints. Falta apenas **agregar e apresentar** esse contexto numa tela por atleta.

## What Changes

### Backend

- Novo endpoint agregador `GET /api/v1/coach/atletas/{atletaId}/perfil` — retorna em uma única chamada:
  - Dados cadastrais do atleta (nome, objetivo, prova alvo, nível, peso, foto se houver)
  - PMC dos últimos 90 dias (reusa `AtletaProgressoService`)
  - Aderência semanal das últimas 8 semanas (% treinos concluídos por semana)
  - Últimos 3 sinais de atenção ativos (da `CoachAttentionQueueService`, filtrado por `atletaId`)
  - Últimas 3 sugestões (da `SugestaoCoachService`, filtrado por `atletaId`, qualquer status)
  - Plano vigente resumido: semana atual (7 sessões com tipo/volume/status de execução)
  - Recordes pessoais (top 3 distâncias)
- O endpoint agrega chamadas internas (sem N+1 via HTTP) e retorna `AtletaPerfilCoachOutputDto` (record).
- `@RequireTenant` no método + validação que o `atletaId` pertence ao tenant do coach.

### Frontend

- Nova rota `/coach/athletes/:atletaId` → `CoachAthleteProfilePage`.
- Navegação: clicar em qualquer linha do roster (`CoachAthletesPage`) navega para o perfil.
- Layout da página:

  **Cabeçalho (sticky):** avatar + nome + objetivo + prova alvo + fase do ciclo (se disponível) + botão "Gerar Plano" e "Ver Conversa".

  **Bloco 1 — Fitness (PMC):** gráfico de linha CTL/ATL/TSB dos últimos 90 dias. Eixo x: datas. Linha CTL (azul), ATL (laranja), TSB (verde/vermelho). Usa o `PMCChart` existente se disponível.

  **Bloco 2 — Aderência:** 8 semanas em barras horizontais. Cada barra = % de treinos concluídos naquela semana. Verde ≥ 80%, amarelo 50–79%, vermelho < 50%.

  **Bloco 3 — Plano mais recente:** 7 cards compactos (seg→dom) com tipo de treino, volume previsto e status de execução. O bloco exibe o plano mais recente do atleta — com badge de status que diferencia:
  - **Plano aprovado vigente** → cards normais com status de execução
  - **Plano aguardando revisão** → "Plano gerado aguardando revisão" + botão "Revisar" (→ `/coach/planos/revisao`)
  - **Sem plano** → "Nenhum plano gerado" + botão "Gerar Plano" (→ `/coach/plans/generate?atletaId=...`)

  **Bloco 4 — Sinais e Sugestões recentes (2 colunas):**
  - Esquerda: últimos 3 sinais da fila de atenção (severidade + motivo + data + badge "Sugestão gerada" se houver sugestão associada).
  - Direita: últimas 3 sugestões do inbox (tipo + status + data + botão "Ver").

  **Bloco 5 — Recordes:** distâncias (5k, 10k, 21k, 42k) com tempo e data. Ausente se não registrado.

- Botão "← Voltar para equipe" no cabeçalho.

## Capabilities

### New Capabilities

- `athlete-profile-drilldown`: visão consolidada por atleta para tomada de decisão do coach — fitness, aderência, plano vigente, sinais e sugestões recentes, recordes.

### Modified Capabilities

- `coach-shell-dashboards`: roster ganha link clicável por atleta para o perfil (alteração no `CoachAthletesPage`).

## Impact

**Backend:**
- Novo endpoint `GET /api/v1/coach/atletas/{atletaId}/perfil`.
- Novo DTO record `AtletaPerfilCoachOutputDto` com sub-records aninhados.
- Sem novas tabelas — agrega dados já persistidos.
- Mapper `AtletaPerfilCoachMapper` (null-safe por contrato).

**Frontend:**
- Nova página `CoachAthleteProfilePage`.
- `CoachAthletesPage`: cada linha do DataGrid ganha `onRowClick` → `navigate('/coach/athletes/:id')`.
- Reutiliza `PMCChart` (se existir no codebase), `SeverityChip`, `SuggestionTypeBadge`, `CoachAthleteAvatar`.
- Hook `useAthleteProfile(atletaId)` com fetch único no endpoint agregador.

**Dependências:**
- Requer `add-athlete-progress-endpoints` ✅ (PMC, readiness, recordes — já existem).
- Requer `add-coach-attention-queue` ✅ (sinais de atenção — já existe).
- Requer `add-coach-suggestion-inbox` ✅ (sugestões — já existe).
- Independente de `first-party-ingestion` — bloco de aderência mostra "sem dados" graciosamente se não houver treinos registrados.
- `coach-plan-review-workflow` complementa: botão "Gerar Plano" no cabeçalho do perfil dispara o fluxo de geração → revisão.

**Multi-tenancy:**
- Endpoint valida que `atletaId` pertence ao tenant via `TenantValidationRepository`.
- Coach do tenant A não acessa perfil de atleta do tenant B (403/404).

## Critérios de Aceite

**CA1 — Navegação do roster para o perfil:**
- Given: coach está na página `/coach/athletes`
- When: clica na linha da atleta Ana
- Then: navega para `/coach/athletes/{idAna}` e carrega o perfil dela

**CA2 — PMC carregado para 90 dias:**
- Given: Ana tem treinos registrados nos últimos 90 dias
- When: página carrega
- Then: gráfico PMC exibe CTL, ATL e TSB com dados dos 90 dias; eixo x com datas corretas

**CA3 — Aderência semanal exibida:**
- Given: Ana tem plano com 5 sessões/semana há 8 semanas e fez 4 na última semana
- When: página carrega
- Then: barra da última semana exibe 80% em verde

**CA4 — Plano aprovado exibido:**
- Given: existe plano aprovado para Ana (vigente ou mais recente)
- When: página carrega
- Then: 7 cards exibem os treinos com tipo e volume; sessões realizadas marcadas como tal; badge "Aprovado" no cabeçalho do bloco

**CA4b — Plano aguardando revisão:**
- Given: Ana tem plano gerado mas ainda não aprovado (`reviewStatus = AGUARDANDO_REVISAO`)
- When: página carrega
- Then: bloco exibe "Plano gerado aguardando revisão" + botão "Revisar"

**CA5 — Sem plano gerado é tratado graciosamente:**
- Given: Ana não tem nenhum plano gerado
- When: página carrega
- Then: bloco de plano exibe "Nenhum plano gerado para esta semana" com botão "Gerar Plano"

**CA6 — Sinais e sugestões recentes aparecem:**
- Given: Ana teve sinal FADIGA ontem e sugestão RECOVERY aprovada há 2 dias
- When: página carrega
- Then: bloco de sinais exibe "Fadiga — ontem"; bloco de sugestões exibe "Recuperação — Aprovada — há 2 dias"

**CA7 — Isolamento cross-tenant:**
- Given: coach do tenant A tenta acessar `/coach/atletas/{idDeAtletaDoTenantB}/perfil`
- Then: resposta 403 ou 404

**CA8 — Carregamento único (sem cascata de requests):**
- Given: página do perfil abre
- When: devtools de rede abertos
- Then: exatamente 1 chamada `GET /api/v1/coach/atletas/{id}/perfil` (não múltiplos endpoints separados)

## Métrica de Sucesso

**Primária:** tempo entre abrir o perfil e disparar a próxima ação (gerar plano, abrir conversa, aprovar sugestão) < 90 segundos — o perfil entrega contexto suficiente para decidir rápido. Instrumentar via evento de navegação no frontend.

**Secundária:** coach acessa o perfil de pelo menos 1 atleta por sessão de uso — indica que a tela virou parte do fluxo natural, não um acidente de navegação.

## Open Questions & Assumptions

**Premissas assumidas (verificar antes de implementar — ver Seção 0 do tasks.md):**
- `PMCChart` aceita `data: PMCDataPoint[]` como prop pura sem fetch interno — **verificar tasks.md 0.1**.
- `TreinoRealizado` tem FK `treinoPlanejadoId` que permite join direto — **verificar tasks.md 0.2**. Alternativa: match por atleta+data (heurística frágil).
- `TreinoExecucaoStatus` não tem valor `PLANEJADO` — valores reais a usar: `PENDENTE`, `REALIZADO/CONCLUIDO`, `PERDIDO/PARCIAL` — **confirmar tasks.md 0.3**.
- `SugestaoCoachService.listar(status)` retorna lista de tamanho gerenciável em memória (não ilimitada) — **verificar tasks.md 0.4**.
- v1 sem edição inline no perfil — é uma tela de leitura e navegação; ações (gerar plano, conversar) redirecionam para as telas próprias. Perfil claramente read-only (tooltip ou texto auxiliar).
- `AtletaProgressService` resolve tenant via `TenantContext` internamente — não passar `tenantId` como parâmetro.

**Em aberto:**
- Foto/avatar do atleta: `CoachAthleteAvatar` usa iniciais — manter assim no v1.
- "Fase do ciclo" no cabeçalho: depende de `add-macrociclo-structure` (não entregue). Ocultar campo se não disponível.
- Histórico de lesões: fora do escopo do v1 — anotar como follow-up.
- Performance: sub-serviços em sequência no v1; se p95 > 1.5s em staging, migrar para `CompletableFuture.allOf` (documentado na Decisão de Performance do design.md).

## Riscos e Mitigações

| Risco | Prob | Mitigação no escopo |
|---|---|---|
| Aderência vazia: `TreinoRealizado` quasi-vazio pós-onboarding | Alta | Mostrar estado "sem dados" quando nenhuma semana tem `totalPlanejado > 0`; nunca exibir zeros silenciosos |
| `TreinoExecucaoStatus` sem valor `PLANEJADO` | Alta | Usar `PENDENTE`/`CONCLUIDO`/`PERDIDO` — verificar enum antes de implementar (tasks.md 0.3) |
| Filtro em memória de sinais corta atletas sem sinal no top-20 | Alta | Documentar limitação em campo `avisos`; evoluir para query por `atletaId` se volume crescer |
| Latência em sequência ultrapassa 1.5s em prod | Média | Log de duração por sub-serviço; frontend distingue timeout (504) de 404 |
| Plano vigente incorreto na virada de semana | Média | Filtro de data no JPQL, não em Java; `ORDER BY semanaInicio DESC LIMIT 1` |
| PMCChart incompatível com formato do novo endpoint | Média | Verificar props antes de implementar (tasks.md 0.1); criar wrapper se necessário |
| Coach espera edição inline e encontra somente leitura | Média | Deixar claro no cabeçalho que perfil é read-only; botão de edição aponta para tela existente ou desabilitado |
| Cross-tenant via sub-serviços (TenantContext não propagado) | Baixa | `verifyNoInteractions` nos mocks de sub-serviços no teste de cross-tenant |
