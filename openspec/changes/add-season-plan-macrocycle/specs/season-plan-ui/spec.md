## ADDED Requirements

### Requirement: Temporada no perfil do atleta (coach)

O sistema SHALL exibir uma seção `Temporada` no perfil do atleta do coach (`CoachAthleteProfilePage`), encaixada no layout vigente em `develop` quando a fatia 2 começar. Hoje a página é composta por `SectionCard`s, sem abas; `redesign-coach-athlete-profile` propõe abas (Visão geral · Financeiro · Histórico) — se ela tiver entrado, Temporada vira uma aba desse conjunto.

As ações de gerar, revisar e aprovar SHALL aparecer somente para os papéis `TECNICO` e `ADMIN`.

A aba SHALL conter, de cima para baixo: cabeçalho com prova-alvo, distância, data, meta e chip de status com a versão; faixa de KPIs com semana atual de N, dias até a prova, volume de pico, longão máximo e aderência acumulada; mapa da temporada; tabela das próximas semanas; coluna lateral com proposta de ajuste da IA, marcos e validações.

O mapa da temporada SHALL exibir a faixa de fases sobre uma coluna de volume por semana, distinguindo visualmente realizado, planejado e previsto, e SHALL marcar a semana atual, as semanas de descarga e os marcos.

Números SHALL ser renderizados em fonte monoespaçada. A cor da fase SHALL vir da paleta categórica; o lime de marca SHALL ser reservado a prova, semana atual e bloco de conteúdo de IA.

Mockups de referência: canvas `Menthoros — Plano de temporada (maratona)`.

#### Scenario: Macro ativo
- **WHEN** o coach abre a Temporada de um atleta com macro `ATIVO` na semana 7 de 18
- **THEN** o mapa mostra as 18 semanas com as 6 primeiras como realizado, a semana 7 destacada e as demais como previsto
- **THEN** a tabela lista as próximas semanas com volume alvo, longão, sessões-chave e nível de detalhe

#### Scenario: Sem prova-alvo
- **WHEN** o atleta não tem prova-alvo cadastrada
- **THEN** a seção mostra estado vazio com a ação de cadastrar prova-alvo, sem exibir o mapa

#### Scenario: Prova-alvo sem macro
- **WHEN** o atleta tem prova-alvo e nenhum macro
- **THEN** a seção mostra estado vazio com a ação de gerar plano de temporada (a geração é sempre manual)
- **THEN** se a janela de preparação é menor que o mínimo da distância, o alerta de preparação curta é exibido

#### Scenario: Macro em proposta
- **WHEN** existe macro em `PROPOSTA` e nenhum `ATIVO`
- **THEN** o mapa é exibido com faixa de aviso indicando que é rascunho não visível ao atleta
- **THEN** as ações de revisar e aprovar estão disponíveis

#### Scenario: Proposta de replanejamento pendente
- **WHEN** existe proposta de replanejamento pendente para o atleta
- **THEN** o card de proposta aparece no topo da coluna lateral, com a evidência e as ações aceitar, editar e rejeitar
- **THEN** o card só existe com `macrociclo.replanejamento.enabled = true`

#### Scenario: Atleta em calibração
- **WHEN** o atleta está em calibração
- **THEN** o volume das semanas futuras é exibido como faixa, com nota de volume em calibração

#### Scenario: Falha ao carregar o mapa
- **WHEN** a chamada do mapa falha
- **THEN** o card do mapa exibe o erro e a ação de tentar de novo, e os KPIs já carregados permanecem visíveis

---

### Requirement: Tela de ajuste do plano de temporada (coach)

O sistema SHALL oferecer uma tela de ajuste que edita um rascunho do macro, mantendo a versão ativa em vigor até a aprovação.

A tela SHALL conter: cabeçalho com chip de rascunho e versão, contagem de alterações e as ações descartar, salvar rascunho e aprovar; bloco de parâmetros (metodologia, data da prova, meta, volume de pico, longão máximo, treinos por semana, frequência de descarga, recalcular); bloco de fases com stepper de semanas por fase e prévia da curva de volume; tabela de semanas editável; bloco de alterações com o diff da versão anterior; bloco de validações; campo de motivo da alteração.

Um campo alterado SHALL ser marcado visualmente e SHALL exibir o valor anterior. O bloco de alterações SHALL indicar a origem de cada mudança.

As validações SHALL ser recalculadas a cada edição.

Semanas concluídas, a semana em andamento e a semana da prova SHALL ser exibidas como somente leitura, com o motivo.

#### Scenario: Edição de volume
- **WHEN** o coach altera o volume de uma semana futura
- **THEN** o campo é marcado como alterado, exibe o valor anterior e o bloco de alterações ganha a linha correspondente

#### Scenario: Recálculo
- **WHEN** o coach altera o volume de pico e aciona recalcular
- **THEN** a tela informa quais semanas serão regeneradas antes de confirmar
- **THEN** semanas passadas e valores editados à mão são preservados

#### Scenario: Alerta de validação após edição
- **WHEN** uma edição faz o longão passar da fração máxima do volume
- **THEN** a linha recebe marcador de atenção, o bloco de validações é atualizado e a aprovação continua permitida

#### Scenario: Soma de fases divergente
- **WHEN** a soma das semanas por fase difere do total do ciclo
- **THEN** o cabeçalho do bloco de fases mostra a diferença e a ação de aprovar fica desabilitada

#### Scenario: Aprovação
- **WHEN** o coach aciona aprovar com semanas já detalhadas à frente
- **THEN** uma confirmação informa quantas semanas serão regeradas a partir dos novos alvos

#### Scenario: Conflito de versão
- **WHEN** outra sessão aprovou uma versão enquanto o rascunho estava aberto
- **THEN** a tela oferece recarregar e reaplicar as alterações, sem descartar silenciosamente a edição

---

### Requirement: Minha temporada no app do atleta

O sistema SHALL exibir ao atleta, quando houver macro `ATIVO`, um bloco `Minha temporada` em modo leitura contendo: prova-alvo com contagem de dias, fase atual com barra segmentada e a posição "semana N de M", volume por semana, resumo da semana atual com alvo, realizado e longão, e os próximos marcos.

O bloco SHALL exibir nota permanente de que as semanas futuras são previsão e que o treinador ajusta o plano conforme a evolução.

O bloco SHALL NOT exibir as sessões das semanas futuras.

Sem macro `ATIVO`, o bloco SHALL NOT ser exibido, sem placeholder.

#### Scenario: Atleta com macro ativo
- **WHEN** o atleta abre a própria temporada na semana 7 de 18
- **THEN** vê a prova-alvo, os dias restantes, a fase atual, o volume por semana com a semana atual destacada e os próximos marcos

#### Scenario: Atleta sem macro aprovado
- **WHEN** não existe macro `ATIVO` para o atleta
- **THEN** o bloco Minha temporada não é renderizado

#### Scenario: Marco explicado
- **WHEN** o próximo marco é uma prova-teste que recalcula zonas
- **THEN** o marco é exibido com a explicação do efeito

#### Scenario: Atleta em calibração
- **WHEN** o atleta está em calibração
- **THEN** o volume das semanas futuras é exibido como faixa

---

### Requirement: Acessibilidade e responsividade das telas de temporada

As três telas SHALL atender: contraste de texto de 4.5:1 contra a superfície em que o texto se apoia, inclusive em rótulos pequenos; alvos de toque de no mínimo 44 px; elementos interativos como `button`, `a` ou `input` com `label`, nunca `div` com handler.

Gráficos e mapas SHALL ter alternativa textual descrevendo a tendência.

Pares de cor que precisam ser distinguidos SHALL diferir também em luminosidade, não apenas em matiz.

As tabelas largas SHALL rolar horizontalmente dentro de um contêiner, sem quebrar o layout da página.

#### Scenario: Mapa com leitor de tela
- **WHEN** um leitor de tela encontra o mapa da temporada
- **THEN** recebe a descrição da tendência de volume ao longo das semanas

#### Scenario: Tela estreita
- **WHEN** a tela de ajuste é aberta em largura de telefone
- **THEN** os blocos empilham e a tabela de semanas rola horizontalmente no próprio contêiner
