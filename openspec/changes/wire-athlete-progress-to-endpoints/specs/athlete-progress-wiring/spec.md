# Spec: athlete-progress-wiring

**Mudança vs versão anterior:** a tela de Progresso do atleta (`AthleteProgressPage`) passa a consumir
dado real via 4 endpoints `/me/*` novos (que espelham, para o próprio atleta, o dado hoje exposto só
via `/{id}/*` para TECNICO/ADMIN) em vez de mocks locais.

## Requirement: Endpoints `/me/*` de progresso para o atleta autenticado

- **WHEN** um usuário com role `ATLETA` chama `GET /api/v1/atletas/me/metricas/historico`,
  `GET /api/v1/atletas/me/metricas/zonas`, `GET /api/v1/atletas/me/recordes` ou
  `GET /api/v1/atletas/me/aderencia?semanas=N`
- **THEN** o sistema resolve o atleta via `resolverAtletaIdAtual()` (JWT, tenant-scoped) e retorna o
  mesmo dado que o endpoint `/{id}/*` correspondente retornaria para aquele atleta, protegido por
  `@PreAuthorize("hasRole('ATLETA')")`.
- **AND** os endpoints `/{id}/*` existentes permanecem restritos a TECNICO/ADMIN, sem alteração de
  contrato.

#### Scenario: Aderência com parâmetro default

- **WHEN** `GET /api/v1/atletas/me/aderencia` é chamado sem o parâmetro `semanas`
- **THEN** o sistema usa `semanas=4` como default.

## Requirement: Progresso do atleta usa dado real

- **WHEN** um `ATLETA` abre `/athlete/progress`
- **THEN** a tela consome os 4 endpoints `/me/*` (PMC, zonas, recordes, aderência) + reusa
  `GET /api/v1/atletas/me/treinos?dias=28` (já existente) para derivar o KPI de volume total
  client-side, sem `MOCK_PMC`/`MOCK_ZONES`/`MOCK_KPI`/`MOCK_PRS`.

#### Scenario: Atleta sem recordes registrados

- **WHEN** `GET /api/v1/atletas/me/recordes` retorna lista vazia
- **THEN** a tab Provas exibe "ainda sem recordes", não um PR mock.

#### Scenario: Sem dado de zona

- **WHEN** `duracaoTotalSegundos` for zero (atleta sem treino com FC média)
- **THEN** a distribuição de zonas exibe estado vazio "sem dados de zona ainda", não um `NaN` ou
  gráfico fabricado.

#### Scenario: Insight de zonas sem fonte

- **WHEN** o mock exibia um insight textual de distribuição de zonas (sem correspondente no
  `ZonaDistribuicaoDto`)
- **THEN** o sistema remove o insight ou mostra placeholder "em breve", nunca fabrica a análise.

## Status: proposto — aguardando implementação (após `wire-athlete-shell-to-endpoints`)
