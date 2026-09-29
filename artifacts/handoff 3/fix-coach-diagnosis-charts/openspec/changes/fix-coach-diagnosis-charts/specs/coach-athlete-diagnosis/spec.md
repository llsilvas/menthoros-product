# coach-athlete-diagnosis

## ADDED Requirements

### Requirement: Lacunas de registro são explícitas
O sistema SHALL identificar períodos de 10 ou mais dias corridos sem treino registrado (TSS > 0) e exibi-los como "Sem treinos registrados" nos gráficos da aba Diagnóstico.

#### Scenario: Lacuna entre dois treinos
- **WHEN** a série PMC tem treino em 15/07, nenhum TSS > 0 até 14/09 e treino em 14/09
- **THEN** o sistema marca a lacuna de 16/07 a 13/09 (60 dias)
- **AND** o gráfico semanal não desenha barra de carga nas semanas inteiramente dentro dela
- **AND** exibe o texto "Sem treinos registrados de 16/07 a 13/09 (60 dias)"

#### Scenario: Lacuna em aberto
- **WHEN** o último treino foi há 12 dias
- **THEN** o sistema exibe "Sem treinos registrados desde {dia seguinte} (12 dias)"

#### Scenario: Descanso curto não é lacuna
- **WHEN** o atleta fica 9 dias sem treinar
- **THEN** nenhuma lacuna é marcada

### Requirement: Adesão e carga no mesmo eixo semanal
O sistema SHALL exibir adesão ao plano (%) e carga (TSS) por semana, em ordem cronológica, com a data de início de cada semana, das últimas 12 semanas.

#### Scenario: Tooltip da semana
- **WHEN** o coach passa o mouse sobre uma semana
- **THEN** vê o início da semana, a adesão com "X de Y" e a carga em TSS com número de treinos

#### Scenario: Semana sem plano
- **WHEN** a semana não tem entrada em `aderenciaSemanal`
- **THEN** não há barra de adesão e o tooltip diz "Sem plano na semana"

### Requirement: Escala de adesão em 4 faixas
As barras de adesão e a célula de KPI SHALL usar a mesma escala: ≥ 90% adequado, 70–89% neutro, 40–69% atenção, < 40% crítico, com legenda no cabeçalho do card.

#### Scenario: Semana com 25%
- **WHEN** a semana tem 1 de 4 treinos feitos
- **THEN** a barra fica no tom crítico com o rótulo "25%"

### Requirement: Cards de gráfico com título e subtítulo
Os blocos "Adesão e carga por semana" e "Forma (PMC)" SHALL exibir título, subtítulo que descreve a medida e a ação (legenda ou controles) na mesma linha do título.

#### Scenario: Troca de modo do PMC
- **WHEN** o coach alterna para "Simples"
- **THEN** o subtítulo passa a "Forma diária (TSB), colorida pela faixa" e a legenda das faixas aparece acima do gráfico

### Requirement: KPI de aderência coerente com o gráfico
A célula "Aderência · 4 sem" SHALL ser calculado a partir das mesmas entradas de `aderenciaSemanal` exibidas no gráfico (Σ realizado ÷ Σ planejado das últimas 4 semanas civis), com o mesmo tom de cor das barras.

#### Scenario: Perfil carregado
- **WHEN** as últimas 4 semanas somam 5 realizados de 16 planejados
- **THEN** a célula mostra "31%" e "5 de 16 treinos planejados"

#### Scenario: Perfil não carregado
- **WHEN** o perfil ainda não tem `aderenciaSemanal`
- **THEN** a célula usa `roster.aderenciaPercentual` com "Últimas 4 semanas"

### Requirement: Delta de carga mede carga
A linha de apoio da célula "Carga · 7 dias" SHALL comparar a soma de TSS dos últimos 7 dias com a dos 7 dias anteriores ("TSS +36% vs. 7 dias anteriores").

#### Scenario: Sem base anterior
- **WHEN** os 7 dias anteriores somam 0 TSS
- **THEN** a célula mostra "Sem carga nos 7 dias anteriores para comparar" em tom neutro

### Requirement: ACWR sinaliza base incompleta
A célula "ACWR" SHALL exibir o selo "Baixa confiança", o motivo na linha de apoio e tom neutro quando o histórico tem menos de 28 dias ou uma lacuna de registro toca os últimos 28 dias.

#### Scenario: Retorno após lacuna
- **WHEN** o atleta volta a treinar após 8 semanas sem registros e o ACWR calculado é 2.03
- **THEN** a célula mostra "2,03" em tom neutro, o selo "Baixa confiança" e "Base crônica incompleta: 60 dias sem treinos registrados", sem "Risco"

### Requirement: Gráfico de Forma legível
O gráfico "Forma (PMC)" SHALL filtrar pelo período selecionado, rotular o eixo X por semana, exibir o valor atual de cada série no topo e desenhar em tracejado os trechos dentro de lacunas.

#### Scenario: Troca de período
- **WHEN** o coach seleciona "4s"
- **THEN** o gráfico mostra apenas os últimos 28 dias da série

#### Scenario: Modo Simples
- **WHEN** o coach seleciona "Simples" no Diagnóstico
- **THEN** o gráfico mostra a Forma (TSB) diária com cada barra colorida pela faixa `statusForma` do backend

## MODIFIED Requirements

### Requirement: Cabeçalho do atleta sem números duplicados
O cabeçalho do atleta selecionado SHALL NOT repetir aderência e carga já exibidas na faixa de KPIs, e SHALL exibir a próxima prova ao lado da ação primária.

#### Scenario: Atleta selecionado
- **WHEN** o coach abre um atleta no Inbox
- **THEN** "Aderência geral" e "Carga semanal" não aparecem no cabeçalho
- **AND** o cabeçalho mostra "Prova alvo" ou "Próxima prova" com nome e "dd mmm · em N dias"
- **AND** a faixa abaixo tem 4 células: Aderência · 4 sem, Carga · 7 dias, Forma · TSB e ACWR

#### Scenario: Linha de apoio longa
- **WHEN** a linha de apoio passa de uma linha
- **THEN** quebra em até 2 linhas, sem reticências no meio da primeira

#### Scenario: Números em pt-BR
- **WHEN** a célula exibe TSB ou ACWR
- **THEN** usa vírgula decimal ("TSB -8,6", "1,97")
