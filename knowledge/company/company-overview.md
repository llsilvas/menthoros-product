# Visão da empresa — Missão, estágio e modelo

> Resumo: Contexto de negócio do Menthoros — missão, mercado-alvo, estágio atual e
> modelo de operação. Fundamenta decisões de priorização e escopo (o que cabe numa
> empresa deste estágio).

## Missão

Ajudar coaches de corrida/endurance a atender mais atletas com mais qualidade,
transformando dados reais de treino em decisões melhores — com o coach sempre no
controle (ver `../product/coach-in-the-loop-principle.md`).

## Mercado-alvo

- **Coaches e assessorias de corrida/endurance** (mercado primário: Brasil, PT-BR —
  copy do produto é hardcoded em PT-BR).
- B2B coach-facing; o atleta é usuário mediado, não o comprador.

## Estágio (2026-07)

- **Pré-lançamento**: fase de captura de waitlist (go-live 3/4 concluído);
  landing premium em produção em `menthoros.com`.
- **1 founder/dev solo**, sprints de 2 semanas, ~20 sprints até a fronteira do MVP
  (fim do Sprint 25).
- Jornada coach-in-the-loop v1 já funcional (identidade → home do coach → dados
  reais → fila de atenção → sugestão explicável → aprovação de plano → drilldown).
- Infra em Railway; identidade via Keycloak; IA via OpenAI + Anthropic.

## Modelo de negócio

- Hipótese: SaaS por assinatura para coaches/assessorias. **Pricing, tiers e
  empacotamento ainda não definidos** — gap conhecido, sem documento de referência.

## Por que importa para o Menthoros

- Estágio e capacidade (1 dev solo) são a restrição dominante de priorização — ver
  `../product/cpo-operating-model.md`.
- Toda proposta de feature deve caber no runway de execução até o MVP; trabalho
  fora do marco atual precisa de justificativa explícita.

## Fontes

- `PROJECT.md` §§1–2 (raiz do workspace).
- `openspec/SPRINTS.md` — roadmap comprometido.

## Status: missão e estágio = fato estabelecido; modelo de negócio/pricing = hipótese da equipe (não validada)
