# coach-inbox-triage — delta (inbox-kpis-atleta-sem-dado)

## ADDED Requirements

### Requirement: KPIs do atleta em uma linha, com a ausência de dado dita uma vez

A faixa de KPIs do atleta selecionado SHALL mostrar rótulo e valor na mesma linha (≤ 40px), com a
linha de apoio de cada KPI acessível por `title` e por texto visualmente oculto, nunca visível.
Quando não há série de treinos na janela (`hasWindowData` falso) e o perfil do atleta carregou sem
erro, a tela SHALL dizer isso uma única vez, numa linha abaixo da faixa, citando só as células sem
dado, e SHALL NOT repetir a mesma ausência nas células (texto ou `title`) nem no Diagnóstico.

#### Scenario: Sem treino na janela e sem km
- **WHEN** o perfil do atleta selecionado carregou, não há série na janela e não há km nos últimos 7 dias
- **THEN** Carga, Forma e ACWR mostram "—" sem legenda nem `title`, há exatamente um aviso abaixo da faixa citando carga, forma e ACWR, e o Diagnóstico não mostra o banner "Sem treinos registrados na janela analisada"

#### Scenario: Sem série na janela, com km
- **WHEN** o perfil carregou, não há série na janela e há km nos últimos 7 dias
- **THEN** Carga mostra o km, Forma e ACWR mostram "—", e o aviso único cita só forma e ACWR

#### Scenario: Série presente com dado parcial
- **WHEN** há série na janela e o ACWR não pôde ser calculado
- **THEN** não há aviso abaixo da faixa; "Dado insuficiente" fica no `title` e no texto oculto da célula ACWR

#### Scenario: Perfil carregando ou com erro
- **WHEN** o perfil do atleta selecionado ainda não carregou, ou falhou
- **THEN** não há aviso abaixo da faixa

#### Scenario: Com dados
- **WHEN** carga, forma e ACWR têm dado
- **THEN** não há aviso abaixo da faixa e a grade de métricas do Diagnóstico aparece

#### Scenario: Legenda acessível
- **WHEN** a célula Aderência tem a linha de apoio "Últimas 4 semanas"
- **THEN** o texto não está visível, mas está no `title` da célula e num elemento lido pelo leitor de tela

#### Scenario: Selo de confiança
- **WHEN** o ACWR é de baixa confiança
- **THEN** o selo "Baixa confiança" continua visível ao lado do valor

### Requirement: Aderência na linha da lista com rótulo

Cada linha da lista do inbox SHALL mostrar a aderência com o rótulo "Ader." antes do valor.

#### Scenario: Com aderência
- **WHEN** a linha tem aderência disponível de 78%
- **THEN** a célula lê "Ader. 78%", com o número na cor da faixa

#### Scenario: Sem aderência
- **WHEN** a linha não tem aderência disponível
- **THEN** a célula lê "Ader. —"
