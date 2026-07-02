# Restrições estratégicas

> Resumo: Restrições duráveis que limitam o que o Menthoros pode fazer e quando —
> capacidade, legal/compliance e dependências de plataforma. Consultar antes de
> propor roadmap ou priorização.

## O que é

### 1. Capacidade: 1 founder/dev solo
- Sprints de 2 semanas; ~20 sprints até a fronteira do MVP (Sprint 25).
- Corolário: priorização é o recurso mais caro; changes zumbis e trabalho fora do
  marco atual são o principal risco de execução.

### 2. Família `strava-*` deferida por clareza legal
- Toda a família de changes Strava (`strava-oauth`, `strava-activity-sync`,
  `strava-async-import`, `strava-webhooks`, `strava-conditional-insights`,
  `strava-risk-semaphore`) está **deferida até clareza legal** sobre termos da API.
- Regra dura: **nunca alimentar o preditor de aceitação de ML com dados da API do
  Strava**.
- Restrição técnica adicional: um app Strava aceita apenas **um** Authorization
  Callback Domain — dev e produção exigem apps separados.

### 3. LGPD / privacidade
- Produto opera dados sensíveis de saúde/treino de atletas no Brasil → LGPD.
- Política de privacidade em `/privacidade` já em produção; e-mail de contato real
  ainda pendente (blocker do go-live 4/4).

### 4. Segurança antes de usuários reais
- O Security Block (`complete-authorization-controllers`,
  `keycloak-user-onboarding-auth`, `add-external-call-resilience`) deve ser
  concluído **antes de expor o produto a usuários reais** (pré-beta).

## Por que importa para o Menthoros

- São condições de contorno de qualquer proposta de roadmap: o framework de
  priorização (ver `../product/cpo-operating-model.md`) as trata como filtros
  não-negociáveis, não como trade-offs.

## Fontes

- `PROJECT.md` §§2, 5 (raiz do workspace).
- `openspec/SPRINTS.md`.

## Status: fato estabelecido (restrições vigentes; revisar se o contexto legal do Strava mudar)
