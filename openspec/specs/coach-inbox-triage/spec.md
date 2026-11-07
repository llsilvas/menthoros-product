# coach-inbox-triage Specification

## Purpose
TBD - created by archiving change inbox-barra-unica-sem-rodape. Update Purpose after archive.
## Requirements
### Requirement: Cabeçalho do inbox em uma barra

O cabeçalho da tela de triagem SHALL ser uma barra única com o título, um resumo em linha
(ativos de total, quantos em atenção, treinos planejados na semana, horário da última atualização)
e a busca por atleta. Em viewport de largura ≥ 900px a barra SHALL ter no máximo 56px de altura.
A contagem "em atenção" SHALL vir da fila de atenção completa do dashboard, não do resumo
agregado. O título SHALL ser menor que o nome do atleta selecionado.

#### Scenario: Resumo em linha com a fila como fonte
- **WHEN** o dashboard devolve `attentionQueue` com 3 itens e `resumo.emAtencao = 0`
- **THEN** a barra mostra "3 em atenção"

#### Scenario: Sem faixa de KPIs globais
- **WHEN** o inbox carrega em qualquer viewport
- **THEN** não há faixa de células de KPI acima da lista, nem eyebrow ou descrição de apresentação

#### Scenario: Largura estreita
- **WHEN** o viewport tem menos de 900px
- **THEN** a busca quebra para uma segunda linha e nada é cortado

### Requirement: Ações do atleta só no cabeçalho, nenhuma simulada

O detalhe do atleta SHALL oferecer suas ações no cabeçalho do atleta: a ação primária contextual,
"Rejeitar" quando houver plano aguardando revisão, e "Ajustar plano". A tela SHALL NOT exibir uma
barra de ações no rodapé nem ações que apenas mostrem confirmação sem efeito.

#### Scenario: Plano aguardando revisão
- **WHEN** o atleta selecionado tem plano aguardando revisão
- **THEN** o cabeçalho mostra, nesta ordem, "Aprovar plano" (primário), "Rejeitar" e "Ajustar plano", e não há rodapé de ações

#### Scenario: Ajustar plano abre a aba Plano
- **WHEN** o treinador aciona "Ajustar plano" no cabeçalho
- **THEN** a aba Plano fica ativa

#### Scenario: Notebook 1366×625
- **WHEN** o viewport é 1366×625 e há um atleta selecionado
- **THEN** a área rolável do detalhe ocupa pelo menos 45% da altura da janela

### Requirement: Linha de atleta densa e sem redundância

Cada atleta na coluna da lista SHALL ocupar uma linha de no máximo 52px com avatar, nome, uma
única linha de contexto e a aderência em número à direita. A linha SHALL NOT repetir a mesma
informação em mais de um elemento (chip e texto, número e barra). A linha de contexto SHALL seguir
a precedência: sinal da fila (motivo e recência), pausado, status do roster (`warning`/`danger`,
com o mesmo tom na moldura), fase e último treino — usando só o que o resumo do roster traz
(`status`, `fase`, `lastActivity`); `fase` ausente não é dita como "sem plano".

#### Scenario: Atleta com sinal
- **WHEN** o atleta está na fila com `INATIVIDADE` e o último treino foi há 6 dias
- **THEN** a linha mostra "Inatividade · 6 dias sem treino" uma vez, sem chip de severidade, e a severidade aparece na moldura e na cor do texto

#### Scenario: Sinal sem dado de treino
- **WHEN** o atleta está na fila por `SOBRECARGA` com alerta gerado há 2 dias
- **THEN** a linha diz "Sobrecarga · sinal há 2 dias", nunca "dias sem treino"

#### Scenario: Status do roster sem item na fila
- **WHEN** o atleta não está na fila mas o roster o traz com `status: 'danger'` e último treino há 9 dias
- **THEN** a linha diz "Alerta · último treino há 9 dias" e a moldura segue o tom de alerta

#### Scenario: Atleta sem sinal
- **WHEN** o atleta não está na fila, está na fase "Base" e treinou há 2 dias
- **THEN** a linha de contexto é "Base · último treino há 2 dias"; sem `fase`, só "último treino há 2 dias"; sem aderência na janela, o número é "—"

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

### Requirement: Fluxo de triagem pela fila de atenção

O detalhe de um atleta com sinal SHALL oferecer, ao fim do Diagnóstico, a passagem para o próximo
atleta com sinal entre as linhas visíveis da lista, na ordem da fila; no último, SHALL dizer que a
fila acabou, sem circular. A tecla `N` SHALL fazer o mesmo quando não há modificador, o foco não
está num campo de texto e nenhum dialog está aberto. As setas `↑`/`↓` com foco numa linha da lista
SHALL mover foco e seleção para a linha vizinha renderizada; nas bordas nada acontece.

#### Scenario: Próximo pelo link
- **WHEN** a fila tem A, B e C, A está selecionado e o treinador aciona "Próximo em atenção → B"
- **THEN** B fica selecionado e o Diagnóstico mostra o sinal de B

#### Scenario: Fim da fila
- **WHEN** C, o último da fila, está selecionado
- **THEN** o Diagnóstico diz que a fila acabou e não oferece link

#### Scenario: Linha escondida pela busca
- **WHEN** a busca esconde B e A está selecionado
- **THEN** o próximo oferecido é C

#### Scenario: Tecla N com dialog aberto
- **WHEN** o dialog de rejeição está aberto e o treinador pressiona `N`
- **THEN** a seleção não muda

#### Scenario: Tecla N num campo de texto
- **WHEN** o foco está no campo de busca e o treinador digita "n"
- **THEN** a letra entra no campo e a seleção não muda

#### Scenario: Setas na lista
- **WHEN** o foco está na segunda linha e o treinador pressiona `↓`
- **THEN** a terceira linha recebe o foco e fica selecionada

### Requirement: Prova no cabeçalho só quando existe

O cabeçalho do atleta SHALL mostrar o bloco de próxima prova apenas quando o perfil carregou com
sucesso e há prova; sem prova, carregando ou em erro, SHALL NOT mostrar nada no lugar.

#### Scenario: Sem prova
- **WHEN** o perfil do atleta selecionado carregou e não tem prova cadastrada
- **THEN** não há bloco de próxima prova nem texto no lugar dele

#### Scenario: Perfil carregando
- **WHEN** o perfil do atleta selecionado ainda está carregando
- **THEN** não há bloco de próxima prova

