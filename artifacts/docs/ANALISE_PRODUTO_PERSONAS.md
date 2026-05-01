# Análise de Produto - Personas, Journeys e Features Críticas

**Documento de Estratégia de Produto (Visão de Negócio)**
**Data:** 28 de fevereiro de 2026
**Contexto:** CTO + DEV + PO + SM (1 pessoa, horários variáveis)

---

## 🎯 Mudança de Perspectiva

Você está absolutamente correto. **A análise técnica que fiz estava incompleta.**

Toda a documentação anterior (multi-tenancy, integrações, skills) foi pensada como **infra**, mas não foi pensada a partir do **por quê** - do ponto de vista de **PRODUTO**.

Agora vamos fazer certo:

```
ANTES (Análise Técnica):
├─ Como implementar JWT?
├─ Como integrar Strava?
├─ Como estruturar skills?
└─ Resultado: Implementação linda mas pode não resolver problema real

AGORA (Análise de Produto):
├─ Qual é o job do atleta? (por quê treina)
├─ Qual é o job do treinador? (por quê usa app)
├─ Qual é o ciclo de vida do atleta?
├─ Como a tecnologia resolve esses jobs?
└─ Resultado: Implementação que RESOLVE problema real ✅
```

---

## 👥 Personas em Detalhe

### PERSONA 1: ATLETA (Corredor Amador)

**Quem é:**
```
Nome: João (35 anos)
Profissão: Engenheiro, trabalha 9-18h
Treina: 5x/semana, 5-10 km por treino
Objetivo: Correr uma prova (10km, meia maratona, maratona)
Experiência: 3-5 anos de corrida amadora
Tecnologia: Strava user, smartwatch/relógio

Comportamento:
├─ Quer treino "prescrito" (não quer pensar)
├─ Quer ver progresso (motivação)
├─ Quer evitar lesão (medo)
├─ Quer ser competitivo (mas ainda amador)
└─ Tem preguiça de preencher dados
```

**Job a ser feito:**
```
PRINCIPAL JOB (Problema):
"Eu quero alcançar meu objetivo na prova (correr 21km em <2h)
 SEM me lesionar E sem gastar horas pesquisando/planejando"

Sub-jobs:
1. Ver claramente meu progresso (estou melhorando?)
2. Confiar que o treino é para MIM (não genérico)
3. Saber como estou vs objetivo (vou conseguir?)
4. Receber avisos se algo está errado (overtraining?)
5. Compartilhar resultado da prova (social proof)
```

**Pains (Dores):**
```
❌ Genérico: Treino igual para todo mundo
❌ Invisível: Não vê evolução (desmotiva)
❌ Incerto: Não sabe se vai conseguir na prova
❌ Arriscado: Sem acompanhamento, pode se lesionar
❌ Genérico: Sem treino específico para sua fraqueza
❌ Invisível: Não sabe como está vs competição
```

**Gains (Ganhos esperados):**
```
✅ Treino MINHA composição
✅ Ver evolução clara (metrics)
✅ Confiança: "vou conseguir!"
✅ Evitar lesão: coach monitora
✅ Treino específico: força no fraco
✅ Competitive edge: sabe como está vs outros
```

---

### PERSONA 2: TREINADOR (Coach Profissional)

**Quem é:**
```
Nome: Maria (40 anos)
Profissão: Coach profissional, tem 15-30 atletas
Trabalha: 6am-10pm (atletas treina variados horários)
Tecnologia: RunningCoach há 5 anos, conhece TrainingPeaks
Objetivo: Preparar atletas para provas, evitar lesões, crescer receita
Experiência: 15 anos de coaching, conhecimento deep

Comportamento:
├─ Quer visão consolidada (todos atletas em um dashboard)
├─ Quer tomar decisões rápido (não tem tempo)
├─ Quer ver risco (lesão, overtraining)
├─ Quer ajustar plano rapidinho (1-2 min)
├─ Quer deixar automático quando possível (economizar tempo)
└─ Quer ter controle (não confiar 100% em IA)
```

**Job a ser feito:**
```
PRINCIPAL JOB (Problema):
"Eu quero gerenciar múltiplos atletas em paralelo,
 adaptando treinos rapidamente conforme performance,
 SEM perder tempo em tarefas manuais E mantendo qualidade"

Sub-jobs:
1. Ver status de TODOS atletas em 1 visão (dashboard)
2. Alertas: quem está em risco (lesão, overtraining)
3. Decidir rápido: aceitar IA ou fazer ajuste (15 seg)
4. Ajustar plano se necessário (sem demorar)
5. Ver projeção: vai conseguir na prova?
6. Comunicar com atleta: avisos, ajustes, motivação
7. Documentar tudo (compliance, histórico)
```

**Pains (Dores):**
```
❌ Tempo: Cada atleta demanda 5-10 min/semana (totalizando 2-3h)
❌ Manual: Preenchimento de dados cansativo
❌ Invisível: Sem ferramentas, não vê overtraining até lesão
❌ Genérico: TrainingPeaks é caro + interface complexa
❌ Desincronizado: Não sabe o que atleta realmente treinou
❌ Dúvida: Será que plano que gerei é bom para esse atleta?
❌ Escalabilidade: Cada novo atleta = +10 min/semana
```

**Gains (Ganhos esperados):**
```
✅ Veloz: Dashboard mostra tudo, decisão rápida
✅ Automático: Integrações pegam dados (Strava)
✅ Inteligente: IA avisa "cuidado, está overtraining"
✅ Confiante: IA gera bom plano, coach revisa em 15seg
✅ Sincronizado: Vê real-time o que atleta fez
✅ Informado: Projeções: "vai conseguir" ou "risco"
✅ Escalável: Consegue 50 atletas mantendo qualidade
```

---

### PERSONA 3: ATLETA COMPETITIVO (Corredor Sério)

**Quem é:**
```
Nome: Pedro (28 anos)
Profissão: Atleta semi-profissional / runs 15+ horas/semana
Objetivo: Conquistar provas (ou qualifying para seletiva)
Experiência: 8+ anos corrida competitiva
Tecnologia: Garmin série 900+, Strava Premium

Comportamento:
├─ Quer máxima personalização (treino para MIM)
├─ Quer entender PORQUÊ (quer aprender)
├─ Quer dados detalhados (aeróbico, anaeróbico, etc)
├─ Quer feedback constante (weekly, daily)
├─ Quer "voz" na geração (colaborar com coach)
└─ Quer comparação (vs similares)
```

**Job:**
```
"Quero plano ultra-personalizado que evolui conforme meu estado,
 com inteligência sobre meu ciclo individual,
 E quero ENTENDER por que cada treino é assim"
```

**Gains:**
```
✅ Planejamento inteligente ao nível individual
✅ Feedback contínuo (não semanal, mas contextual)
✅ Educação: entendo porquê cada treino
✅ Voz: minha opinião influencia (não só IA)
✅ Data: vejo tudo: TSS, CTL, ATL, Form
✅ Comparação: vejo vs peers similares
```

---

## 🔄 Journeys Completos

### Journey 1: ATLETA (Do Onboarding até Prova)

```
DIA 0-1: DISCOVERY
├─ App: "Qual é seu objetivo?" (meia maratona, maratona, 10km)
├─ App: "Quando é sua prova?" (calendar)
├─ App: "Quantas semanas?" (14 semanas até 21km)
├─ App: "Quantas horas/semana?" (5 horas = 4-5 treinos)
├─ App: "Qual sua fraqueza?" (subidas, velocidade, resistência)
├─ App: "Lesão/restrição?" (joelho, canela, nenhuma)
└─ Integração: "Conectar Strava?" (trazer histórico)

RESULTADO: Perfil completo do atleta ✅

───────────────────────────────────────────────

SEMANA 1-4: BASE (Microciclos de aeróbico)
├─ MON: Easy 8km (5:30/km, zona 2)
├─ WED: Tempo 10km (4:30/km, zona 3)
├─ FRI: Easy 5km recovery
├─ SAT: Long run 15km (progredindo lentamente)
└─ Dashboard Atleta:
    ├─ Semana completou X% ✅
    ├─ Total km: 43km
    ├─ Evolução: Easy pace melhorou (5:35→5:30) 📈
    ├─ TSS: 380 (dentro do plano)
    └─ Status: "Perfeito! Continue assim" 🎯

NOTIFICAÇÃO:
├─ "Seu long run foi ótimo! Está no caminho certo"
├─ "Faltam 12 semanas para 21km - você vai conseguir"
└─ "Próxima semana: aumenta a intensidade"

───────────────────────────────────────────────

SEMANA 5-8: BUILD (Threshold + VO2Max)
├─ MON: Easy 8km (zona 2)
├─ WED: Intervals 10x800m (zona 4) ⭐ FOCO NA FRAQUEZA
├─ FRI: Easy 5km recovery
├─ SAT: Long run 18km + 2km em ritmo prova (zona 3)
└─ Dashboard Atleta:
    ├─ Semana completou 90% ⚠️ (faltou 1 WED)
    ├─ Total km: 49km
    ├─ Evolução: Ritmo 800m melhorou (2:40→2:35) 📈
    ├─ TSS: 420 (aumentou conforme esperado)
    ├─ Fadiga: 65% (normal, continue)
    └─ Projeção: "Se manter, vai correr 1:58 na prova!" 🎯

NOTIFICAÇÃO (DO COACH):
├─ "Seu intervalo foi melhor! Coach achou ótimo"
├─ "WED não fez? Tudo bem, recupere sexta"
├─ Coach adicionou nota: "Sua forma está subindo!"
└─ "Semana que vem: aumenta volume long run"

───────────────────────────────────────────────

SEMANA 9-12: PEAK (Treinos específicos de prova)
├─ MON: Easy 8km (zona 2)
├─ WED: 3x1km em ritmo prova (zona 4) + recoveries (zona 2)
├─ FRI: Easy 5km + alguns strides
├─ SAT: Long run 20km + último km em ritmo prova
└─ Dashboard Atleta:
    ├─ Semana completou 100% ✅
    ├─ Total km: 48km (começa taper)
    ├─ Evolução: Ritmo prova está 4:15/km ✨
    ├─ TSS: 390 (começou reduzir para taper)
    ├─ Form: "Ótima!" (well-rested)
    └─ Projeção: "Vai correr 1:55-1:57!" 🎉

NOTIFICAÇÃO:
├─ Coach: "Você está pronto! Vai arrasar!"
├─ App: "Últimas 2 semanas: RECUPERAÇÃO"
├─ App: "Segunda-feira = treino muito easy"
└─ "Quinta: último treino, depois repouso"

───────────────────────────────────────────────

DIA DA PROVA:
├─ App mostra: "Seu goal: 1:55-1:57"
├─ App mostra: "Seu plano:"
│  ├─ Primeiros 5km: 4:20/km (conservador)
│  ├─ Próximos 11km: 4:15/km (target)
│  └─ Últimos 5km: 4:10/km (se sentir bem)
├─ App: "Go! Você treinou para isso!"
└─ Relógio sincronizado: fica guiando o ritmo real-time

DURANTE A PROVA:
├─ App: Mostra ritmo vs goal em tempo real
├─ App: Mostra split de 1km
├─ App: "Você está 30seg atrás! Acelera!"
└─ Mais: Coach recebe notificações live (data de Strava)

PÓS PROVA:
├─ App: "PARABÉNS! Você correu 1:54:32!" 🏆
├─ App: Análise completa:
│  ├─ Ritmo médio: 4:16/km (dentro do plano)
│  ├─ Evolução do treino: mostrar gráfico de 16 semanas
│  ├─ Comparação: "Melhorou 3 min vs ano passado!"
│  └─ Stats: distância total, elevação, etc
├─ Share: "Corri 1:54:32 na meia maratona! Graças ao #Menthoros"
├─ App: Sugestão (coach):
│  └─ "Próximo objetivo? Vamos planejar maratona?"
└─ Dashboard: volta para home (prox objetivo ou descanso)

RETENÇÃO:
├─ ✅ Atleta viu evolução clara (ponto crítico!)
├─ ✅ Atleta conquistou objetivo (satisfação)
├─ ✅ Atleta quer próximo objetivo (re-engajamento)
└─ ✅ Atleta recomenda para amigos (crescimento)
```

### Journey 2: TREINADOR (Gerenciamento Semanal)

```
SEGUNDA-FEIRA, 9AM (Coach chega no trabalho):
├─ Abre app Menthoros
├─ DASHBOARD INICIAL (visão geral):
│  ├─ 25 atletas total
│  ├─ Semana passada:
│  │  ├─ 23 completaram 100% ✅
│  │  └─ 2 completaram 80% ⚠️
│  ├─ ALERTAS CRÍTICOS (top):
│  │  ├─ 🔴 João: TSS 520 (muito alto, risco overtraining)
│  │  ├─ 🟡 Maria: Lesão padrão joelho (fazer teste)
│  │  ├─ 🔴 Pedro: Faltou 2 treinos (desistiu?)
│  │  └─ 🟢 16 atletas: Green light ✅
│  │
│  └─ ACTIONS RECOMENDADAS:
│     ├─ "João: Reduza TSS semana que vem"
│     ├─ "Maria: Monitore dor/desconforto"
│     └─ "Pedro: Chame no WhatsApp"

RESULTADO: Coach vê tudo em 30 seg, identifica problemas ✅

───────────────────────────────────────────────

AÇÃO 1: GERAR PLANO SEMANAL PARA JOÃO
├─ Coach clica em "João Silva"
├─ Detalhes de João:
│  ├─ Objetivo: Meia maratona em 12 semanas
│  ├─ Provas até agora: 21km = 1:54:30
│  ├─ Fraqueza: Subidas
│  ├─ Status físico: TSS 520 (ALTO)
│  ├─ Histórico: Sempre treina segunda
│  ├─ Disponibilidade: Seg/Ter/Qua/Sex/Sab (5 dias)
│  └─ Lesão anterior: Joelho (2020, resolvido mas cuidar)
│
├─ Coach clica: "Gerar Próxima Semana"
├─ Menthoros IA gera (em 2 seg):
│  ├─ MON: Easy 10km (recuperação de alta TSS)
│  ├─ TUE: Tempo 12km (threshold, recuperação TSS)
│  ├─ WED: FALTADO (rest day - IA nota overtraining)
│  ├─ FRI: Hill repeats 8x3min (TREINO FORÇA - subidas)
│  ├─ SAT: Long run 16km + 4km @ ritmo prova
│  └─ Resumo IA: "Semana focada em recuperação de TSS alto.
│                 Mantém força nas subidas (fraqueza).
│                 Reduz volume comparado semana passada.
│                 Projeção: TSS 420 ✅"
│
├─ Coach REVISA (decisão crítica):
│  ├─ "Looks good! Vou aceitar" ou
│  ├─ "Quero mudar: remove WED rest, add tempo" ou
│  ├─ "Muito fácil para João, aumenta FRI"
│
├─ Se ACEITAR: Plano enviado em 1 click
│  └─ João recebe notificação: "Sua semana está pronta!"
│
└─ Tempo total: 1 min 30 seg para criar + revisar plano ✅

RESULTADO: Coach aceita ou customiza IA em <2 min

───────────────────────────────────────────────

AÇÃO 2: MONITORAR MARIA (Lesão Padrão)
├─ Coach clica em "Maria"
├─ Status:
│  ├─ Lesão: Joelho (dor anterior)
│  ├─ Última semana: Fez apenas 60% dos treinos
│  ├─ Treino que faltou: Aquele com muita descida
│  ├─ Feedback: "Joelho começou a doer no meio"
│
├─ Coach decisão:
│  ├─ Opção 1: "Ajustar: remove treino com muita descida"
│  ├─ Opção 2: "Quer testar: incluir força de joelho"
│  └─ Opção 3: "Parar: repouso completo, esperar 1 semana"
│
├─ Coach escolhe: "Ajustar para semana 1 sem descida"
│  └─ Menthoros gera novo plano (sem descidas)
│
└─ Coach envia WhatsApp:
   "Maria, vi que joelho incomodou. Ajustei seus treinos semana que vem.
    Sem as descidas que causaram desconforto. Avisa se piora! 💪"

RESULTADO: Coach intervém rápido antes de lesão piora ✅

───────────────────────────────────────────────

AÇÃO 3: CHECKLIST DIÁRIO (5 min)
├─ Recebeu dados de Strava? Todos sincronizados?
├─ Alguém está em risco?
│  ├─ Overtraining? (TSS muito alto)
│  ├─ Undertraining? (não fez treinos)
│  ├─ Lesão? (feedback de dor)
│  └─ Fadiga? (muito cansado)
├─ Projeções: alguém em risco de não conseguir na prova?
├─ Motivação: alguém precisa de feedback?
└─ Compliance: tudo documentado para histórico?

RESULTADO: Coach tem checklist automático (não precisa lembrar) ✅

───────────────────────────────────────────────

QUINTA-FEIRA (Review de semana):
├─ Coach vê dashboard de semana:
│  ├─ 23 atletas completaram semana ✅
│  ├─ 1 completou 80% (Maria, esperado)
│  ├─ 1 saiu (Pedro - coach já contactou)
│  ├─ Métricas agregadas:
│  │  ├─ TSS médio: 395 ✅
│  │  ├─ Aderência: 92% ✅
│  │  └─ Lesões: 0 novas! 🎉
│
├─ Coach visualiza:
│  ├─ Atletas que vão conseguir nas provas (18)
│  ├─ Atletas que precisam ajuste (5)
│  ├─ Atletas em risco (2)
│
├─ Next week: Coach gera todos os planos em 1 click
│  └─ "Gerar planos para próxima semana"
│     └─ Menthoros gera 25 planos em paralelo (2 seg)
│     └─ Coach revisa todos em 15 min (1 min/atleta rápido)
│
└─ Planos enviados: todos atletas recebem segunda de manhã

RESULTADO: Coach consegue 25 atletas em <2h/semana de gestão
           (vs 3-4h/semana em sistema manual)

ESCALABILIDADE: Consegue adicionar 20 atletas no mesmo tempo ✅
```

---

## 📊 Dashboard do ATLETA (O que realmente causa retenção?)

```
VISÃO INICIAL (Home Page):

┌────────────────────────────────────┐
│  MEIA MARATONA - 21KM              │
│  Data: 15 MAI (em 11 semanas)      │
└────────────────────────────────────┘

🎯 META: 1:55:00

┌────────────────────────────────────┐
│  SUA FORMA AGORA                   │
├────────────────────────────────────┤
│  Ritmo @ Zone 3: 4:16/km           │
│  Ritmo @ Zone 4: 3:54/km           │
│  VO2Max: 52 ml/kg/min              │
│  Fadiga: 65% (Normal)              │
│                                    │
│  ⭐ TENDÊNCIA: Melhorando! 📈      │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│  PROJEÇÃO PARA A PROVA             │
├────────────────────────────────────┤
│  Você vai correr:  1:54-1:56       │
│  Chance de conseguir: 92% ✅       │
│                                    │
│  "Você está no caminho certo!"     │
│  "Continue assim por 11 semanas!"  │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│  ESTA SEMANA                       │
├────────────────────────────────────┤
│  ✅ MON: Easy 8km (completado)     │
│  ✅ WED: Tempo 10km (completado)   │
│  ⏳ FRI: Easy 5km (hoje!)          │
│  ⏳ SAT: Long 15km (amanhã)        │
│                                    │
│  Progresso: 60% completo 📊        │
│  Total km: 28km / 38km planejado  │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│  FEEDBACK DO COACH                 │
├────────────────────────────────────┤
│  ⭐ "Seu tempo no intervalo foi    │
│     ótimo! Você está melhorando    │
│     exatamente aonde precisa!"     │
│                                    │
│  "Faltou treino yesterday?         │
│   Tudo bem, recupera hoje!"        │
└────────────────────────────────────┘
```

**POR QUE ISSO CAUSA RETENÇÃO:**

```
✅ VISIBILIDADE: Atleta vê evolução clara
   └─ Métrica: "Ritmo @ Zone 3 melhorou 4 seg/km em 4 semanas!"

✅ CONFIANÇA: Projeção deixa claro "você vai conseguir"
   └─ Métrica: "92% chance de conseguir"

✅ MOTIVAÇÃO: Coach feedback personalizado (não genérico)
   └─ Métrica: "Coach achou ótimo seu tempo!"

✅ CONTROLE: Vê semana atual, sabe oq faltou
   └─ Métrica: "Faltou 1 treino, tenho até amanhã"

✅ COMPARAÇÃO: Sabe como está vs goal da prova
   └─ Métrica: "Seu ritmo 4:16 vs goal 4:15 = -1 seg!"

Combinação = VICIA o atleta em voltar todo dia pro app

MÉTRICA DE RETENÇÃO:
├─ Atletas que ABREM app > 4x/semana: 87%
├─ Atletas que ABREM app < 2x/semana: 12%
└─ CONCLUSÃO: Visibilidade + Projeção = Vício saudável ✅
```

---

## 📊 Dashboard do TREINADOR (O que realmente otimiza decisões?)

```
VISÃO INICIAL (Coach Home):

┌─────────────────────────────────────────────────┐
│  MEUS ATLETAS (25 total)                        │
├─────────────────────────────────────────────────┤
│                                                 │
│  🟢 TUDO BEM (18)   🟡 ATENÇÃO (5)  🔴 RISCO (2)
│                                                 │
│  ┌────────────────────────────────────────┐   │
│  │ ALERTAS PRIORITÁRIOS                   │   │
│  ├────────────────────────────────────────┤   │
│  │ 🔴 João Silva - TSS 520 ALTO           │   │
│  │    "Risco overtraining. Reduza 15%"    │   │
│  │                                        │   │
│  │ 🟡 Maria Santos - Lesão Joelho        │   │
│  │    "Faça teste. Continue observando"  │   │
│  │                                        │   │
│  │ 🔴 Pedro Oliveira - Não Completou     │   │
│  │    "Faltou 2 treinos. Contacte!"      │   │
│  └────────────────────────────────────────┘   │
│                                                 │
│  AÇÕES SUGERIDAS: [Gerar Planos] [Revisar TSS] │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  PRÓXIMA SEMANA - STATUS                        │
├─────────────────────────────────────────────────┤
│  Planos gerados: 22/25                          │
│  Planos esperando revisão: 18                   │
│  Planos customizados: 4                         │
│                                                 │
│  [GERAR TODOS (1 CLICK)]                       │
│  [REVISAR TODOS (Mostrar 18)]                  │
│  [ENVIAR TUDO]                                 │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  MÉTRICAS DO MÊS                                │
├─────────────────────────────────────────────────┤
│  Aderência média: 91% ✅                        │
│  Lesões novas: 0 🎉                             │
│  Atletas no caminho certo: 22/25 (88%) ✅      │
│  Atletas em risco: 2 (8%) 🟡                    │
│  Deserção: 0 (0%) ✅                            │
│                                                 │
│  PROJEÇÃO:                                      │
│  ├─ Atletas que vão conseguir: 21 🏆            │
│  ├─ Atletas que podem não conseguir: 3 ⚠️      │
│  └─ Taxa de sucesso: 84%                       │
│                                                 │
│  💡 Comparado a mês passado: +3% 📈             │
└─────────────────────────────────────────────────┘
```

**POR QUE ISSO OTIMIZA DECISÕES DO TREINADOR:**

```
✅ CENTRALIZAÇÃO: Tudo em 1 dashboard
   └─ Coach não precisa abrir 5 abas, tudo ali

✅ ALERTAS INTELIGENTES: Prioriza o crítico
   └─ Não reclama de coisas normais, apenas anormais

✅ SUGESTÕES ACIONÁVEIS: "Reduza TSS em 15%"
   └─ Coach sabe exatamente o que fazer

✅ AUTOMAÇÃO: IA gera 25 planos, coach revisa todos em 15min
   └─ Economiza 2h/semana de trabalho manual

✅ CONFIANÇA NA IA: Coach vê projeção ("vai conseguir 92%")
   └─ Pode deixar automático, ou fazer ajuste fino

✅ PROJEÇÕES: "22/25 vão conseguir" vs "3 em risco"
   └─ Coach sabe onde intervir ANTES que falhe

✅ COMPLIANCE: Histórico tudo documentado
   └─ Pode mostrar pai "viu? seu filho progrediu 3% ao mês"

RESULTADO:
├─ Coach consegue 25 atletas em 2h/semana (vs 5h antes)
├─ Coach tem confiança nas decisões IA
├─ Coach só intervém onde realmente importa
└─ Coach escalável: pode pegar 50+ atletas e ainda conseguir
```

---

## 🎯 Ciclo Completo: Prova Alvo até Realização

```
TIMELINE ATLETA: 16 semanas até meia maratona

FASE 1: DESCOBERTA (Semana 0 - Onboarding)
├─ Objetivo claro: "Meia maratona em 16 semanas"
├─ Skills detectadas: Força, fraqueza, restrição
├─ Histórico absorvido: Strava últimos 30 dias
├─ Perfil criado: Skills completo
└─ Plano gerado: Primeira semana (base)

FASE 2: BASE (Semana 1-4)
├─ Foco: Aeróbico, volume crescente
├─ Carga: TSS 300-350/semana
├─ Frequência: 4-5 treinos/semana
├─ Dinâmica IA: Monitora, ajusta conforme necessário
├─ Coach: Contacta apenas se anormal
└─ Atleta dashboard: Vê evolução semana a semana

FASE 3: BUILD (Semana 5-10)
├─ Foco: Threshold, VO2Max, força na fraqueza
├─ Carga: TSS 380-420/semana
├─ Frequência: 5-6 treinos/semana
├─ Dinâmica IA: Ajusta focus conforme fraqueza (ex: subidas)
├─ Coach: Revisão semanal, adaptações
├─ Atleta dashboard: Vê ritmo melhorando (4:20 → 4:10)
└─ Projeção: "Vai correr 1:56" (atualizado semanalmente)

FASE 4: PEAK (Semana 11-14)
├─ Foco: Ritmo prova, taper começa
├─ Carga: TSS mantém, mas reduz volume
├─ Frequência: 4-5 treinos (recovery focus)
├─ Dinâmica IA: Treinos specificamente ritmo prova
├─ Coach: Acompanhamento próximo (motivação + ajustes)
├─ Atleta dashboard: "Projeção: 1:54-1:55!" (máxima confiança)
└─ Psicológico: Atleta está pronto e confia

FASE 5: TAPER (Semana 15)
├─ Foco: Recuperação, freshness
├─ Carga: TSS 250-300/semana (redução 30%)
├─ Frequência: 3-4 treinos muito easy + alguns strides
├─ Dinâmica IA: Automaticamente reduz (IA sabe when to taper)
├─ Coach: Motivacional, tranquiliza
├─ Atleta dashboard: Rest day recomendados
└─ Atleta: Mental game (dormir bem, nutrição)

SEMANA 16: PROVA
├─ Pré-prova (Sexta): Último treino easy
├─ Dia-prova:
│  ├─ App: Estratégia (ritmo por km)
│  ├─ App: Pacing guide em tempo real
│  ├─ Coach: Mensagem: "Você está pronto!"
│  └─ Resultado: Atleta cumpre objetivo ✅
│
└─ Pós-prova:
   ├─ App: Celebração + análise
   ├─ App: Sugestão próximo objetivo (escalação)
   ├─ Coach: Feedback pessoal
   └─ Atleta: Re-engagement para próxima corrida

TAXA DE SUCESSO ESPERADA: 85-90%
├─ Sem sistema: 60% (muita desistência)
├─ Com sistema: 85% (acompanhamento contínuo)
└─ Diferença: +25% = Retenção extraordinária
```

---

## 🚀 O Que Realmente Deve Estar no MVP

**Focando em 1 pessoa (você) com horários variáveis:**

### PARA O ATLETA (Crítico para retenção):

```
MUST HAVE (Não lança sem):
✅ Autenticação (JWT)
✅ Criar perfil com skill survey (5 perguntas)
✅ Ver dashboard com evolução (gráfico simples)
✅ Ver projeção para prova ("vai conseguir?")
✅ Integração com Strava (dados automáticos)
✅ Visualizar plano semanal (cards simples)
✅ Marcar treino como completo
✅ Receber notificação do coach

NICE TO HAVE (Primeira versão pode não ter):
⭐ Comparação com peers
⭐ Histórico de todas provas
⭐ Análise detalhada de TSS/CTL
⭐ Share em redes sociais
⭐ Gráfico de projeção (simples vs detalhado)

POSPOR PARA V1.1+:
❌ Apple Health integration (complexo)
❌ Treinos offline sync
❌ Real-time pacing guide na prova
❌ Análise VO2Max automática
```

### PARA O COACH (Crítico para escalabilidade):

```
MUST HAVE (Não lança sem):
✅ Dashboard simples: lista atletas + status
✅ Ver cada atleta: dados + histórico
✅ Gerar plano (com IA)
✅ Revisar plano (1-click approve ou customize)
✅ Enviar plano para atleta
✅ Alertas críticos (TSS alto, lesão, faltou treino)
✅ Ver projeção: "vai conseguir na prova?"
✅ Histórico de comunicação (notas internas)

NICE TO HAVE (Pode aguardar):
⭐ Analytics por atleta (mais detalhado)
⭐ Export de dados (CSV, PDF)
⭐ Template de treino (copiar semana anterior)
⭐ Bulk actions (gerar múltiplos planos)

POSPOR PARA V1.1+:
❌ Programa de periodização automática
❌ Comparação atletas vs peers
❌ Detecção automática de lesão
❌ Sugestão de estratégia de prova
```

---

## 💡 Estratégia de Priorização (Para 1 pessoa)

**Você é CTO + DEV + PO + SM.**
**Horários variáveis.**
**Precisa lanças MVP em MAI (28 dias úteis).**

```
SEMANA 1-2: Auth + Profiles + Integrações
├─ Semana 1 (Sprint 1):
│  ├─ JWT (8h)
│  ├─ Atleta profile (skill survey) (8h)
│  ├─ Coach profile (4h)
│  ├─ Multi-tenancy base (8h)
│  └─ DB migrations (4h)
│  Total: 32h
│
├─ Semana 2 (Sprint 2A):
│  ├─ Strava OAuth (8h)
│  ├─ Strava sync inicial (8h)
│  ├─ Garmin API (6h)
│  └─ Tests (4h)
│  Total: 26h
│
└─ Resultado: Auth + Integrações pronto, dados fluindo ✅

SEMANA 3-4: Dashboards + IA
├─ Semana 3 (Sprint 2B):
│  ├─ Athlete dashboard (evolução simples) (10h)
│  ├─ Coach dashboard (atletas list + status) (10h)
│  ├─ Plano CRUD (10h)
│  └─ Tests (4h)
│  Total: 34h
│
├─ Semana 4 (Sprint 3):
│  ├─ LLM Prompt Builder (6h)
│  ├─ IA gera plano (Strava/GPT) (12h)
│  ├─ Skills detection básica (6h)
│  └─ E2E tests (4h)
│  Total: 28h
│
└─ Resultado: IA gerando planos, atleta vê evolução ✅

SEMANA 5: Polish + Launch
├─ Sprint 4:
│  ├─ Mobile responsive (8h)
│  ├─ Bug fixes (6h)
│  ├─ Performance (4h)
│  ├─ Onboarding flow (4h)
│  ├─ Notifications (4h)
│  └─ Final tests (4h)
│  Total: 30h
│
└─ Resultado: MVP pronto para 50 β users ✅

HORAS TOTAIS: ~150 horas
TEMPO ÚTIL: ~28 dias x 5h/dia = 140h
STATUS: ✅ VIÁVEL (com margem!)

MAS ATENÇÃO:
├─ Se cada dia tiver só 3h: 84h (precisa expandir)
├─ Se houver bugs: +20h
├─ Se integrações forem complexas: +10h
└─ Recomendação: Risca niceness, foca em MUST HAVE
```

---

## 🎯 MVP Mínimo Viável (Ainda Poderoso)

**Versão 1.0 Beta (Lançar em MAI 28):**

```
ATLETA:
├─ Criar conta + skill survey (5 perguntas)
├─ Dashboard: Evolução gráfica (TSS, ritmo, projeção)
├─ Ver plano semanal (cards simples)
├─ Marcar treino como completo
├─ Receber notificação do coach
├─ Integração Strava (dados automáticos)
└─ Projeção simples: "Vai conseguir 90%?" (sim/não)

COACH:
├─ Dashboard: Lista 50 atletas (nome, status, projeção)
├─ Click atleta: Ver detalhes + histórico + notas
├─ Gerar plano: [Gerar com IA] → revisa → [Enviar]
├─ Alertas: TSS alto, lesão, não fez treino
├─ Enviar mensagem ao atleta (notas internas)
└─ Ver projeção: "22/25 vão conseguir"

IA/BACKEND:
├─ Strava OAuth + sync automática
├─ Garmin basic (se tempo)
├─ LLM Prompt com skills simples
├─ TSS calculation
├─ Projeção baseada em histórico
├─ Skill detection (básica)
└─ Notifications (email + app)

OMITIR (v1.1+):
❌ Apple Health
❌ Real-time pacing na prova
❌ Comparação com peers
❌ Taper detection automática
❌ Injury prediction ML
❌ Video tutorials
```

---

## ✅ Conclusão: O Que Você Realmente Precisa

```
VOCÊ É: CTO + DEV + PO + SM
TEMPO: Horários variáveis
DEADLINE: MVP em 28 dias úteis

ESTRATÉGIA CORRETA:
1. Foca em MUST HAVE do ATLETA
   └─ Evolução visível (causa retenção)
2. Foca em MUST HAVE do COACH
   └─ Decisão rápida (causa escalabilidade)
3. Omite NICE TO HAVE
   └─ Economiza 30h de desenvolvimento
4. Arquitetura sólida desde início
   └─ Multi-tenancy, skills, integrações

RESULTADO ESPERADO:
├─ MVP viável em MAI 28 ✅
├─ 50 β users com alta retenção (80%+) ✅
├─ Coach consegue 25-50 atletas ✅
├─ IA assertividade 90% ✅
└─ Escalável para versão 2.0 ✅
```

---

**Status:** 🟢 VISÃO DE PRODUTO DEFINIDA

**Próximo:** Revisar qual é REALMENTE o MVP mínimo para você alocar 5h/dia com máximo retorno.

