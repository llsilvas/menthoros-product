# Decision Memo — Promover Retention Loop 90d para OpenSpec change?

**Produto:** Menthoros
**Data:** 2026-07-02
**Decisor:** founder
**Preparado por:** CPO (agente)

## 1. Decisão necessária

Promover `add-athlete-retention-loop-90d` de candidato (discovery + PRD prontos) para
OpenSpec change formal — e, se sim, quando encaixar no `SPRINTS.md`?

## 2. Contexto mínimo

- Discovery (`prd/product-discovery-retencao-atletas-90d.md`) traz evidência acadêmica
  robusta: ~70% de churn em apps de saúde/fitness nos primeiros 100 dias (Kidman et al.,
  2024, n=525.824); 40–65% de desistência em 6 meses em clubes fitness (Gjestvang et al.,
  2023); onboarding estruturado com follow-ups em semanas retém mais que orientação única.
- PRD (`prd/prd-retention-loop-90d.md`) já está completo: 9 requisitos funcionais, 8
  histórias de usuário com critérios de aceite, NFRs (explicabilidade, LGPD, performance),
  MVP scope definido, plano de rollout em 4 fases (dogfood → beta → experimento → geral).
- Roadmap (`prd/roadmap-retencao-atletas-90d.md`) já propõe 7 sprints (26–32) como Bloco 3,
  logo após o Bloco 2 (Sprints 22–25).
- Dependências reais: `add-weekly-athlete-review`, `add-athlete-coach-messaging` (ambos
  Sprint 24–25, ainda não implementados), além de `attention-queue` e `athlete-profile`
  (**já entregues** — reduz custo de execução do Radar v1).

## 3. Recomendação

**Aprovar a promoção, mas não agora — encaixar como Bloco 3 (Sprints 26–32), gatilhada
pelo merge de `add-weekly-athlete-review` e `add-athlete-coach-messaging`.**

Justificativa pelo framework de priorização:

1. **North Star:** atende aos critérios 3 (mais atletas sem perder personalização) e 4
   (risco/progresso visível). Não atende ao critério 1 (tempo do coach) na v1 — o coach
   ganha trabalho novo (revisar cards, aprovar mensagens), não menos.
2. **Momento do produto:** o produto está pré-lançamento, sem base de atletas ativos por
   90+ dias ainda. Construir retenção antes de ter usuários para reter é otimizar uma
   métrica que ainda não existe. O momento certo é pós-Bloco 2, quando mensageria e
   weekly review (pré-requisitos reais de valor) já existirem.
3. **Custo/risco:** ~7 sprints (26–32), tamanho L. Risco baixo de retrabalho — reaproveita
   seams já entregues (attention queue, explainability, coach-in-the-loop). Risco principal
   é RF9 (instrumentação analítica) e o dashboard de ROI (História 8): exigem definir
   "atleta retido" antes de instrumentar (pergunta aberta #1 do PRD, não resolvida).
4. **Reversibilidade:** two-way door — nada aqui é irreversível. Pode entrar em fases
   (Radar v1 isolado do resto) sem comprometer arquitetura.

## 4. Trade-off principal

Adiar a promoção mantém o PRD "pronto na prateleira" por ~5 sprints (até o fim do Bloco 2)
sem gerar valor de retenção nesse intervalo — mas evita construir sobre mensageria/weekly
review inexistentes, o que geraria retrabalho maior do que a espera.

## 5. Alternativa relevante

**Antecipar só o Retention Radar v1** (regras de risco read-only, sem Next Best
Action/mensageria) para logo após o 9d, usando apenas dados existentes (fila de atenção +
log manual) — como o Radar já sinaliza para `add-post-workout-debrief`. Rejeitada por
agora: Radar sem ação recomendada nem mensageria vira "mais um alerta" sem fechar o loop de
valor, e fragmenta o card de risco em 2 entregas quando o PRD já modela como fluxo único.

## 6. Impacto se aprovado

- `SPRINTS.md`: criar Bloco 3 (Sprints 26–32), condicionado ao merge do Bloco 2.
- Criar `openspec/changes/add-athlete-retention-loop-90d/` com `proposal.md`, `design.md`,
  `tasks.md`, `specs/athlete-retention-loop/spec.md` (ver roadmap §6 para capabilities
  candidatas).
- Extrair para `knowledge/coaching/` ou `knowledge/product/`: o padrão de fases de retenção
  (Fundação/Hábito/Vínculo/Renovação/Maduro) e as fontes acadêmicas de churn — hoje só
  vivem no PRD, mas são conhecimento durável reutilizável em outras discussões de produto.
- Responder a pergunta aberta #1 do PRD (definição de "atleta retido") antes do `design.md`
  da change — bloqueia a instrumentação (RF9) e o dashboard (História 8).

---

**Decisão do founder:** pendente
