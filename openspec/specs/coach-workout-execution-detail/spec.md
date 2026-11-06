# coach-workout-execution-detail Specification

## Purpose
TBD - created by archiving change coach-ver-treino-realizado. Update Purpose after archive.
## Requirements
### Requirement: Treinador abre a execução do treino realizado pelo card do plano

O card de um treino planejado que tem treino realizado vinculado SHALL oferecer a ação
"Ver realizado", na tela Planos e no shell do coach, que abre o dialog de execução.

#### Scenario: Treino com realizado vinculado
- **WHEN** o treino planejado tem `treinoRealizadoId`
- **THEN** o card mostra o botão "Ver realizado"

#### Scenario: Resumo do perfil expõe o vínculo
- **WHEN** o perfil do atleta para o treinador lista os treinos da semana
- **THEN** cada treino planejado com realizado vinculado traz `treinoRealizadoId`

#### Scenario: Treino sem realizado vinculado
- **WHEN** o treino planejado não tem `treinoRealizadoId`
- **THEN** o card não mostra o botão

### Requirement: Dialog começa pela comparação planejado × realizado

O dialog SHALL buscar o detalhe por `GET /api/v1/treinos/realizados/{id}` ao abrir, mostrar
carregando e erro explícitos, e apresentar nesta ordem: análise da IA (quando houver), tabela
planejado × realizado × diferença, distribuição de zonas, etapas e o acordeão com os demais dados
do relógio.

#### Scenario: Métrica ausente
- **WHEN** um campo do planejado ou do realizado está ausente
- **THEN** ele aparece como `--` e a diferença da linha fica neutra

#### Scenario: Erro na busca do detalhe
- **WHEN** a busca do detalhe falha
- **THEN** o dialog mostra erro com "Tentar de novo"

### Requirement: Banner da análise da IA

O dialog SHALL mostrar a análise da IA do treino quando ela estiver concluída, identificada como
conteúdo de IA, sem bloquear o restante da tela enquanto é buscada.

#### Scenario: Análise concluída
- **WHEN** a análise está `COMPLETED`
- **THEN** o banner mostra causa principal, nota de execução, resumo e recomendação

#### Scenario: Análise ainda não disponível com RPE
- **WHEN** a análise responde 204 e o treino tem RPE
- **THEN** aparece a faixa neutra "Análise da IA indisponível para este treino no momento"

#### Scenario: Análise já buscada pelo card
- **WHEN** o card já buscou a análise do treino
- **THEN** o dialog usa esse resultado e não chama o endpoint de análise de novo

#### Scenario: Análise ainda não disponível sem RPE
- **WHEN** a análise responde 204 e o treino não tem RPE
- **THEN** aparece a nota "A análise da IA depende do RPE do atleta"

#### Scenario: Análise falhou
- **WHEN** a análise está `FAILED` ou a busca falha
- **THEN** nenhum banner aparece e o restante do dialog funciona

### Requirement: Tempo em zonas de FC

O backend SHALL calcular e guardar, no import de um `.fit` com amostras de FC, o tempo do treino
em cada zona de FC do atleta vigente no import, junto dos limites usados, e expô-lo no detalhe.

#### Scenario: `.fit` com amostras e atleta com zonas confiáveis
- **WHEN** o `.fit` tem amostras de FC e o atleta tem zonas de FC manuais ou FC de limiar informada
- **THEN** o detalhe expõe `tempoEmZonas` com as cinco zonas, limites de bpm e segundos

#### Scenario: Atleta só com zonas estimadas
- **WHEN** as zonas de FC do atleta vêm só de FC máxima estimada (idade ou valor padrão)
- **THEN** `tempoEmZonas` fica ausente

#### Scenario: Pausa e amostras inválidas
- **WHEN** há intervalo maior que o teto entre amostras, timestamp repetido ou amostra sem FC
- **THEN** o intervalo conta no máximo o teto (5 s, ou o dobro do intervalo típico de gravação
  quando maior), e amostras com timestamp repetido ou sem FC não somam tempo

#### Scenario: Gravação inteligente
- **WHEN** o relógio grava uma amostra a cada vários segundos (gravação inteligente)
- **THEN** cada amostra vale o intervalo até a seguinte, e o tempo em zonas não fica subcontado

#### Scenario: Borda entre zonas
- **WHEN** um bpm é o limite superior de uma zona e o inferior da seguinte
- **THEN** ele conta na zona de baixo

#### Scenario: Zonas mudam depois do import
- **WHEN** as zonas do atleta mudam depois que o treino foi importado
- **THEN** o `tempoEmZonas` do treino não muda

#### Scenario: Sem amostras, outra fonte ou atleta sem zonas
- **WHEN** não há como calcular
- **THEN** `tempoEmZonas` fica ausente, a importação não falha e o dialog mostra "Tempo em zonas
  indisponível para este treino"

#### Scenario: Zona alvo destacada
- **WHEN** o detalhe tem `tempoEmZonas` e o planejado tem zona alvo
- **THEN** a faixa destaca a zona alvo e mostra o percentual do tempo nela

#### Scenario: Zona alvo em faixa
- **WHEN** a zona alvo é uma faixa como `z2-z3`
- **THEN** a faixa destaca todas as zonas do intervalo e soma o percentual

#### Scenario: Zona alvo não reconhecida
- **WHEN** a zona alvo está ausente ou fora de Z1–Z5
- **THEN** nenhuma zona é destacada e a linha Zona do comparativo fica neutra

### Requirement: Tabela de etapas

O dialog SHALL listar as voltas em largura total, com cabeçalho fixo ao rolar e linha Total com os
valores da sessão.

#### Scenario: Linha total
- **WHEN** a tabela lista as voltas
- **THEN** a linha Total usa os valores da sessão, não a soma das voltas

#### Scenario: Sem voltas
- **WHEN** o detalhe não tem `etapasRealizadas`
- **THEN** a tabela mostra o estado vazio

### Requirement: Melhor ritmo e temperatura mínima e máxima

O backend SHALL guardar e expor a velocidade máxima e as temperaturas mínima e máxima da sessão
quando o `.fit` as trouxer.

#### Scenario: `.fit` com os campos
- **WHEN** a Session do `.fit` traz `enhanced_max_speed`, `min_temperature` e `max_temperature`
- **THEN** o detalhe expõe `velocidadeMaxKmh`, `temperaturaMinC` e `temperaturaMaxC`

#### Scenario: `.fit` sem os campos
- **WHEN** a Session não traz esses campos
- **THEN** eles ficam nulos, ausentes do JSON, e a importação não falha

