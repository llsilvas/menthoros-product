# Visão de Produto - Menthoros

**Documento Estratégico de Produto**
**Data:** 28 de fevereiro de 2026
**Escopo:** Evolução do Menthoros para MVP 2.0 (Produção Segura)

---

## 📊 Executive Summary - Visão de Produto

### O Que é Menthoros?

**Menthoros** é uma plataforma SaaS de **gestão inteligente de treinamento atlético** que:

1. **Gerencia** planos de treinamento personalizados por atleta
2. **Gera** automaticamente planos usando IA (GPT-4)
3. **Rastreia** métricas de desempenho e recuperação
4. **Fornece** insights e alertas baseados em dados
5. **Facilita** comunicação entre atleta e coach

---

## 💼 Proposta de Valor

### Para o Atleta
```
ANTES (sem Menthoros):
├─ Plano genérico do coach
├─ Sem acompanhamento personalizado
├─ Sem insights sobre performance
└─ Risco de overtraining/lesão

DEPOIS (com Menthoros):
├─ Plano personalizado diário
├─ Acompanhamento em tempo real
├─ Alertas de sobrecarga
└─ Otimização de performance
```

**Benefício:** +15-20% melhoria de desempenho, menos lesões

### Para o Coach
```
ANTES:
├─ Criar plano manualmente (2-3h/atleta)
├─ Acompanhamento manual
├─ Sem previsão de riscos
└─ Escalabilidade limitada

DEPOIS:
├─ Plano em 5 minutos (IA)
├─ Dashboard com 10 atletas
├─ Alertas automáticos
└─ Pode trabalhar com 50+ atletas
```

**Benefício:** 10x mais produtivo, receita escalável

### Para o Negócio
```
ANTES:
├─ Aplicação beta sem autenticação
├─ Sem modelo de receita
├─ Não pronto para produção
└─ Não escalável

DEPOIS:
├─ Produto seguro e pronto
├─ Modelo SaaS com pagamento
├─ Escalável para 10k+ usuários
└─ Diferenciação competitiva
```

**Benefício:** Caminho claro para $1M ARR

---

## 🎯 Estratégia de Produto (18 meses)

### Fases de Evolução

```
┌─────────────────────────────────────────────────────┐
│ FASE 1: MVP 2.0 "SEGURO"      (FEV - MAR 2026)     │
├─────────────────────────────────────────────────────┤
│ Status:     🔴 EM PROGRESSO                         │
│ Duração:    4-5 semanas                             │
│ Objetivo:   Produção segura com auth + performance │
│ Investimento: ~300-400h (3-4 pessoas)              │
│                                                     │
│ Entregas:                                           │
│ ✅ Autenticação JWT (multi-user)                   │
│ ✅ Rate limiting para APIs                         │
│ ✅ Paginação (escala 1k+ registros)               │
│ ✅ Otimização DB (N+1 fixes)                       │
│ ✅ Testes (80% coverage)                           │
│ ✅ Logging estruturado                             │
│                                                     │
│ Métricas de Sucesso:                               │
│ • 0 vulnerabilidades críticas                      │
│ • Response time < 200ms (p95)                      │
│ • Uptime > 99%                                     │
│ • 80% test coverage                                │
│                                                     │
│ Go-Live: Ambiente de staging (validação)           │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ FASE 2: MVP 2.1 "BETA"         (ABR - MAI 2026)    │
├─────────────────────────────────────────────────────┤
│ Status:     ⏳ PLANEJADO                            │
│ Duração:    6-8 semanas                             │
│ Objetivo:   Beta privado com 50 usuários reais     │
│ Investimento: ~200h (2 pessoas)                    │
│                                                     │
│ Entregas:                                           │
│ ✅ Integração com stripe (pagamento)               │
│ ✅ Onboarding simplificado                         │
│ ✅ Dashboard de analytics                          │
│ ✅ Mobile-first responsive design                  │
│ ✅ Suporte ao usuário (email)                      │
│ ✅ Documentação para usuários                      │
│                                                     │
│ Métricas de Sucesso:                               │
│ • 50 usuários β ativos                             │
│ • NPS > 50                                         │
│ • <5% churn mensal                                 │
│ • Feature adoption >60%                            │
│                                                     │
│ Go-Live: Beta privado (convites)                   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ FASE 3: MVP 2.2 "PÚBLICO"      (JUN - JUL 2026)   │
├─────────────────────────────────────────────────────┤
│ Status:     ⏳ PLANEJADO                            │
│ Duração:    4-5 semanas                             │
│ Objetivo:   Launch público com 500+ usuários       │
│ Investimento: ~150h (1-2 pessoas)                  │
│                                                     │
│ Entregas:                                           │
│ ✅ Marketing website                               │
│ ✅ Funcionalidade de referral                      │
│ ✅ Integração com Slack/Discord                    │
│ ✅ API pública (webhooks)                          │
│ ✅ Programa de afiliados                           │
│                                                     │
│ Métricas de Sucesso:                               │
│ • 500+ usuários ativos                             │
│ • MRR > $2k                                        │
│ • CAC < $50                                        │
│ • LTV > $500                                       │
│                                                     │
│ Go-Live: Launch público                            │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ FASE 4: SCALE                  (AGO - DEZ 2026)    │
├─────────────────────────────────────────────────────┤
│ Status:     ⏳ ROADMAP                              │
│ Duração:    20+ semanas                             │
│ Objetivo:   1k+ usuários pagando, $10k+ MRR       │
│                                                     │
│ Entregas:                                           │
│ • App mobile (React Native)                        │
│ • Social features (comunidade)                     │
│ • Marketplace de coaches                           │
│ • Integrações com wearables                        │
│ • ML para previsão de lesões                       │
│                                                     │
│ Go-Live: Contínuo com releases bi-semanais        │
└─────────────────────────────────────────────────────┘
```

---

## 👥 Segmentação de Clientes

### Segment 1: Corredores Amadores (High Volume, Low ARPU)

```
TAM:              500k corredores amadores no Brasil
Target:           50k = 10% do TAM
Pricing:          R$ 49/mês (básico)
Expected LTV:     R$ 1,200 (2 anos)
Acquisition:      Organic + social media
```

**Necessidades:**
- Plano de treino simples
- Acompanhamento de progresso
- Comunidade
- Integração com Strava

**MVP 2.0 Readiness:** ✅ 80% (falta community)

---

### Segment 2: Corredores Sérios (Medium Volume, Medium ARPU)

```
TAM:              100k corredores sérios
Target:           5k = 5% do TAM
Pricing:          R$ 149/mês (pro)
Expected LTV:     R$ 3,600 (2 anos)
Acquisition:      Partnerships com academias
```

**Necessidades:**
- Plano avançado com IA
- Analytics detalhado
- Integração com wearables
- Suporte prioritário

**MVP 2.0 Readiness:** ✅ 90% (falta wearables)

---

### Segment 3: Coaches Profissionais (Low Volume, High ARPU)

```
TAM:              10k coaches no Brasil
Target:           500 = 5% do TAM
Pricing:          R$ 499/mês (enterprise)
Expected LTV:     R$ 12k (2 anos)
Acquisition:      Direct sales + partnerships
```

**Necessidades:**
- Gerenciar múltiplos atletas
- Análise de grupo
- Integração com calendário
- CRM de clientes
- White-label opcional

**MVP 2.0 Readiness:** ✅ 95% (pronto!)

---

## 📈 Métricas de Negócio

### Targets por Fase

```
FASE 1 (MVP 2.0 - SEGURO) - MAR 2026
├── Users: 5-10 (teste interno + early adopters)
├── MRR: R$ 0 (beta gratuito)
├── Churn: N/A
├── NPS: 70+ (com early adopters)
└── Objetivo: Validar segurança

FASE 2 (BETA) - MAI 2026
├── Users: 50 (β privado)
├── MRR: R$ 500-1k (alguns pagos)
├── Churn: <5%
├── NPS: 60+
└── Objetivo: Product-market fit

FASE 3 (PÚBLICO) - JUL 2026
├── Users: 500+
├── MRR: R$ 5k-10k
├── Churn: 5-8%
├── NPS: 50+
└── Objetivo: Crescimento sustentável

FASE 4 (SCALE) - DEZ 2026
├── Users: 1k-5k
├── MRR: R$ 20k-100k
├── Churn: 3-5% (churn saudável)
├── NPS: 60+
└── Objetivo: Path to profitability
```

### Unit Economics

```
BÁSICO (R$ 49/mês)
├─ CAC:          R$ 20 (organic)
├─ LTV:          R$ 1,200 (2 anos)
├─ LTV/CAC:      60:1 ✅ EXCELENTE
└─ Payback:      0.4 meses

PRO (R$ 149/mês)
├─ CAC:          R$ 50 (partnership)
├─ LTV:          R$ 3,600 (2 anos)
├─ LTV/CAC:      72:1 ✅ EXCELENTE
└─ Payback:      0.4 meses

ENTERPRISE (R$ 499/mês)
├─ CAC:          R$ 300 (direct sales)
├─ LTV:          R$ 12k (2 anos)
├─ LTV/CAC:      40:1 ✅ MUITO BOM
└─ Payback:      0.7 meses
```

---

## 🎯 Roadmap de Features (18 meses)

### Q1 2026 - MVP 2.0 (SEGURO) 🔴 FOCO AGORA

```
Semana 1-2: Autenticação & Segurança
├── JWT login/logout
├── Rate limiting
├── Input validation
└── CORS restritivo

Semana 3: Performance
├── Paginação em listagens
├── N+1 query optimization
├── Database indexing
└── Caching strategy

Semana 4: Qualidade
├── Testes (80% coverage)
├── Logging estruturado
├── Monitoring setup
└── Error handling

Semana 5: Preparação Beta
├── Staging environment
├── Documentação de API
├── User docs básicos
└── Go-live checklist

LAUNCH: Staging (validação interna) + 5-10 early adopters
```

---

### Q2 2026 - MVP 2.1 (BETA)

```
Integração Stripe
├── Product setup no Stripe
├── Billing logic
├── Webhook handling
└── Invoice generation

Onboarding
├── Wizard de signup
├── Tutorial interativo
├── Defaults inteligentes
└── Email welcome

Dashboard Analytics
├── Charts de progress
├── Stats personalizadas
├── Export de dados
└── Comparativo com metas

Mobile Responsive
├── Breakpoints mobile
├── Touch-friendly UI
├── Performance mobile
└── Offline capability (future)

LAUNCH: Beta privado com 50 usuários pagos (primeiros R$ 1-5k MRR)
```

---

### Q3 2026 - MVP 2.2 (PÚBLICO)

```
Marketing Website
├── Landing page
├── Pricing page
├── Blog/recursos
└── SEO otimizado

Referral System
├── Unique referral links
├── Rewards (créditos)
├── Tracking & attribution
└── Shareable content

Integrações
├── Slack notifications
├── Google Calendar sync
├── Webhook API
└── Zapier/Make.com

LAUNCH: Público (500+ usuários, R$ 5-15k MRR)
```

---

### Q4 2026 - SCALE

```
Mobile App (React Native)
├── iOS build
├── Android build
├── Push notifications
└── Offline sync

Community Features
├── Leaderboards
├── Forum/discussions
├── Challenges
└── Social sharing

Advanced Analytics
├── ML for injury prediction
├── Performance forecasting
├── Peer benchmarking
└── Custom reports

LAUNCH: Contínuo (1k-5k usuários, R$ 20-100k MRR)
```

---

## 📊 Matriz de Impacto vs Esforço

```
              🚀 ALTO IMPACTO

    ┌─────────────────────────────────────┐
    │                                     │
    │  ⭐ Autenticação JWT               │
    │  ⭐ Rate limiting                  │ ← FAZER PRIMEIRO
    │  ⭐ Paginação                      │   (Quick wins)
    │  ⭐ N+1 optimization               │
    │     Testes (80%)                   │
    │     Logging                        │
    │                                    │
    │           Stripe Integration       │
    │           Mobile Responsive        │
    │                                    │
    │  Referral System  │  Mobile App    │
    │  Community        │  Advanced ML   │
    │                   │                │
    └─────────────────────────────────────┘
    BAIXO ESFORÇO  ←→  ALTO ESFORÇO


⭐ = Crítico para MVP 2.0 (Foco agora)
```

---

## 💰 Investimento vs Retorno

### Fase 1: MVP 2.0 (FEV-MAR)

```
Investimento:
├── Tempo desenvolvimento: 200-250h (3-4 pessoas, 4-5 semanas)
├── Custo (R$ 150/h): R$ 30-37.5k
├── Infra (AWS, etc): R$ 2k
├── Total: ~R$ 35-40k

Retorno Esperado:
├── Early adopters: 5-10 usuários
├── Validação de segurança: ✅
├── Redução de risco: Crítica → Média
├── Pronto para beta: ✅

ROI: Não monetário ainda (validação de risco)
```

### Fase 2: MVP 2.1 (ABR-MAI)

```
Investimento:
├── Tempo: 150-200h (2 pessoas, 6-8 semanas)
├── Custo: R$ 22-30k
├── Infra + Stripe: R$ 3k
├── Marketing: R$ 5k
├── Total: ~R$ 30-38k

Retorno Esperado:
├── 50 usuários β ativos
├── MRR: R$ 500-1k
├── Product-market fit validado
├── Pronto para público

ROI: 2-3 meses (R$ 1.5-3k de receita)
```

### Fase 3: MVP 2.2 (JUN-JUL)

```
Investimento:
├── Tempo: 100-150h (1-2 pessoas)
├── Custo: R$ 15-22.5k
├── Marketing: R$ 10k
├── Total: ~R$ 25-32.5k

Retorno Esperado:
├── 500+ usuários
├── MRR: R$ 5-15k
├── Crescimento 10x vs fase anterior
├── Lucrativo

ROI: 2-4 meses (R$ 10-20k de receita)
```

---

## 🎯 Objetivos por Fase

### Phase 1 (MVP 2.0) - "Just Secure It"

**Lema:** "Nenhum usuário vê essa release, mas a empresa não vai quebrar"

```
Objetivo Principal:
  ✅ Eliminar riscos críticos de segurança
  ✅ Validar que pode rodar em produção
  ✅ Preparar infra para 1k+ usuários

Sucesso Significa:
  ✅ 0 vulnerabilidades no pentest
  ✅ Response time < 200ms
  ✅ 99% uptime no staging
  ✅ 80% test coverage
  ✅ 0 unhandled exceptions

Fracasso Seria:
  ❌ Descobrir vulnerabilidade crítica
  ❌ Não conseguir escalar para 1k users
  ❌ Performance < 500ms em listagens
  ❌ Crashes em produção
```

---

### Phase 2 (MVP 2.1) - "Beta Valida"

**Lema:** "50 pessoas reais pagando por isso"

```
Objetivo Principal:
  ✅ Product-market fit com early adopters
  ✅ Validar modelo de receita
  ✅ Iterar com feedback real

Sucesso Significa:
  ✅ 50 usuários β ativos (10+ logins/semana)
  ✅ NPS > 60
  ✅ MRR > R$ 500
  ✅ Churn < 5%
  ✅ Feature adoption > 60%

Fracasso Seria:
  ❌ <30 usuários ativos
  ❌ NPS < 40
  ❌ MRR < R$ 200
  ❌ Churn > 20%
  ❌ Reclamações de bugs críticos
```

---

### Phase 3 (MVP 2.2) - "Launch Público"

**Lema:** "500+ usuários crescendo 50%/mês"

```
Objetivo Principal:
  ✅ Crescimento exponencial
  ✅ PMF confirmado em larga escala
  ✅ Path to profitability claro

Sucesso Significa:
  ✅ 500+ usuários no primeiro mês
  ✅ MRR > R$ 5k
  ✅ 50% MoM growth
  ✅ CAC < R$ 50
  ✅ NPS > 50

Fracasso Seria:
  ❌ <200 usuários no primeiro mês
  ❌ MRR < R$ 2k
  ❌ Growth < 20% MoM
  ❌ CAC > R$ 100
  ❌ Negative reviews
```

---

## 🔄 Feedback Loop & Iteração

### Para Cada Fase

```
1. PLAN
   ├─ Define features
   ├─ Estima tempo
   └─ Aloca recursos

2. BUILD
   ├─ Implementa sprints
   ├─ Testa continuamente
   └─ Monitora progresso

3. MEASURE
   ├─ Coleta métricas
   ├─ Analytics
   └─ User feedback (surveys)

4. LEARN
   ├─ Análisa dados
   ├─ Identifica problemas
   └─ Prioriza ajustes

5. ITERATE
   ├─ Ajusta features
   ├─ Melhora performance
   └─ Volta ao PLAN

Ciclo: 1-2 semanas por iteração
```

---

## 🚀 Go-to-Market Strategy

### MVP 2.0 (Staging)
```
Target: 5-10 early adopters
Canais: Email direto + GitHub
Messaging: "Nova versão segura - teste em staging"
Goal: Validação + feedback
```

### MVP 2.1 (Beta Privado)
```
Target: 50 usuários β
Canais: Email + Slack communities + Reddit r/running
Messaging: "Beta exclusivo - seja um dos primeiros"
Goal: Product feedback + willingness to pay
Incentivo: R$ 49/ano (80% off normal price)
```

### MVP 2.2 (Público)
```
Target: 500+ usuários no primeiro mês
Canais:
  - Organic (SEO, Product Hunt)
  - Partnerships (academias, podcasts)
  - Paid ads (Google/Facebook - R$ 5k budget)
  - Referral program (R$ 49 crédito por ref)

Messaging: "IA que cria seu plano de treino"
Goal: Adquirir clientes pagantes profitavelmente
```

---

## 📊 Dependências & Riscos Estratégicos

### Riscos de Produto

```
RISCO #1: Usuários não querem pagar por isso
├─ Probabilidade: Média (SaaS é hard)
├─ Impacto: Alto (todo modelo falha)
└─ Mitigação:
    • Validar em beta (fase 2)
    • Presença ativa em comunidades
    • Tela de feedback pós-sessão

RISCO #2: Concorrência lança algo similar
├─ Probabilidade: Alta (mercado aquecido)
├─ Impacto: Médio (precisamos diferenciar)
└─ Mitigação:
    • Integração com wearables (Q4)
    • ML para lesão (Q4)
    • Community features (Q3)

RISCO #3: Integração OpenAI fica cara
├─ Probabilidade: Baixa (atual R$ 0.05-0.10 por plano)
├─ Impacto: Alto (margem ruim)
└─ Mitigação:
    • Cache de prompts
    • Fine-tuned model (future)
    • Modelo freemium com limite

RISCO #4: Escala > 5k users gera custo infra
├─ Probabilidade: Média
├─ Impacto: Alto (custos comem lucro)
└─ Mitigação:
    • Arquitetura escalável (feito)
    • Cache distribuído (Sprint 3)
    • CDN para assets (Q2)
```

---

## 👁️ Visão de Longo Prazo (18-24 meses)

### Ano 1: Foundation (Hoje - DEZ 2026)

```
Q1: MVP 2.0 (Seguro)      - Risco crítico → risco médio
Q2: MVP 2.1 (Beta)        - PMF validado
Q3: MVP 2.2 (Público)     - Crescimento inicia
Q4: Scale                 - 1k+ usuários, R$ 50k+ MRR

Objetivo: Atingir product-market fit e crescimento sustentável
```

### Ano 2: Growth (2027)

```
Q1: 10k usuários, R$ 500k+ ARR
Q2: Mobile app launch, 20k usuários
Q3: International expansion (LATAM)
Q4: 50k usuários, R$ 2-5M ARR, caminho para profitabilidade

Objetivo: Consolidar posição de liderança
```

### Visão 10 Anos

```
Menthoros como:
  ✅ Plataforma de referência para treinamento atlético
  ✅ 1M+ usuários ativos globalmente
  ✅ R$ 50M+ ARR
  ✅ IPO ou aquisição por Nike/Strava
  ✅ Impacto positivo em 1M+ vidas (lesões evitadas)
```

---

## 🎓 Conclusão - Visão de Produto

**Menthoros está em um ponto crítico:**

1. **MVP 1.0** foi criado e validou a ideia ✅
2. **MVP 2.0** precisa de investimento em segurança/performance para ser viável 🔴
3. **MVP 2.1-2.2** abrirá caminho para crescimento exponencial 📈

**Com as melhorias recomendadas (Fases 1-3), esperamos:**

- **JUN 2026:** Produto pronto para público
- **AGO 2026:** Primeira receita significativa (R$ 2-5k MRR)
- **DEZ 2026:** 1k+ usuários, PMF validado, path to profitability claro
- **2027:** 10k+ usuários, R$ 500k+ ARR

**Investimento necessário:** ~R$ 100-150k (desenvolvimento + marketing)
**Retorno esperado:** R$ 500k+ ARR em 12 meses = 5x ROI

---

**Status:** 🟢 PRODUTO VIÁVEL, PRECISA APENAS DE EXECUÇÃO DISCIPLINADA

---

Próximo documento: PLANO_ENTREGAS.md com sprint-by-sprint breakdown
