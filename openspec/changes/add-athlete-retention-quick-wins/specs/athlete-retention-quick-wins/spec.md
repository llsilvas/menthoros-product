## ADDED Requirements

### Requirement: Feedback pós-treino
O sistema SHALL exibir ao atleta um card de confirmação com resumo do treino e feedback
determinístico imediatamente após o registro de um treino manual, sem chamada a IA e sem
endpoint novo.

#### Scenario: Registro de treino bem-sucedido
- **WHEN** um `ATLETA` registra um treino manual via `POST /api/v1/atletas/me/treinos`
- **THEN** o sistema SHALL exibir um card com tipo, duração, distância e TSS do treino retornado
  no corpo do 201

#### Scenario: Treino com RPE alto (≥8)
- **WHEN** o treino registrado tem `percepcaoEsforco >= 8`
- **THEN** o feedback SHALL incluir "Grande esforço! Respeite a recuperação."

#### Scenario: Treino com RPE baixo (≤4)
- **WHEN** o treino registrado tem `percepcaoEsforco <= 4`
- **THEN** o feedback SHALL incluir "Bom treino leve! Ativação no ponto."

#### Scenario: Treino sem distância (ex.: musculação)
- **WHEN** o treino registrado tem `distanciaKm` nulo ou zero
- **THEN** o card SHALL omitir a linha de distância, nunca exibir "0 km"

### Requirement: Kudos do coach para o atleta
O sistema SHALL permitir que um `TECNICO` ou `ADMIN` registre um reconhecimento (kudo) para um
atleta do próprio tenant, e SHALL exibir ao atleta os kudos recebidos na Home.

#### Scenario: Coach registra um kudo
- **WHEN** um `TECNICO` ou `ADMIN` submete `POST /api/v1/coach/atletas/{atletaId}/kudos` com
  `{ motivo }` para um atleta do próprio tenant
- **THEN** o sistema SHALL criar o registro e retornar 201 com
  `{id, atletaId, coachId, motivo, createdAt}`

#### Scenario: Coach tenta dar kudos para atleta de outro tenant
- **WHEN** `POST /api/v1/coach/atletas/{atletaId}/kudos` referencia um atleta que não pertence
  ao tenant do coach autenticado
- **THEN** o sistema SHALL retornar 403 (via `@RequireTenant`/`AccessDeniedException`, o mesmo
  mecanismo de isolamento usado por `CoachAthleteProfileController`)

#### Scenario: Coach repete o mesmo motivo para o mesmo atleta no mesmo dia
- **WHEN** já existe um kudo do mesmo `motivo`, do mesmo coach, para o mesmo atleta, criado no
  dia corrente, e o coach submete o mesmo `POST` novamente (duplo-clique, retry de rede, ou
  duplo-submit)
- **THEN** o sistema SHALL retornar 409 Conflict e SHALL NOT criar um segundo registro
- **THEN** motivos diferentes no mesmo dia SHALL continuar permitidos (a regra bloqueia apenas
  a duplicata do mesmo motivo)

#### Scenario: Atleta consulta seus kudos recentes
- **WHEN** um `ATLETA` autenticado chama `GET /api/v1/atletas/me/kudos/recentes`
- **THEN** o sistema SHALL retornar até 10 kudos `[{id, motivo, createdAt}]`, ordenados por
  `createdAt` decrescente

#### Scenario: Home exibe os kudos mais recentes
- **WHEN** `GET /me/kudos/recentes` retorna ao menos 1 kudo
- **THEN** a Home do atleta SHALL exibir um card "Seu coach reconheceu sua {{motivo}}!" para até
  os 3 kudos mais recentes

#### Scenario: Sem kudos
- **WHEN** o atleta nunca recebeu kudos (`GET /me/kudos/recentes` retorna lista vazia)
- **THEN** o sistema SHALL NOT exibir nenhum card de kudos (estado vazio honesto, não um card
  vazio)

### Requirement: Resumo semanal na Home do atleta
O sistema SHALL exibir na Home do atleta um resumo agregado da semana corrente (treinos, volume,
streak, forma), derivado inteiramente de dados já buscados por hooks existentes, sem endpoint
novo.

#### Scenario: Semana com treinos registrados
- **WHEN** o atleta abre `/athlete/home` e tem ao menos 1 treino nos últimos 7 dias
- **THEN** o sistema SHALL exibir "Seu resumo da semana" com total de treinos, volume total (km),
  streak de semanas consistentes, forma atual e próximo treino agendado

#### Scenario: Semana sem treinos
- **WHEN** o atleta não registrou nenhum treino nos últimos 7 dias
- **THEN** o sistema SHALL exibir "Você ainda não registrou treinos esta semana — todo treino
  conta!" e SHALL NOT fabricar um resumo com valores zerados como se fosse um resultado válido

#### Scenario: Sinal de forma indisponível
- **WHEN** `useAthleteReadiness` não retorna dado de forma (readiness `null`)
- **THEN** o resumo SHALL exibir um placeholder honesto ("—") no lugar da forma, e SHALL NOT
  bloquear a exibição dos demais campos do resumo

## Status: proposto — aguardando implementação (Sprint 9.9, após 9.8)
