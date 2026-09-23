# Restrições estratégicas

> Resumo: Restrições duráveis que limitam o que o Menthoros pode fazer e quando —
> capacidade, legal/compliance e dependências de plataforma. Consultar antes de
> propor roadmap ou priorização.

## O que é

### 1. Capacidade: 1 founder/dev solo
- Sprints de 2 semanas; ~20 sprints até a fronteira do MVP (Sprint 25).
- Corolário: priorização é o recurso mais caro; changes zumbis e trabalho fora do
  marco atual são o principal risco de execução.

### 2. Strava: descontinuado como estratégia, mas ainda ATIVO em produção (achado 2026-09-23)
- A bússola estratégica (`../product/strategic-compass.md`) decidiu: Strava está fora do
  produto, intervals.icu é a fonte de dados principal. **Mas o código não reflete isso** —
  `StravaActivitySyncScheduler` continua rodando a cada 2h para atletas já conectados,
  sem flag de desligamento, e esse dado alimenta análise por IA e a fila de atenção do
  coach. Isso viola os termos da API do Strava (nov/2024), que proíbem mostrar dado do
  atleta ao coach e usá-lo em IA.
- Regra dura, agora mais urgente: **nunca alimentar nenhum modelo/preditor com dados da
  API do Strava** — e desligar/sinalizar o pipeline legado é uma decisão pendente do
  founder, não apenas uma restrição a observar.
- Restrição técnica herdada: um app Strava aceita apenas **um** Authorization Callback
  Domain — dev e produção exigem apps separados.

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

## Status: fato estabelecido a partir de leitura direta de código em 2026-09-23 (revisar
restrição #2 assim que o pipeline legado do Strava for desligado)
