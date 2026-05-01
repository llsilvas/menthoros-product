---
stepsCompleted: ["step-01-init", "step-02-discovery", "step-02b-vision", "step-02c-executive-summary", "step-03-success", "step-04-journeys"]
inputDocuments: 
  - "brainstorming-session-2026-04-26-1143.md"
  - "CLAUDE.md (Menthoros Architecture Guide)"
  - "openspec/changes/strava-integration/design.md"
  - "openspec/changes/strava-oauth/design.md"
  - "openspec/changes/strava-activity-sync/design.md"
  - "openspec/changes/strava-conditional-insights/design.md"
  - "openspec/changes/strava-risk-semaphore/design.md"
workflowType: 'prd'
projectContext: 'brownfield'
classification:
  projectType: "Backend API Service (RESTful)"
  domain: "Training Intelligence / Coaching SaaS"
  complexity: "HIGH"
  complexityRationale: "OAuth2 + webhooks + rate limiting + async processing + LLM integration + multi-tenancy"
  projectContext: "brownfield"
vision:
  mainVision: "Menthoros + Strava = onboarding instantâneo (primeiro valor no dia 1) + alertas proativos durante execução (ação em tempo real) = assessoria que escala, atleta que progride seguro, sem fricção."
  differentiators:
    - "Onboarding Instantâneo: conectar Strava → importar 90 dias histórico → gerar plano personalizado sem fricção"
    - "Alertas Proativos: cada atividade sincronizada dispara alertas estruturados (lesão, progressão, padrão)"
    - "Ação em Tempo Real: treinador ajusta treino/recuperação antes do problema escalar"
    - "Escalabilidade: gerenciar 20-50 atletas com inteligência automática, sem aumentar staff"
  targetImpact:
    - "Aquisição: conversão alta (atleta sente valor no dia 1)"
    - "Retenção: atleta engajado (feedback automático contínuo)"
    - "Operacional: treinador escala sem friction"
---

# Product Requirements Document - Strava Integration for Menthoros

**Author:** Leandro Silva  
**Date:** 2026-04-27  
**Project:** Menthoros Services (Spring Boot Backend)  
**Feature:** Strava Integration  
**Status:** In Progress (Step 2 of 11 - Project Discovery)

---

## Document Purpose

This PRD formalizes business goals, personas, features, and success metrics for integrating Strava data with Menthoros' training intelligence platform. It bridges brainstormed ideas (40 ideals, 6 prioritized) with technical architecture (5 OpenSpec changes).

---

## Executive Summary

**Integração com Strava para Menthoros** transforma o onboarding de atletas e a execução de treinos em plataformas de coaching. Ao conectar dados reais de treino (Strava) com planejamento e monitoramento orientados por IA (Menthoros), a integração entrega dois momentos distintos de valor:

1. **Onboarding sem fricção:** Atletas novos conectam Strava → sistema importa 90 dias de histórico de treino → plano semanal personalizado é gerado automaticamente sem entrada manual. Primeiro valor entregue no dia 1.

2. **Inteligência proativa durante execução:** Cada atividade concluída dispara alertas estruturados (risco de lesão, orientação de progressão, desvios de padrão) → treinador atua em minutos → previne lesões e garante progressão.

**Resultado:** Assessorias de coaching escalam de gerenciar 5–10 atletas com supervisão intensiva para gerenciar 20–50 atletas com inteligência automatizada, sem adicionar staff.

### O Que Torna Isso Especial

**Diferencial Central:** A maioria das plataformas de coaching trata Strava como fonte de dados. Menthoros + Strava inverte isso: desempenho real se torna a *fundação* para recomendações de IA, não uma validação posterior.

**Três insights entrelaçados:**
1. **Paradoxo do onboarding:** Treinadores abandonam entrada manual quando Strava a elimina. Geração automática de plano no dia 1 converte atletas céticos → usuários engajados.
2. **Velocidade alerta-para-ação:** Treinadores não conseguem escalar revisão manual. Alertas estruturados e categorizados comprimem tempo de decisão de horas para minutos.
3. **Eficiência multi-tenancy:** Um treinador com 50 atletas precisa de sistema de triagem de 5 segundos (semáforo de risco vermelho/amarelo/verde), não 50 revisões individuais de dados.

## Project Classification

| Aspecto | Valor |
|--------|-------|
| **Tipo de Projeto** | Backend API Service (microsserviço RESTful) |
| **Domínio** | Training Intelligence / Coaching SaaS |
| **Complexidade** | ALTA — OAuth2 + webhooks + processamento assíncrono + integração LLM + multi-tenancy |
| **Contexto do Projeto** | BROWNFIELD — extensão do Menthoros existente (Spring Boot 3.5.4, Keycloak, pgvector) |
| **Escopo MVP** | 5 mudanças técnicas sequenciais: OAuth → Sync de Atividades → Insights Condicionais → Semáforo de Risco → Webhooks |

## Success Criteria

### User Success

**Atleta Novo:**
- Conecta Strava em < 2 minutos (zero friction)
- Vê plano semanal automático gerado do histórico (dia 1)
- Recebe alerta quando atividade realizada desvia do planejado (durante execução)

**Treinador:**
- Vê alerta estruturado com contexto (TSS, FC, padrão) → toma decisão em < 5 min
- Ajusta treino do atleta antes que lesão/desmotivação escale

### Business Success

| Métrica | Target MVP |
|---------|-----------|
| **Adoption** | 80%+ atletas novos conectam Strava |
| **Engagement** | Atletas com Strava continuam usando 30+ dias |
| **Validation** | NPS > 4.0 em feedback de 3+ treinadores |
| **Escalabilidade** | Treinador gerencia 20-50 atletas sem overhead adicional |

### Technical Success

| Aspecto | Target MVP |
|---------|-----------|
| **Latência de Alerta** | < 2 seg pós-atividade sincronizada |
| **Custo LLM** | 50%+ redução vs. indiscriminado (análise condicional) |
| **Detecção Precoce** | Identificar overtraining 2 semanas antes |
| **Uptime** | 99.5%+ (webhooks podem falhar, sync manual sempre funciona) |

## Product Scope

### MVP — Pronto para Launch

✅ **Autenticação & Onboarding:**
- OAuth2 com Strava
- Importar 90 dias de histórico
- Gerar plano semanal automático (revisar se parcial/total)

✅ **Sincronização:**
- Sync manual de atividades → TreinoRealizado + EtapaRealizada
- Mapeamento de tipo de treino, cadência, FC, pace, TSS

✅ **Alertas & Ação:**
- Detectar desvios (TSS, FC zona, cadência)
- Alertas estruturados para treinador
- Recomendações básicas (aumentar recuperação, revisar execução)

✅ **Multi-tenancy:**
- Isolamento total por assessoria
- Atleta de um tenant não vê outro

❌ **NÃO no MVP:**
- Webhooks (sync em tempo real — pode ser manual)
- Semáforo de risco 🚦 (pós-MVP feature)
- Análise LLM condicional avançada (pode estar básica)

### Growth — Logo Após MVP (1-2 meses)

✨ **Semáforo de Risco** (feature separada com grande diferencial)
- Score de risco 0-100 → 🟢🟡🔴
- 5 dimensões agregadas (TSB, alertas, aderência, padrão, dados)
- Dashboard de triagem para 50 atletas em 5 segundos

📡 **Webhooks**
- Sincronização em tempo real (não manual)
- Fila com prioridade

🧠 **Análise LLM Condicional**
- Redução adicional de custos
- Narrativas estruturadas

### Vision (6-12 meses)

🎯 Predição de lesão com 4+ semanas antecedência  
🎯 Fine-tuning de modelo LLM por treinador  
🎯 RAG sobre decisões históricas do coach  
🎯 Integração com Garmin, TrainingPeaks

---

## User Journeys

### Journey 1: Atleta Novo — "Do Caos ao Engajamento"

#### Abertura (Opening Scene)

**Quem:** Gabriel, 32 anos, corredor amador que treina há 2 anos de forma desorganizada. Tem um Strava ativo com 90 dias de histórico de treinos variados (10-15 km por semana, sem padrão claro).

**Situação Atual:** Gabriel quer melhorar, mas:
- Não sabe se está treinando certo ou apenas "fazendo volume"
- Treina por intuição; não tem plano estruturado
- Já tentou apps, mas entrada manual de dados é fricção demais
- Desistiu de 2 plataformas no passado por ter que digitar manualmente cada treino

**Dor:** "Tenho os dados em Strava, por que preciso digitar tudo de novo?"

#### Ação Ascendente (Rising Action)

**Momento 1 — Descoberta e Onboarding Instantâneo:**
- Gabriel descobre Menthoros via podcast de running
- Vê: "Conecte seu Strava em < 2 minutos"
- Clica em "Authorize with Strava", passa por OAuth → volta com token ativo
- **Tempo total:** 90 segundos

**Momento 2 — Primeira Sincronização e Aha!:**
- Sistema importa automaticamente 90 dias de histórico do Strava
- Menthoros **gera um plano semanal automático** baseado no histórico (fase periodização, volume, intensidade)
- Gabriel vê na tela: "Seu plano está pronto baseado em 90 dias de treinos"
- Primeiro valor entregue no **dia 1** ✅

**Momento 3 — Execução e Feedback Imediato:**
- Gabriel executa primeiro treino novo conforme plano
- Após sincronização automática do Strava:
  - Menthoros gera **alerta estruturado**: "Você correu 2% abaixo do TSS planejado — padrão normal para esta semana"
  - Recomendação: "Continue assim, recuperação está no padrão"
- Gabriel sente: "Alguém está olhando para meus dados de verdade"

#### Clímax (Climax)

**Semana 2 — Feedback Que Muda de Verdade:**

Gabriel tenta correr mais rápido na terça (overtraining incipiente):
- Treino de 12 km em 1h com FC alta demais (zona 4 inteira)
- Strava sincroniza → Menthoros detecta:
  - ⚠️ **Alerta DESVIO_ZONA_FC:** "12 min acima da zona esperada"
  - ⚠️ **Alerta PADRÃO:** "Você não costuma fazer treinos nesta intensidade"
  - 🚨 **Semáforo:** Status **AMARELO** no dashboard do seu treinador

- Seu treinador (Coach Anderson) vê o semáforo amarelo em 5 segundos
- Envia feedback em 10 min: "Ótimo treino, mas reduz intensidade na quinta. Seu corpo pede recuperação."
- Gabriel recebe notificação com recomendação concreta

#### Resolução (Resolution)

**Semanas 3-8 — A Nova Realidade:**

- Gabriel segue o plano estruturado, sente que está "otimizando" (não apenas fazendo volume)
- Cada atividade gera feedback automático estruturado
- Seu treinador intervém 1-2x por semana com ajustes precisos (não mais que 5 min de análise)
- **Resultado:** Gabriel completa 8 semanas sem lesão, melhor que antes
- **Engajamento:** Volta toda semana para ver feedback novo
- **Retenção:** Assina plano pago mês que vem — "Preciso disto"

**Requisitos Revelados:**
- ✅ OAuth2 com Strava (< 2 min)
- ✅ Importação de 90 dias de histórico
- ✅ Geração automática de plano baseado em histórico
- ✅ Sincronização automática de atividades do Strava
- ✅ Alertas estruturados por tipo (TSS, FC, padrão)
- ✅ Semáforo visível para contexto do treinador
- ✅ Feedback automático + recomendações

---

### Journey 2: Treinador — "Do Bottleneck à Escalabilidade"

#### Abertura (Opening Scene)

**Quem:** Anderson, 45 anos, coach de corrida com 15 anos de experiência. Gerencia atualmente **15 atletas semi-profissionais** + 5 amadores. Trabalha sozinho (sem assistente).

**Situação Atual:** Anderson está no limite:
- Revisa cada atleta 2-3x por semana = **4-5 horas/semana apenas lendo dados**
- Planilhas de Excel com uploads manuais de TCX
- Perde sinais de overtraining porque não consegue monitorar em tempo real
- Já teve **2 atletas se lesionarem** porque não detectou acúmulo de fadiga a tempo
- Quer crescer para 30 atletas (ganho 2x de faturamento) **mas não tem como**, tempo não permite

**Dor:** "Se eu tiver mais atletas, alguém se machuca. Não dá pra escalar sem comprometer qualidade."

#### Ação Ascendente (Rising Action)

**Momento 1 — Adoção de Menthoros + Strava:**
- Anderson integra Menthoros na assessoria
- Cada novo atleta: "Conecta seu Strava" → plano automático gerado → alertas começam a chegar

**Momento 2 — Fluxo de Triagem (O Semáforo):**
- Dashboard de Menthoros mostra **50 atletas em 5 segundos:**
  - 42 🟢 VERDES (normal)
  - 6 🟡 AMARELOS (monitorar)
  - 2 🔴 VERMELHOS (ação urgente)

- Sem semáforo: Anderson teria que ler perfil completo de cada um
- Com semáforo: **"Clico em RED, leio 2 perfis detalhados em 10 min"**
- Economia: **4h → 20 min por semana** ⚡

**Momento 3 — Alertas Estruturados Disparam:**
- Terça-feira, 14h: notificação chega no app
- **Atleta #7 (Marina):** Status mudou para 🔴 RED
- Resumo: "TSB < -25 (overtraining zona) + 3 alertas de desvio FC na semana passada + aderência caiu"
- Recomendação automática: "Aumentar recuperação — próxima atividade em -20%"

#### Clímax (Climax)

**Cenário Real — Detecção Precoce que Salva Atleta:**

**Contexto:** Marina estava em reta final de preparação para meia-maratona. Treinou 3 semanas intensas.

**Sem Menthoros:** Anderson teria revisado Marina apenas na quinta-feira
- Marina se lesionaria no treino de quinta (tendinite)
- 3 semanas de repouso, prova comprometida

**Com Menthoros:**
- Terça: semáforo fica RED (TSB -28, múltiplos alertas, padrão quebrado)
- Anderson age em 10 min: "Marina, você vai parar treino hoje e quinta. Faz recuperação ativa quinta."
- Marina obedece (confia na análise de dados estruturada)
- Quinta ela descansa, se recupera
- Prova no domingo: Marina corre bem, não se lesiona ✅

**O Diferencial:**
- Anderson detectou **2 semanas antes** (via padrão + TSB) vs. **após lesão**
- Ação tomada em **10 minutos** (leitura + decisão) vs. **50 minutos** (Excel + análise manual)
- **Escalabilidade desbloqueada:** Anderson pode gerenciar 2-3x mais atletas com mesma atenção

#### Resolução (Resolution)

**3 Meses Depois — A Nova Realidade:**

- Anderson escala de 15 para **35 atletas**
- Tempo de revisão: **20 min/semana** (vs. 5h antes)
- Qualidade de decisão: **melhorou** (dados estruturados + IA detecta padrões que olho humano perde)
- Atletas engajados: **+40%** de retenção (feedback automático + proatividade do coach)
- Receita: **+2.3x** (mais atletas, mesma custo operacional)

**Feedback Anderson:** "Antes eu era bottleneck. Agora Menthoros é meu assistente invisível — eu dirijo a visão estratégica, máquina detecta risco."

**Requisitos Revelados:**
- ✅ Dashboard com triagem por semáforo (RED/YELLOW/GREEN)
- ✅ Visualizar 20-50 atletas ordenados por risco (score descendente)
- ✅ Alertas chegam em tempo real (< 2 seg pós-sincronização)
- ✅ Cada alerta inclui: tipo, valor real vs. esperado, contexto, recomendação
- ✅ Score de risco é recalculado após cada atividade sincronizada
- ✅ API para integrar com sistema de agendamento do coach (opcional)
- ✅ Multi-tenancy: atletas de Anderson isolados vs. outros coaches

---

### Journey 3: Assessoria — "Do Commoditizado ao Diferencial"

#### Abertura (Opening Scene)

**Quem:** Lídia, 38 anos, dona de uma assessoria de corrida chamada "RunFlow" com **25 atletas ativos** e **3 coaches** (incluindo ela). Opera há 6 anos.

**Situação Atual:** Lídia enfrenta dilema:
- Negócio está maduro: ~R$ 150k/ano em receita recorrente
- Mas **concorrência crescendo** — 5 novas assessorias abriram na cidade
- Atletas dela são leais, mas a **dor é aquisição:**
  - Novos clientes veem RunFlow como "igual aos outros" (planos + WhatsApp)
  - Gastou R$ 8k/mês em publicidade, retorno medíocre
  - Taxa de churn: **25%/ano** (atletas tentam, desistem por falta de diferencial)

**Oportunidade:** Lídia sente que **Strava é o futuro** — todos seus atletas têm conta ativa. Pergunta: "Como faço dados de Strava virar diferencial de verdade?"

**Dor:** "Estou ficando para trás. Se não diferenciar, em 3 anos sou commoditizado."

#### Ação Ascendente (Rising Action)

**Momento 1 — Visão Estratégica:**
Lídia descobre Menthoros + Strava integration:
- Lê PRD da integração
- Vê: "Onboarding instantâneo + alertas em tempo real + semáforo de risco"
- Pensa: "Isto é diferencial. Ninguém mais oferece isto."

**Momento 2 — Implementação e Lançamento:**
- Menthoros é implementado na RunFlow (backend + API)
- Lídia cria landing page: **"RunFlow + Strava: Inteligência em Tempo Real"**
- Copy: "Conecte seu Strava. Seu plano é gerado automático. Alertas chegam enquanto você corre."
- Primeiro video de case: Anderson (o coach) falando como escalou de 15 para 35 atletas

**Momento 3 — Aquisição Começa a Mudar:**
- Novo prospect: "Qual é a diferença vs. TrainHeroic ou TrainingPeaks?"
- Resposta antes: "Planos bons, comunidade, coach dedicado"
- Resposta agora: **"Tudo isto + IA que detecta risco 2 semanas antes, feedback automático estruturado, seu coach não é bottleneck — escalamos você de verdade"**
- Prospect sente: "Isto é diferente mesmo"

#### Clímax (Climax)

**3 Meses Depois — Momento de Inflexão:**

**Número 1 — Retenção Melhora:**
- Antes: 25% de churn/ano
- Agora: **12% de churn/ano** (50% redução)
- Razão: atletas com Strava conectado ficam 2x mais engajados (feedback automático)
- **Impacto:** +3 atletas retidos/mês que pagariam subscription

**Número 2 — Aquisição Dispara:**
- Google Ads ROI melhora 40% (landing com diferencial real gera conversão maior)
- Referências aumentam: "Meu coach viu que ia me lesionar antes eu perceber"
- **+12 novos atletas em 90 dias** (vs. média de 4/trimestre antes)

**Número 3 — Diferencial Competitivo:**
- Concorrente local tenta copiar: "Também vamos usar Strava!"
- Mas sem IA integrada, sem alertas estruturados, sem semáforo — é só "mais um sync"
- RunFlow mantém diferencial porque **Menthoros é o produto único**

**Momento de Verdade:**
- Lídia é convidada para dar workshop em congresso de coaches (porque case de sucesso)
- Posiciona RunFlow como "a assessoria inteligente que escala" vs. commoditizadas
- Credibilidade sobe, mais prospects buscam especificamente RunFlow

#### Resolução (Resolution)

**12 Meses Depois — Nova Realidade:**

| Métrica | Antes | Depois | Δ |
|---------|-------|--------|---|
| **Atletas Ativos** | 25 | 48 | +92% |
| **Coaches** | 3 | 3 | +0% (mesma equipe!) |
| **Receita Mensal** | R$ 12.5k | R$ 24k | +92% |
| **Churn Anual** | 25% | 10% | -60% |
| **Custo Aquisição** | R$ 2k/atleta | R$ 950/atleta | -53% |
| **NPS** | 6.2 | 8.1 | +1.9 |

**Resultado Estratégico:**
- Lídia **dobrou faturamento** sem contratar mais coaches
- Escala operacional desbloqueada: mesma equipe, 2x atletas, melhor serviço
- Diferencial competitivo consolidado: "Só RunFlow tem Menthoros"
- Agora pode: expandir para cidades vizinhas com modelo pronto para escalar

**Feedback Lídia:** "Menthoros não é um software que eu uso. É o motor que faz a RunFlow funcionar em escala. É como ter assistente invisível de IA em cada atleta."

**Requisitos Revelados:**
- ✅ Multi-tenancy total (RunFlow isolada de outras assessorias)
- ✅ Dashboard para coach revisar todos atletas em 5 min
- ✅ Onboarding tão fácil que atleta novo se integra mesmo sem instruções
- ✅ Alertas + recomendações geram stories de retenção (diferencial de marketing)
- ✅ API estável (Menthoros precisa ser confiável 24/7, não pode falhar)
- ✅ Escalabilidade confirmada (deve suportar 20-50 atletas simultâneos sem degradação)
- ✅ Webhooks para sync em tempo real (próxima fase, mas importante para diferencial)

---

### Journey Requirements Summary

#### Requisitos por Jornada — Mapa de Cobertura

```
GABRIEL (Atleta)    → ANDERSON (Coach)      → LÍDIA (Assessoria)
     |                      |                       |
     v                      v                       v
Onboarding fácil    Dashboard de triagem    Multi-tenancy
Plano automático    Semáforo (🟢🟡🔴)      API estável
Alertas estruturados  Alertas em tempo real  Escalabilidade
Feedback imediato   Recomendações ligadas   Diferencial compet.
Engajamento         Escala operacional      Aquisição/Retenção
```

#### Capacidades Críticas Identificadas

**1. Autenticação & Onboarding (MVP — BLOQUEANTE)**

Revelado por: Gabriel (Atleta) + Lídia (Assessoria)
- OAuth2 com Strava: autorização em < 2 min
- Integração de token segura (tabela tb_integracao_externa)
- Fluxo sem fricção — atleta novo conecta e vê valor no dia 1
- **Status:** OpenSpec `strava-oauth` — pronto para implementar

**2. Sincronização de 90 Dias de Histórico (MVP — BLOQUEANTE)**

Revelado por: Gabriel (Atleta) + Anderson (Coach)
- Importação automática do Strava (últimos 90 dias)
- Mapeamento de atividades → TreinoRealizado + EtapaRealizada
- Campos: TSS, FC (zona), cadência, pace, elevation, splits
- Geração automática de plano baseado no histórico
- **Status:** OpenSpec `strava-activity-sync` — pronto para implementar

**3. Alertas Estruturados por Tipo (MVP — CRÍTICO)**

Revelado por: Gabriel (Atleta) + Anderson (Coach) + Lídia (Assessoria)
- Detecção de desvios: TSS, FC (zona), cadência, padrão, dados incompletos
- Persistência de alertas com contexto (valor real vs. esperado)
- Análise LLM condicional (só chama IA se há sinal real → 60-80% redução tokens)
- Recomendações estruturadas ("Aumentar recuperação", "Revisar execução")
- **Valor:** Anderson pode revisar 50 atletas em 20 min vs. 5h antes
- **Status:** OpenSpec `strava-conditional-insights` — pronto para implementar

**4. Semáforo de Risco (MVP → GROWTH — DIFERENCIAL)**

Revelado por: Anderson (Coach) + Lídia (Assessoria)
- Score de risco 0-100 baseado em 5 dimensões (TSB 30%, Alertas 25%, Aderência 20%, Padrão 15%, Dados 10%)
- Mapeamento: score < 25 → 🟢 GREEN, 25-60 → 🟡 YELLOW, > 60 → 🔴 RED
- Dashboard: visualizar 20-50 atletas ordenados por risco em 5 segundos
- Snapshot diário + recalculation após sincronização
- **Valor:** Anderson detecta overtraining 2 semanas antes, escala 2x sem aumentar staff
- **Status:** OpenSpec `strava-risk-semaphore` — pronto para implementar
- **Nota:** MVP cobre os alertas básicos; GROWTH adiciona dashboard visual

**5. Sincronização em Tempo Real (GROWTH — Nice-to-Have para MVP)**

Revelado por: Gabriel (Atleta) + Anderson (Coach)
- Webhooks do Strava: atividade concluída → alerta em < 2 seg
- Fila com prioridade (alertas de risco antes de feedback)
- Retry com backoff exponencial
- **Status:** OpenSpec `strava-webhooks` — GROWTH phase (não MVP)

**6. Multi-Tenancy Total (MVP — REQUISITO ARQUITETURAL)**

Revelado por: Lídia (Assessoria) + Anderson (Coach)
- Isolamento total: RunFlow não vê atletas de outra assessoria
- Tenant_id em todas as queries (migração já pronta)
- JWT com tenant_id do Keycloak
- **Status:** Infraestrutura existente — apenas garantir em cada novo feature

#### Sequência de Implementação (Roadmap Implícito)

| Fase | Feature | Persona Bloqueado | Valor | Status |
|------|---------|-------------------|-------|--------|
| **MVP** | OAuth2 + Token Storage | Gabriel, Anderson, Lídia | Onboarding sem fricção | `strava-oauth` pronto |
| **MVP** | Activity Sync 90d + Auto-plan | Gabriel, Anderson, Lídia | Dia 1 = primeiro valor | `strava-activity-sync` pronto |
| **MVP** | Alertas Estruturados (TSS, FC, padrão) | Gabriel, Anderson | Feedback automático | `strava-conditional-insights` pronto |
| **MVP** | Análise LLM Condicional | Gabriel, Anderson | 60% redução tokens | `strava-conditional-insights` pronto |
| **GROWTH** | Semáforo de Risco (🟢🟡🔴) | Anderson, Lídia | Triagem 5 seg, escala 2x | `strava-risk-semaphore` pronto |
| **GROWTH** | Webhooks (sync real-time) | Gabriel, Anderson | Alertas < 2 seg pós-atividade | `strava-webhooks` pronto |

#### Requisitos por Tipo

**Funcionais:**
- ✅ OAuth2 (strava-oauth)
- ✅ Importar 90 dias (strava-activity-sync)
- ✅ Alertas por tipo (strava-conditional-insights)
- ✅ Análise LLM condicional (strava-conditional-insights)
- ✅ Semáforo de risco (strava-risk-semaphore)
- ✅ Webhooks (strava-webhooks)

**Não-Funcionais:**
- Multi-tenancy total (MVP bloqueante)
- Latência < 2 seg (webhooks)
- Escalabilidade (20-50 atletas simultâneos)
- Uptime 99.5% (webhooks podem falhar, manual sempre funciona)
- Redução de custo LLM 50%+ (análise condicional)

**Derivados das Jornadas:**
- Dashboard visual de semáforo (GROWTH)
- Notificações ao coach (GROWTH)
- API para integração com agendamento (FUTURE)
- Fine-tuning de fórmula de risco por assessoria (FUTURE)

#### Padrões de Requisito Revelados

**Gabriel → Anderson → Lídia** mostram um **efeito cascata:**

1. **Gabriel precisa** de onboarding fácil + feedback automático
2. **Anderson precisa** de triagem rápida + escalabilidade (revelado pelo engajamento de Gabriel)
3. **Lídia precisa** de diferencial competitivo + retenção (revelado pela capacidade de Anderson escalar)

**Resultado:** Uma feature para um persona se torna pré-requisito invisível para o próximo. Isto é razão pela qual **MVP order importa:**
- Sem OAuth + Activity Sync → Gabriel não conecta → Anderson não tem dados → Lídia não tem diferencial
- Sem Alertas → Gabriel não engaja → Anderson não vê valor → Lídia fica commoditizada
- Sem Semáforo → Anderson não escala → Lídia não dobra receita

---

*Próximas seções: Domain Requirements, Product Goals, Personas, Feature Definition, Requirements, Assumptions, Dependencies, Roadmap (Steps 5-11)*

