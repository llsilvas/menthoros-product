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
- **AND** o gráfico "Forma (PMC)" estende o eixo até hoje e marca o trecho, mesmo quando a série do backend termina no último treino

#### Scenario: Lacuna independe do horário do acesso
- **WHEN** o coach abre o Diagnóstico às 00:05 e às 15:30 do mesmo dia
- **THEN** as lacunas e as semanas sem dados são as mesmas nos dois acessos (comparação por dia civil)

#### Scenario: Descanso curto não é lacuna
- **WHEN** o atleta fica 9 dias sem treinar
- **THEN** nenhuma lacuna é marcada

### Requirement: Adesão e carga no mesmo eixo semanal
O sistema SHALL exibir adesão ao plano (%) e carga (TSS) por semana, em ordem cronológica, com a data de início de cada semana, das últimas 8 semanas — a cobertura que o perfil do atleta já traz em `aderenciaSemanal`.

#### Scenario: Tooltip da semana
- **WHEN** o coach passa o mouse sobre uma semana
- **THEN** vê o início da semana, a adesão com "X de Y" e a carga em TSS com o número de dias com treino (a série PMC é diária; dois treinos no mesmo dia contam como um dia)

#### Scenario: Semana sem plano
- **WHEN** a semana não tem entrada em `aderenciaSemanal`
- **THEN** não há barra de adesão e o tooltip diz "Sem plano na semana"

#### Scenario: Consulta de aderência falhou
- **WHEN** o perfil chega com `aderenciaSemanal` vazio e `avisos` contém `"aderenciaSemanal"`
- **THEN** o gráfico e a célula mostram "Dado indisponível", nunca "Sem plano na semana" nem 0%

#### Scenario: Consulta de PMC falhou
- **WHEN** o perfil chega com `pmc` vazio e `avisos` contém `"pmc"`
- **THEN** a carga semanal e o gráfico "Forma (PMC)" mostram "Dado indisponível", sem barras zeradas e sem marcar lacuna

### Requirement: KPI de aderência coerente com o gráfico
A célula "Aderência · 4 sem" SHALL ser calculada a partir das mesmas entradas de `aderenciaSemanal` exibidas no gráfico (Σ realizado ÷ Σ planejado das últimas 4 semanas civis **completas** — a semana em curso fica de fora), com o mesmo tom de cor das barras.

#### Scenario: Perfil carregado
- **WHEN** as últimas 4 semanas completas somam 5 realizados de 16 planejados
- **THEN** a célula mostra "31%" e "5 de 16 treinos planejados"

#### Scenario: Plano futuro não entra na janela
- **WHEN** as últimas 4 semanas completas somam 16 de 16 e já existe plano gerado para a próxima semana (0 de 4)
- **THEN** a célula mostra "100%" e "16 de 16 treinos planejados"

#### Scenario: Semana em curso não entra no KPI
- **WHEN** é segunda-feira, as 4 semanas completas somam 16 de 16 e a semana atual tem 0 de 4 (treinos ainda por vir)
- **THEN** a célula mostra "100%" — o backend conta como planejados os treinos que ainda vão acontecer na semana, e incluí-los faria a aderência cair toda segunda e subir sozinha ao longo da semana

#### Scenario: Semana em curso no gráfico
- **WHEN** o coach vê a barra de adesão da semana atual
- **THEN** ela segue a mesma escala das demais (< 40% em vermelho) e o tooltip diz "semana em curso" — decisão do founder em 29/09; o KPI de 4 semanas continua sem a semana em curso

#### Scenario: Perfil não carregado
- **WHEN** o perfil ainda não tem `aderenciaSemanal`
- **THEN** a célula usa `roster.aderenciaPercentual` com "Últimas 4 semanas"

#### Scenario: Aderência independe do PMC
- **WHEN** o perfil tem `aderenciaSemanal` válida e a série PMC está vazia
- **THEN** a célula "Aderência" mostra o valor da janela; só as células derivadas do PMC (Carga, Forma, ACWR) mostram "Sem dado na janela"

### Requirement: Delta de carga mede carga
A célula "Carga · 7 dias" SHALL mostrar os km dos últimos 7 dias e compará-los com os km dos 7 dias anteriores, vindos de `distanceSummary` ("+35% vs. 7 dias anteriores (3,7 km)"). Sem `distanceSummary` (backend anterior ao campo ou consulta que falhou), SHALL comparar a soma de TSS das duas janelas ("TSS +36% vs. 7 dias anteriores").

#### Scenario: Km do backend
- **WHEN** o perfil traz `distanceSummary` com 5,0 km nos últimos 7 dias e 3,7 km nos 7 anteriores
- **THEN** a célula mostra "5,0 km" e "+35% vs. 7 dias anteriores (3,7 km)", mesmo com a série PMC vazia

#### Scenario: Sem base anterior
- **WHEN** os 7 dias anteriores somam 0 km (ou 0 TSS, sem `distanceSummary`)
- **THEN** a célula mostra "Sem carga nos 7 dias anteriores para comparar" em tom neutro

### Requirement: ACWR sinaliza base incompleta
A célula "ACWR" SHALL exibir o selo "Baixa confiança", o motivo na linha de apoio e tom neutro quando o histórico tem menos de 28 dias ou uma lacuna de registro toca os últimos 28 dias. O início do histórico é o primeiro dia com TSS > 0, não o primeiro ponto da série.

#### Scenario: Retorno após lacuna
- **WHEN** o atleta volta a treinar após 8 semanas sem registros e o ACWR calculado é 2.03
- **THEN** a célula mostra "2,03" em tom neutro, o selo "Baixa confiança" e o motivo ("Base crônica incompleta: …"), sem "Risco"

#### Scenario: Retorno com a pausa fora da janela consultada
- **WHEN** a série tem 87 dias com TSS = 0 seguidos de 3 dias com treino (o último treino anterior ficou fora do recorte)
- **THEN** a célula mostra o selo "Baixa confiança", sem "Risco"

### Requirement: Gráfico de Forma legível
O gráfico "Forma (PMC)" SHALL filtrar pelo período selecionado, rotular o eixo X por semana, exibir o valor atual de cada série no topo e desenhar em tracejado os trechos dentro de lacunas.

#### Scenario: Troca de período
- **WHEN** o coach seleciona "4s"
- **THEN** o gráfico mostra apenas os últimos 28 dias da série

#### Scenario: Períodos limitados aos dados buscados
- **WHEN** a tela recebe a série padrão do backend (90 dias)
- **THEN** o seletor oferece só "4s", "8s" e "12s"; "6m" e "1a" não aparecem

#### Scenario: Lacuna aberta sem valores do backend
- **WHEN** a série termina no último treino, há 12 dias
- **THEN** a área "Sem treinos registrados" vai até hoje, sem linha nesse trecho; o tracejado aparece só onde o backend enviou valores

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
