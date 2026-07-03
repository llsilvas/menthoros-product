# Spec: athlete-shell-wiring

**Mudança vs versão anterior:** o shell do atleta (`features/athlete`) passa a consumir dado
real de backend em vez de mocks locais, para as telas Home, Plano e Progresso; o chat coach↔atleta
passa a exibir um placeholder honesto em vez de mensagens simuladas. Adicionalmente, a Home ganha
um indicativo de streak de consistência e a tab Provas ganha um indicativo de próxima prova/meta
— ambos derivados de dado real já existente, como fatia athlete-facing de baixo custo do bloco de
retenção discutido em `prd/prd-retention-loop-90d.md`.

## Requirement: Home do atleta usa dado real

- **WHEN** um usuário com role `ATLETA` abre `/athlete/home`
- **THEN** o sistema exibe o treino de hoje e as métricas-chave vindos de
  `GET /api/v1/atletas/me/home` e `GET /api/v1/atletas/me/readiness`, sem nenhum valor de
  `MOCK_TODAY`.

#### Scenario: Atleta sem plano ativo

- **WHEN** o atleta não tem plano aprovado para a semana
- **THEN** a Home exibe estado vazio informativo, não um treino fabricado.

## Requirement: Plano semanal do atleta usa dado real

- **WHEN** um `ATLETA` abre `/athlete/plan`
- **THEN** o sistema busca `GET /api/v1/planos/{atletaId}` (que já filtra apenas planos
  `APROVADO` para role `ATLETA`) e exibe a semana real, sem `buildMockWeek`.

#### Scenario: Nenhum plano aprovado ainda

- **WHEN** o coach ainda não aprovou nenhum plano da semana
- **THEN** a tela exibe "seu coach ainda não aprovou o plano desta semana", não um plano fake.

## Requirement: Progresso do atleta usa dado real

- **WHEN** um `ATLETA` abre `/athlete/progress`
- **THEN** o sistema consome três endpoints novos com escopo `me`:
  `GET /api/v1/atletas/me/metricas/historico` (PMC),
  `GET /api/v1/atletas/me/metricas/zonas` (distribuição de zonas),
  `GET /api/v1/atletas/me/recordes` (PRs) — cada um protegido por
  `@PreAuthorize("hasRole('ATLETA')")` e resolvendo o atleta via `resolverAtletaIdAtual()`.
- **AND** nenhum destes dados é fabricado no frontend quando a lista/série vem vazia.

#### Scenario: Atleta sem recordes registrados

- **WHEN** `GET /api/v1/atletas/me/recordes` retorna lista vazia
- **THEN** a tab Provas exibe "ainda sem recordes", não um PR mock.

## Requirement: Chat coach-atleta não simula conversa

- **WHEN** um `ATLETA` abre `/athlete/coach` antes de `add-athlete-coach-messaging` existir
- **THEN** a tela exibe um placeholder claro ("mensagens chegam em breve"), sem `MOCK_MESSAGES`
  nem `mockCoach`.

## Requirement: Home exibe streak de consistência

- **WHEN** um `ATLETA` abre `/athlete/home` e tem ao menos uma semana consistente (≥1 treino
  registrado) terminando na semana atual ou anterior
- **THEN** o sistema exibe o número de semanas consecutivas consistentes, calculado
  client-side a partir de `GET /api/v1/atletas/me/treinos`.

#### Scenario: Streak zerado

- **WHEN** a semana atual e a anterior não têm nenhum treino registrado
- **THEN** o card de streak fica oculto, não exibe "0 semanas" (evita reforçar quebra de hábito).

## Requirement: Progresso exibe próxima prova/meta

- **WHEN** um `ATLETA` abre a tab Provas em `/athlete/progress`
- **THEN** o sistema consulta `GET /api/v1/atletas/me/provas` (endpoint novo, espelha
  `GET /atletas/{atletaId}/provas` restrito a `ATLETA` via `resolverAtletaIdAtual()`) e exibe a
  prova futura mais próxima (nome + dias restantes).

#### Scenario: Nenhuma prova cadastrada

- **WHEN** a lista de provas vem vazia ou sem nenhuma prova futura
- **THEN** o sistema exibe um CTA honesto pedindo ao coach que cadastre a próxima meta, sem
  fabricar uma prova ou contagem de dias.

## Status: proposto — aguardando implementação (Sprint 9.5)
