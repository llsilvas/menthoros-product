# Roadmap atualizado — Retenção de atletas após 90 dias

**Produto:** Menthoros  
**Data:** 2026-07-01  
**Bloco novo:** Retention Loop 90d  
**Change ID sugerido:** `add-athlete-retention-loop-90d`

---

## 1. Decisão de roadmap

Adicionar um bloco **Retention Loop 90d** logo após o fechamento da jornada coach-atleta base, porque depende de:

- workout analysis;
- weekly athlete review;
- athlete-coach messaging;
- athlete profile;
- attention queue.

Na macro atual, isso significa posicionar o bloco **após Sprints 22–25** e **antes** de refinamentos post-MVP mais sofisticados como macrocycle/taper, personalização RAG avançada e analytics engine profundo.

---

## 2. Roadmap proposto

| Ordem | Sprint sugerido | Tema | Entrega | Resultado esperado |
|---:|---|---|---|---|
| 1 | Sprint 26 | Retention foundation | eventos canônicos, definição de D90/D120, fase do atleta | medir retenção corretamente |
| 2 | Sprint 27 | Retention Radar v1 | regras explicáveis + card na fila de atenção | coach sabe quem está em risco |
| 3 | Sprint 28 | Next Best Action | ações recomendadas + templates PT-BR editáveis | coach age com baixo esforço |
| 4 | Sprint 29 | Jornada 0-30-60-90 | lembretes D7/D14/D30/D60/D90 + supressão por interação recente | reduzir atletas invisíveis |
| 5 | Sprint 30 | Barreiras/readiness | micro-check-ins e respostas no perfil | descobrir causa real de queda |
| 6 | Sprint 31 | Marcos de progresso | consistência, ciclo fechado, retorno após pausa | aumentar percepção de progresso |
| 7 | Sprint 32 | Dashboard/experimento | coortes D90/D120, cards acionados, lacunas >14 dias | validar ROI |
| 8 | Later | Social/win-back | desafio/parceiro, razão de pausa/cancelamento, reentrada | expandir retenção com evidência |

---

## 3. Encaixe na macro existente

### Antes

- **Block 2 — Closing the coach journey**: Sprints 22–25.
- **Post-MVP:** analytics-engine refinement, readiness check-in, progression, macrocycle/taper, Strava deferred.

### Depois

- **Block 2 — Closing the coach journey**: Sprints 22–25.
- **Block 3 — Retention Loop 90d**: Sprints 26–32.
- **Post-MVP avançado:** analytics-engine refinement, progression, macrocycle/taper, RAG personalizations e Strava deferred.

---

## 4. Dependências por entrega

| Entrega | Depende de | Observação |
|---|---|---|
| Eventos D90/D120 | identidade, atleta, plano, treino, mensagens | pode começar simples com eventos existentes |
| Radar v1 | attention queue, profile, workout metrics | regra v1; sem ML |
| Next Best Action | messaging, templates, audit | coach aprova antes de enviar |
| Jornada 0-30-60-90 | lifecycle do atleta, reminders/cards | suprimir se houve interação recente |
| Barreiras/readiness | check-in, profile timeline | respostas podem ser sensíveis; LGPD |
| Marcos | weekly review, workout analyzer | priorizar consistência, não performance pura |
| Dashboard | eventos de retenção | necessário para ROI real |

---

## 5. ROI esperado por release

| Release | Hipótese de ROI | Como validar |
|---|---|---|
| Radar v1 | maior impacto com baixo esforço porque usa dados existentes | % atletas em risco identificados antes de lacuna 14d |
| Next Best Action | reduz esforço do coach e aumenta taxa de intervenção | % cards com ação em até 72h |
| Jornada | reduz invisibilidade nos primeiros 90 dias | % atletas com interação nos marcos D30/D60/D90 |
| Barreiras/readiness | melhora ajuste de plano e causa raiz | % respostas usadas para alteração de plano |
| Marcos | aumenta motivação por progresso percebido | resposta a mensagens de reconhecimento e D120 |
| Dashboard | permite cortar features sem ROI | comparação coorte tratada vs. controle |

---

## 6. OpenSpec sugerido

Criar change em `menthoros-product/openspec/changes/add-athlete-retention-loop-90d/` com:

```text
proposal.md
design.md
tasks.md
specs/athlete-retention-loop/spec.md
```

Capabilities candidatas:

- `athlete-retention-risk`
- `coach-retention-actions`
- `retention-journey-checkins`
- `retention-analytics`

---

## 7. Tradeoff recomendado

Não atrasar todo o MVP atual para implementar retenção antes de mensageria e weekly review, porque o bloco depende desses componentes para gerar valor. Porém, depois que `add-weekly-athlete-review` e `add-athlete-coach-messaging` existirem, retenção deve subir na prioridade antes de features mais sofisticadas de periodização.
