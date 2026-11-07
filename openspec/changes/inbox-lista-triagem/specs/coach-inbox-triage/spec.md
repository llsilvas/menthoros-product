# coach-inbox-triage — delta (inbox-lista-triagem)

## ADDED Requirements

### Requirement: Linha de atleta densa e sem redundância

Cada atleta na coluna da lista SHALL ocupar uma linha de no máximo 52px com avatar, nome, uma
única linha de contexto e a aderência em número à direita. A linha SHALL NOT repetir a mesma
informação em mais de um elemento (chip e texto, número e barra). A linha de contexto SHALL seguir
a precedência: sinal da fila (motivo e recência), pausado, fase e último treino — usando só o
que o resumo do roster traz (`status`, `fase`, `lastActivity`).

#### Scenario: Atleta com sinal
- **WHEN** o atleta está na fila com `INATIVIDADE` e o último treino foi há 6 dias
- **THEN** a linha mostra "Inatividade · 6 dias sem treino" uma vez, sem chip de severidade, e a severidade aparece na moldura e na cor do texto

#### Scenario: Sinal sem dado de treino
- **WHEN** o atleta está na fila por `SOBRECARGA` com alerta gerado há 2 dias
- **THEN** a linha diz "Sobrecarga · sinal há 2 dias", nunca "dias sem treino"

#### Scenario: Atleta sem sinal
- **WHEN** o atleta não está na fila, está na fase "Base" e treinou há 2 dias
- **THEN** a linha de contexto é "Base · último treino há 2 dias"; sem aderência na janela, o número é "—"

#### Scenario: Seis linhas em notebook
- **WHEN** o viewport é 1366×625 e há 10 atletas no roster
- **THEN** pelo menos 6 linhas aparecem inteiras sem rolar

### Requirement: Filtro "Em atenção" e busca na coluna

O header da coluna da lista SHALL oferecer um filtro segmentado — Todos, Em atenção, Pausados —
e o campo de busca. "Em atenção" SHALL listar a fila de atenção completa, sem paginação, mesmo
quem não está na página corrente do roster. O controle de ordenação SHALL ser distinto do filtro
em forma e rótulo.

#### Scenario: Em atenção
- **WHEN** há 3 atletas na fila e 23 no roster, o treinador está na página 2 e escolhe "Em atenção"
- **THEN** a lista mostra exatamente os 3, a URL diz `status=attention`, o rodapé de paginação some e "Todos" devolve a página 2

#### Scenario: Busca junto da lista
- **WHEN** o inbox carrega
- **THEN** "Buscar atleta" está no header da coluna da lista, não na barra do topo

### Requirement: Contraste e idioma da coluna

Os textos legíveis da coluna SHALL usar cores com contraste mínimo de 4,5:1 sobre o fundo
(`surface-400` ou mais claro); `surface-500` SHALL ficar restrito a "—" e ícones desabilitados.
A paginação SHALL estar em PT-BR e SHALL aparecer só quando há mais de uma página.

#### Scenario: Paginação
- **WHEN** há 23 atletas
- **THEN** o rodapé diz "1–10 de 23"; com 10 atletas não há rodapé
