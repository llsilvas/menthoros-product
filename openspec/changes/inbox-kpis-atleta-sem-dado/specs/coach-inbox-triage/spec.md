# coach-inbox-triage — delta (inbox-kpis-atleta-sem-dado)

## ADDED Requirements

### Requirement: KPIs do atleta em uma linha, com a ausência de dado dita uma vez

A faixa de KPIs do atleta selecionado SHALL mostrar rótulo e valor na mesma linha (≤ 40px), com a
linha de apoio de cada KPI acessível por `title` e por texto visualmente oculto, nunca visível.
Quando carga, forma ou ACWR não têm dado na janela, a tela SHALL dizer isso uma única vez, numa
linha abaixo da faixa, e SHALL NOT repetir a mesma ausência nas células nem no Diagnóstico.

#### Scenario: Sem treino na janela
- **WHEN** o atleta selecionado não tem treino na janela (carga, forma e ACWR sem dado)
- **THEN** as três células mostram "—" sem legenda, há exatamente um aviso abaixo da faixa, e o Diagnóstico não mostra o banner "Sem treinos registrados na janela analisada"

#### Scenario: Com dados
- **WHEN** carga, forma e ACWR têm dado
- **THEN** não há aviso abaixo da faixa e a grade de métricas do Diagnóstico aparece

#### Scenario: Legenda acessível
- **WHEN** a célula Aderência tem a linha de apoio "Últimas 4 semanas"
- **THEN** o texto não está visível, mas está no `title` da célula e num elemento lido pelo leitor de tela

#### Scenario: Selo de confiança
- **WHEN** o ACWR é de baixa confiança
- **THEN** o selo "Baixa confiança" continua visível ao lado do valor
