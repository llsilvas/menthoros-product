## ADDED Requirements

### Requirement: Geração determinística da proposta de macrociclo

Quando o coach aciona a geração para uma prova-alvo do atleta, o sistema SHALL gerar um `PlanoTreino` em status `PROPOSTA` com uma `SemanaPlanejada` por semana entre o início da preparação e a data da prova.

O cadastro de prova, pelo coach ou pelo atleta, SHALL NOT gerar macro automaticamente (proposal D3).

O `PlanoTreino` gerado SHALL ter `tenant_id`, `nome`, `descricao` e `objetivo` preenchidos a partir da prova, e cada `SemanaPlanejada` SHALL ter `fase` entre os valores BASE, BUILD, PEAK, TAPER e RACE_WEEK de `TrainingPhase`. O `tssAlvo` de cada semana SHALL ser o alvo final, com descarga e taper embutidos.

A geração SHALL ser determinística e reprodutível: a mesma prova, o mesmo template e o mesmo baseline do atleta produzem o mesmo conjunto de semanas. A geração SHALL NOT chamar LLM.

As entradas SHALL ser: a prova (data, distância, meta), o `TemplateMetodologia` da assessoria (ou o default global), o baseline do atleta (`AthleteBaselineState` ou PMC) e os dias disponíveis do atleta.

O número de semanas SHALL ser derivado da data da prova; quando a janela disponível é menor que o mínimo de `RacePreparationRule`, o macro SHALL ser gerado com `preparacaoCurta = true` e com as fases comprimidas proporcionalmente.

#### Scenario: Prova-alvo com janela suficiente
- **WHEN** o coach gera a proposta para uma maratona a 20 semanas de distância, para um atleta com PMC confiável
- **THEN** o sistema cria um `PlanoTreino` em `PROPOSTA` com 20 `SemanaPlanejada`, cada uma com fase, `volumeAlvoKm`, `tssAlvo`, `longaoKm` e `descarga` definidos
- **THEN** `origemValor` de cada semana é `MOTOR`

#### Scenario: Preparação curta
- **WHEN** o coach gera a proposta para uma maratona a 9 semanas de distância
- **THEN** o macro é gerado com `preparacaoCurta = true` e as fases comprimidas
- **THEN** o alerta de preparação insuficiente é retornado junto da proposta

#### Scenario: Prova cadastrada pelo atleta
- **WHEN** o atleta cadastra uma prova
- **THEN** nenhum `PlanoTreino` é criado

#### Scenario: Geração reprodutível
- **WHEN** a geração roda duas vezes para a mesma prova, template e baseline
- **THEN** as duas execuções produzem os mesmos valores em todas as semanas

#### Scenario: Atleta sem baseline confiável
- **WHEN** o atleta está em `CALIBRATION` sem PMC confiável
- **THEN** o macro é gerado com fases, longões e sessões-chave, e o volume de cada semana é marcado como estimado
- **THEN** a proposta registra que o volume será revisto ao fim da calibração

---

### Requirement: Um macrociclo ativo por atleta

O sistema SHALL permitir no máximo um `PlanoTreino` com `macrocicloStatus = ATIVO` por atleta, garantido também por índice único parcial no banco.

Ao aprovar um macro novo, o sistema SHALL arquivar o anterior com status `ARQUIVADO`, preservando suas semanas.

#### Scenario: Aprovação com macro ativo existente
- **WHEN** o coach aprova um macro para um atleta que já tem um macro `ATIVO`
- **THEN** o macro anterior passa a `ARQUIVADO` e o novo passa a `ATIVO`
- **THEN** as semanas do macro arquivado permanecem no banco

#### Scenario: Duas propostas simultâneas
- **WHEN** existem duas propostas em `PROPOSTA` para o mesmo atleta
- **THEN** ambas podem coexistir, e aprovar uma delas não altera a outra

---

### Requirement: Proposta não visível ao atleta antes da aprovação

Um `PlanoTreino` em status `PROPOSTA` SHALL ser invisível nos endpoints do atleta.

Os endpoints de geração, leitura de proposta, rascunho, validação, diff e aprovação SHALL ser restritos aos papéis `TECNICO` e `ADMIN`. O endpoint do atleta SHALL retornar apenas o macro `ATIVO` do próprio atleta.

A transição para `ATIVO` SHALL ocorrer somente por ação explícita do coach, registrando quem aprovou e quando.

#### Scenario: Atleta consulta temporada com macro em proposta
- **WHEN** o atleta chama o endpoint da própria temporada e existe apenas macro em `PROPOSTA`
- **THEN** a resposta indica que não há plano de temporada disponível

#### Scenario: Atleta tenta acessar endpoint do coach
- **WHEN** um usuário com papel `ATLETA` chama o endpoint de leitura de proposta ou de aprovação
- **THEN** a resposta é 403

#### Scenario: Aprovação pelo coach
- **WHEN** o coach aprova a proposta
- **THEN** o macro passa a `ATIVO`, com `aprovadoPor` e `aprovadoEm` preenchidos
- **THEN** o atleta passa a ver o mapa da temporada

---

### Requirement: Edição do rascunho pelo coach

O sistema SHALL permitir ao coach editar, em um rascunho, a duração de cada fase, o `volumeAlvoKm`, o `longaoKm`, as sessões-chave, a flag de descarga e os marcos de cada `SemanaPlanejada` futura.

Cada valor editado pelo coach SHALL ter `origemValor = COACH`; um valor vindo de proposta de IA aceita SHALL ter `origemValor = IA_ACEITA`.

Semanas já concluídas, a semana em andamento e a semana da prova SHALL ser somente leitura.

O recálculo solicitado pelo coach SHALL preservar as semanas passadas e os valores com `origemValor = COACH`, regenerando apenas os de `origemValor = MOTOR`.

A soma das semanas por fase SHALL ser igual ao total de semanas do ciclo; enquanto divergir, a aprovação SHALL ser recusada com 422.

#### Scenario: Edição do volume de uma semana futura
- **WHEN** o coach altera o `volumeAlvoKm` da semana 10 de 62 para 58
- **THEN** a semana 10 passa a ter `volumeAlvoKm = 58` e `origemValor = COACH`
- **THEN** as validações são recalculadas sobre o rascunho

#### Scenario: Recálculo preserva edição manual
- **WHEN** o coach edita a semana 10 e depois pede recálculo após mudar o volume de pico
- **THEN** a semana 10 mantém o valor editado e as demais semanas futuras são regeneradas

#### Scenario: Tentativa de editar semana concluída
- **WHEN** o coach tenta alterar o `volumeAlvoKm` de uma semana já concluída
- **THEN** a resposta é 422 e nada muda

#### Scenario: Soma de fases divergente
- **WHEN** o rascunho tem 18 semanas no total e as fases somam 17
- **THEN** a aprovação é recusada com 422, informando a diferença

---

### Requirement: Validações brandas do macrociclo

O `MacrocicloValidator` SHALL avaliar o rascunho e retornar uma lista de alertas, cada um com severidade, regra violada e as semanas afetadas.

As regras SHALL incluir: teto de aumento de volume entre semanas consecutivas; longão como fração máxima do volume da semana; cadência de descarga; janela e profundidade do taper conforme `TaperStrategy`.

Distribuição de intensidade por fase fica fora do MVP: `SemanaPlanejada` não tem campo que a represente.

As validações SHALL NOT bloquear a aprovação do macro.

#### Scenario: Longão concentrado
- **WHEN** uma semana tem 72 km de volume e 34 km de longão
- **THEN** o validador retorna alerta de longão concentrado para aquela semana
- **THEN** a aprovação continua permitida

#### Scenario: Rampa acima do teto
- **WHEN** duas semanas consecutivas sobem o volume acima do teto configurado
- **THEN** o validador retorna alerta de rampa para a segunda semana

#### Scenario: Macro sem alerta
- **WHEN** o rascunho atende a todas as regras
- **THEN** o validador retorna lista vazia

---

### Requirement: Versionamento com semanas executadas imutáveis

Aprovar um rascunho SHALL criar uma versão nova do macro, com `versao` incrementado e `motivoVersao` obrigatório quando existe versão anterior.

As `SemanaPlanejada` de ordem anterior à semana corrente SHALL ser copiadas para a versão nova sem alteração.

O sistema SHALL expor o diff entre duas versões, por semana e por campo, com a origem de cada mudança.

#### Scenario: Segunda versão do macro
- **WHEN** o coach aprova um rascunho de um atleta que já está na semana 7 do macro versão 1
- **THEN** o macro versão 2 fica `ATIVO` com as semanas 1 a 6 idênticas às da versão 1
- **THEN** a versão 1 fica `ARQUIVADO` e o `motivoVersao` da versão 2 está preenchido

#### Scenario: Aprovação sem motivo na segunda versão
- **WHEN** o coach aprova um rascunho de versão 2 sem informar motivo
- **THEN** a resposta é 422 e nenhuma versão é criada

#### Scenario: Diff entre versões
- **WHEN** o coach consulta o diff da versão 1 para a 2
- **THEN** a resposta lista cada semana alterada com valor anterior, valor novo e `origemValor`

---

### Requirement: Template de metodologia por assessoria

O sistema SHALL manter `TemplateMetodologia` com distribuição de fases, curva de volume, frequência de descarga, longão máximo como fração do volume e número de treinos por semana, versionado, com escopo de assessoria e um default global.

A geração do macro SHALL usar o template da assessoria do atleta quando existir, e o default global caso contrário.

#### Scenario: Assessoria com template próprio
- **WHEN** a assessoria tem um template de maratona de 18 semanas e o coach cadastra uma prova-alvo
- **THEN** a proposta é gerada com a distribuição de fases daquele template

#### Scenario: Assessoria sem template
- **WHEN** a assessoria não tem template para a distância da prova
- **THEN** a proposta é gerada com o default global

---

### Requirement: Exclusão e cancelamento da prova-alvo preservam o macrociclo

Excluir uma `Prova` referenciada por um `PlanoTreino` SHALL ser recusado com 422, orientando a cancelar a prova.

Cancelar ou trocar a prova-alvo SHALL arquivar o macro `ATIVO` com `motivoVersao` indicando o cancelamento, descartar as propostas em `PROPOSTA` e preservar as `SemanaPlanejada` e os `PlanoSemanal` vinculados.

No banco, `tb_plano_treino.prova_id` SHALL usar `ON DELETE RESTRICT` e `tb_plano_semanal.plano_treino_id` SHALL usar `ON DELETE SET NULL`, para que nenhuma exclusão apague em cascata o macro ou planos semanais aprovados.

#### Scenario: Exclusão de prova com macro
- **WHEN** o coach tenta excluir uma prova-alvo com macro e planos semanais aprovados
- **THEN** a resposta é 422 e nenhuma linha de `tb_plano_treino`, `tb_semana_planejada` ou `tb_plano_semanal` é apagada

#### Scenario: Cancelamento da prova-alvo
- **WHEN** o coach cancela a prova-alvo de um atleta com macro `ATIVO` na semana 9 de 18
- **THEN** o macro passa a `ARQUIVADO`, as semanas e os planos semanais permanecem, e o atleta deixa de ver a temporada
