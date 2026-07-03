# Spec: athlete-shell-wiring (Home + Plano + Chat)

**Mudança vs versão anterior:** as telas Home e Plano do atleta (`features/athlete`) passam a
consumir dado real de backend (endpoints já existentes) em vez de mocks locais; o chat coach↔atleta
passa a exibir um placeholder honesto em vez de mensagens simuladas. A tela de Progresso foi movida
para a change `wire-athlete-progress-to-endpoints`.

## Requirement: Home do atleta usa dado real

- **WHEN** um usuário com role `ATLETA` abre `/athlete/home`
- **THEN** o sistema exibe o treino de hoje e as métricas-chave vindos de `GET /api/v1/atletas/me/home`
  e `GET /api/v1/atletas/me/readiness` (ambos já existentes), sem nenhum valor de `MOCK_TODAY`.

#### Scenario: Atleta sem próximo treino ou sem métricas

- **WHEN** `proximoTreino` ou `metricasChave` vierem nulos no `AtletaHomeDto`
- **THEN** a Home exibe estado vazio informativo, não um treino fabricado.

#### Scenario: Readiness sem sub-fatores granulares

- **WHEN** a Home renderiza a prontidão do atleta
- **THEN** exibe apenas o `score` agregado (0–100) + a `nota` do backend — os sub-fatores
  recovery/fatigue/sleep do mock, sem fonte real no `ReadinessDto`, são removidos, não estimados.

## Requirement: Plano semanal do atleta usa dado real

- **WHEN** um `ATLETA` abre `/athlete/plan`
- **THEN** o sistema busca `GET /api/v1/planos/{atletaId}` (que já filtra apenas planos `APROVADO`
  para role `ATLETA`) e exibe a semana real, sem `buildMockWeek`.
- **AND** o status de conclusão de cada dia vem de `statusTreino` (`TreinoExecucaoStatus`) do DTO, e o
  resumo de carga usa volume planejado/realizado (`volumePlanejadoKm`/`volumeRealizadoKm`), não um
  "TSS alvo" fabricado.

#### Scenario: Nenhum plano aprovado ainda

- **WHEN** o coach ainda não aprovou nenhum plano da semana
- **THEN** a tela exibe "seu coach ainda não aprovou o plano desta semana", não um plano fake.

## Requirement: Chat coach-atleta não simula conversa

- **WHEN** um `ATLETA` abre `/athlete/coach` antes de `add-athlete-coach-messaging` existir
- **THEN** a tela exibe um placeholder claro ("mensagens chegam em breve"), sem `MOCK_MESSAGES`
  nem `mockCoach`.

## Status: proposto — aguardando implementação (Sprint 9.5)
