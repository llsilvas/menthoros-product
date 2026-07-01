# PRD — Inbox Inteligente de Validações Pendentes

| Campo | Valor |
|-------|-------|
| **Projeto** | Menthoros |
| **Feature** | Inbox Inteligente de Validações Pendentes |
| **Versão do documento** | 1.0 |
| **Status** | Draft |
| **Data** | 01/07/2026 |
| **Autor** | Equipe de Produto Menthoros |

---

## 1. Visão Geral

O **Inbox Inteligente de Validações Pendentes** é uma central unificada onde os usuários responsáveis por aprovações (revisores, supervisores, gestores) encontram, priorizam e resolvem todos os itens que aguardam sua validação dentro do Menthoros.

Hoje, as validações pendentes ficam espalhadas por diferentes módulos e telas, obrigando o usuário a navegar manualmente para descobrir o que precisa de sua ação. Isso gera atrasos, itens esquecidos, gargalos operacionais e falta de visibilidade sobre o que é urgente.

Esta feature consolida tudo em um único ponto de entrada, com priorização inteligente, agrupamento contextual e ações rápidas — reduzindo o tempo entre "item criado" e "item validado".

---

## 2. Problema

- Validações pendentes estão dispersas em múltiplos módulos, sem um lugar único para vê-las.
- Não há critério claro de priorização: o usuário não sabe o que resolver primeiro.
- Itens críticos ou com prazo estourando passam despercebidos.
- Falta de contexto em cada item força o usuário a abrir várias telas para decidir.
- Ausência de métricas sobre volume, tempo de resposta e gargalos de aprovação.

---

## 3. Objetivos

### 3.1 Objetivos de Negócio
- Reduzir o tempo médio de resolução de validações (SLA de aprovação).
- Diminuir a quantidade de itens vencidos ou esquecidos.
- Aumentar a produtividade dos aprovadores.
- Dar visibilidade gerencial sobre gargalos no fluxo de validação.

### 3.2 Objetivos do Usuário
- Ver, em um só lugar, tudo que depende da sua ação.
- Saber imediatamente o que é mais urgente.
- Validar itens com o mínimo de cliques e trocas de contexto.

---

## 4. Métricas de Sucesso (KPIs)

| Métrica | Baseline | Meta |
|---------|----------|------|
| Tempo médio de resolução de uma validação | A medir | -30% |
| % de itens resolvidos dentro do SLA | A medir | >= 90% |
| % de itens vencidos por mês | A medir | <= 5% |
| Adoção do Inbox (aprovadores ativos/semana) | 0 | >= 80% |
| Nº médio de cliques para validar um item | A medir | <= 2 |

---

## 5. Personas

- **Revisor/Aprovador**: recebe itens para validar e precisa de agilidade e contexto.
- **Supervisor/Gestor**: acompanha o desempenho da equipe e os gargalos.
- **Solicitante**: quem cria itens que dependem de validação (usuário indireto, impactado pela velocidade do inbox).

---

## 6. Escopo

### 6.1 Dentro do Escopo (MVP)
- Listagem unificada de validações pendentes atribuídas ao usuário.
- Priorização inteligente (urgência, prazo, criticidade, tempo de espera).
- Agrupamento por tipo, origem, solicitante ou prazo.
- Filtros e busca.
- Ações rápidas: aprovar, rejeitar, solicitar ajustes, delegar.
- Ações em lote para itens similares.
- Painel de contexto com detalhes do item sem sair do inbox.
- Notificações de novos itens e itens próximos do vencimento.
- Contador de pendências (badge).

### 6.2 Fora do Escopo (MVP)
- Configuração customizável de regras de priorização pelo usuário final.
- Automação/IA para auto-aprovação de itens de baixo risco.
- Relatórios analíticos avançados (versão gerencial completa).
- Integrações externas (e-mail, Slack, Teams) além de notificação interna.

---

## 7. Requisitos Funcionais

### 7.1 Listagem e Priorização
- **RF01**: O sistema deve exibir todos os itens pendentes de validação atribuídos ao usuário logado.
- **RF02**: Cada item deve mostrar: tipo, origem/módulo, solicitante, data de criação, prazo/SLA, nível de urgência e resumo.
- **RF03**: O sistema deve ordenar os itens por um score de priorização inteligente que considere: proximidade do prazo, criticidade do item, tempo de espera e impacto.
- **RF04**: O usuário deve poder reordenar manualmente (por prazo, data, tipo, solicitante).

### 7.2 Agrupamento, Filtros e Busca
- **RF05**: O sistema deve permitir agrupar itens por tipo, origem, solicitante ou faixa de prazo.
- **RF06**: O sistema deve oferecer filtros (tipo, urgência, prazo, solicitante, status).
- **RF07**: O sistema deve oferecer busca por texto (título, solicitante, identificador).

### 7.3 Ações
- **RF08**: O usuário deve poder **aprovar** um item diretamente do inbox.
- **RF09**: O usuário deve poder **rejeitar** um item, informando um motivo obrigatório.
- **RF10**: O usuário deve poder **solicitar ajustes**, com comentário para o solicitante.
- **RF11**: O usuário deve poder **delegar** a validação para outro usuário autorizado.
- **RF12**: O sistema deve suportar **ações em lote** (aprovar/rejeitar múltiplos itens compatíveis).
- **RF13**: Toda ação deve registrar autor, data/hora e justificativa em trilha de auditoria.

### 7.4 Contexto e Detalhe
- **RF14**: Ao selecionar um item, o sistema deve exibir um painel de contexto com os detalhes necessários para a decisão, sem sair do inbox.
- **RF15**: O painel deve permitir acesso ao item completo em seu módulo de origem (link contextual).

### 7.5 Notificações e Contadores
- **RF16**: O sistema deve exibir um contador (badge) com o total de pendências do usuário.
- **RF17**: O sistema deve notificar o usuário sobre novos itens e itens próximos do vencimento.
- **RF18**: Após uma ação, o item deve sair do inbox em tempo real e atualizar o contador.

---

## 8. Requisitos Não Funcionais

- **RNF01 — Desempenho**: O inbox deve carregar a lista inicial em <= 2 segundos para até 500 itens.
- **RNF02 — Escalabilidade**: Deve suportar usuários com milhares de pendências via paginação/virtualização.
- **RNF03 — Segurança**: Um usuário só pode ver e agir sobre itens aos quais tem permissão.
- **RNF04 — Auditabilidade**: Todas as ações devem ser rastreáveis e imutáveis na trilha de auditoria.
- **RNF05 — Disponibilidade**: A feature deve seguir o SLA de disponibilidade da plataforma (99,9%).
- **RNF06 — Acessibilidade**: Interface compatível com WCAG 2.1 AA.
- **RNF07 — Responsividade**: Funcional em desktop e tablet.
- **RNF08 — Consistência em tempo real**: Atualizações refletidas sem necessidade de recarregar a página.

---

## 9. Fluxo do Usuário (Happy Path)

1. O usuário acessa o **Inbox Inteligente** (via menu ou badge de pendências).
2. O sistema exibe os itens priorizados automaticamente.
3. O usuário identifica o item mais urgente no topo.
4. Ele abre o painel de contexto e analisa os detalhes.
5. Decide e executa a ação (aprovar, rejeitar, solicitar ajuste ou delegar).
6. O item sai da lista, o contador atualiza e o solicitante é notificado.
7. O usuário segue para o próximo item — ou usa ação em lote para itens similares.

---

## 10. Regras de Negócio

- **RN01**: Um item só aparece no inbox de quem tem permissão/atribuição para validá-lo.
- **RN02**: Rejeição exige motivo obrigatório.
- **RN03**: Delegação só é permitida para usuários com o mesmo nível ou superior de autorização.
- **RN04**: O score de priorização é recalculado periodicamente e sempre que houver mudança de prazo/status.
- **RN05**: Itens vencidos permanecem no inbox destacados como "vencidos" até serem resolvidos.
- **RN06**: Ações em lote só se aplicam a itens do mesmo tipo/fluxo compatível.

---

## 11. Dependências

- Módulos de origem que geram validações (devem expor os itens pendentes ao inbox).
- Serviço de autenticação e autorização (permissões por item).
- Serviço de notificações interno.
- Trilha de auditoria da plataforma.

---

## 12. Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Score de priorização mal calibrado gera desconfiança | Alto | Validar critérios com usuários reais; permitir reordenação manual |
| Volume alto de itens degrada performance | Alto | Paginação/virtualização e cache |
| Ações em lote causarem aprovações indevidas | Médio | Confirmação explícita e restrição por compatibilidade de tipo |
| Baixa adoção | Médio | Onboarding, badge visível e integração ao fluxo diário |

---

## 13. Rollout e Fases

- **Fase 1 (MVP)**: Listagem unificada, priorização, ações individuais, contexto, notificações e badge.
- **Fase 2**: Ações em lote e agrupamento avançado.
- **Fase 3**: Regras de priorização configuráveis e painel gerencial de gargalos.
- **Fase 4**: Automação/IA para triagem e sugestão de decisões.

---

## 14. Questões em Aberto

- Quais módulos serão integrados na primeira fase?
- Qual a fórmula/peso inicial do score de priorização?
- Haverá limite de itens por ação em lote?
- Como tratar itens que exigem validação de múltiplos aprovadores (fluxo paralelo/sequencial)?

---

*Documento vivo — sujeito a revisão conforme validação com stakeholders e usuários.*
