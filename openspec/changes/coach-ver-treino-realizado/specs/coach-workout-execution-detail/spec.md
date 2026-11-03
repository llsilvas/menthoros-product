## ADDED Requirements

### Requirement: Treinador abre o detalhe do treino realizado pelo card do plano

O card de um treino planejado que tem treino realizado vinculado SHALL oferecer a ação
"Ver realizado", que abre um painel com o detalhe do treino realizado.

#### Scenario: Treino com realizado vinculado
- **WHEN** o treino planejado tem `treinoRealizadoId`
- **THEN** o card mostra o botão "Ver realizado"

#### Scenario: Treino sem realizado vinculado
- **WHEN** o treino planejado não tem `treinoRealizadoId`
- **THEN** o card não mostra o botão

### Requirement: Painel com abas Estatísticas e Intervalos

O painel SHALL buscar o detalhe por `GET /api/v1/treinos/realizados/{id}` ao abrir, mostrar
carregando e erro explícitos, e apresentar as abas Estatísticas (padrão) e Intervalos.

#### Scenario: Métrica ausente
- **WHEN** um campo do detalhe está ausente
- **THEN** a métrica aparece como `--`

#### Scenario: Linha total dos intervalos
- **WHEN** a aba Intervalos lista as voltas
- **THEN** a linha Total usa os valores da sessão, não a soma das voltas

#### Scenario: Sem voltas
- **WHEN** o detalhe não tem `etapasRealizadas`
- **THEN** a aba Intervalos mostra o estado vazio

### Requirement: Melhor ritmo e temperatura mínima e máxima

O backend SHALL guardar e expor a velocidade máxima e as temperaturas mínima e máxima da sessão
quando o `.fit` as trouxer.

#### Scenario: `.fit` com os campos
- **WHEN** a Session do `.fit` traz `enhanced_max_speed`, `min_temperature` e `max_temperature`
- **THEN** o detalhe expõe `velocidadeMaxKmh`, `temperaturaMinC` e `temperaturaMaxC`

#### Scenario: `.fit` sem os campos
- **WHEN** a Session não traz esses campos
- **THEN** eles ficam nulos, ausentes do JSON, e a importação não falha
