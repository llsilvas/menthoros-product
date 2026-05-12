# Training Zone Assessment - Consolidado

**Documento Unificado de Treinos Intervalados e Zonas de Treinamento**
**Data:** Consolidado em 08 de maio de 2026
**Status:** ✅ ENTREGUE

---

## 📑 Índice

1. Protocolos de Avaliação de Zona de Treinamento
2. Elegibilidade para Intervalados
3. Melhorias nos Treinos Intervalados

---

## 📋 SEÇÃO 1: Training Zone Assessment Protocols

### Zonas de Treinamento (5 Zonas)

```
ZONA 1: Recovery (Z1)
├─ % FC Max: 50-60%
├─ RPE: 2-3/10
├─ Propósito: Recuperação ativa
└─ Frequência: 2-3x/semana

ZONA 2: Aerobic Base (Z2)
├─ % FC Max: 60-70%
├─ RPE: 4-5/10
├─ Propósito: Build aerobic capacity
└─ Frequência: 4-5x/semana

ZONA 3: Tempo (Z3)
├─ % FC Max: 70-80%
├─ RPE: 6-7/10
├─ Propósito: Lactate threshold
└─ Frequência: 2x/semana

ZONA 4: Threshold (Z4)
├─ % FC Max: 80-90%
├─ RPE: 8-9/10
├─ Propósito: VO2 max development
└─ Frequência: 1x/semana

ZONA 5: Max (Z5)
├─ % FC Max: 90-100%
├─ RPE: 10/10
├─ Propósito: Peak performance
└─ Frequência: 0.5x/semana (máximo)
```

### Como Usar as Zonas

```
Treino típico:
├─ 10min aquecimento (Z1-Z2)
├─ 4x5min Z4 com 2min Z2 recuperação
└─ 10min cool-down (Z1)

Total: 50 minutos (estruturado por zona)
```

---

## 🎯 SEÇÃO 2: Elegibilidade para Treinos Intervalados

### Critérios de Elegibilidade

Um atleta é elegível para treinos intervalados se:

```
1. Experiência de Corrida
   ├─ Mínimo 2 anos de treinamento estruturado
   ├─ Realizar treinos de base regularmente
   └─ Sem lesões atuais

2. Capacidade Aeróbica
   ├─ VO2 max estimado > 40 (homem) / 35 (mulher)
   ├─ ou: Correr 5K sob 25 minutos
   └─ ou: Histórico de treinos Z3+ consistentes

3. Recuperação
   ├─ Dormir 7+ horas por noite
   ├─ Nutrition adequada
   └─ Stress levels baixos

4. Disponibilidade
   ├─ 4+ treinos/semana
   ├─ Intervalo mínimo entre treinos intensos
   └─ Consistência de 8+ semanas
```

### Score de Elegibilidade

```
Score < 40: Não elegível (focar em base)
Score 40-70: Condicionalmente elegível (começar conservador)
Score 70-90: Elegível (progressão normal)
Score > 90: Altamente elegível (pode acelerar progressão)
```

---

## 💡 SEÇÃO 3: Melhorias nos Treinos Intervalados

### Problemas Identificados

1. **Falta de Progressão Linear**
   - Todos começam com o mesmo volume
   - Não há ajuste baseado em performance
   - Fix: Implementar adaptação dinâmica

2. **Recuperação Inadequada**
   - Períodos de recuperação entre repetições muito curtos
   - Fix: Calcular recuperação baseada em FC recovery rate

3. **Falta de Variedade**
   - Sempre os mesmos intervalos
   - Fix: Variar duração (3-8 min) e intensidade

### Propostas de Melhoria

```
Antes:
├─ 4x5min Z4
├─ Recovery fixo: 2 minutos
└─ Sem feedback durante treino

Depois:
├─ Adaptativo com base em FC
├─ Recovery dinâmico: até FC < Z2
├─ Real-time feedback
└─ Ajustes automáticos
```

---

## ✅ Checklist de Implementação

- [ ] Calcular FC Max (Karvonen formula)
- [ ] Definir zonas por atleta
- [ ] Assessment test (tempo em 5K)
- [ ] Score de elegibilidade
- [ ] Algoritmo de progressão
- [ ] Real-time zone feedback
- [ ] Tests e validação

---

**Status:** ✅ ENTREGUE - Consolida TRAINING_ZONE_ASSESSMENT_PROTOCOLS + intervalado-elegibilidade + melhoria-treinos-intervalados
