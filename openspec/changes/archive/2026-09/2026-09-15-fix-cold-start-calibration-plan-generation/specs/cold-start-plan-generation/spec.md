# Cold-start plan generation

Contrato proposto para revisão. A geração em CALIBRATION é o escopo dos requisitos de restrições e consistência; o atalho de baseline é exclusivo de ausência total de treinos e métricas. As decisões de tolerância/semântica e integração listadas no design precisam ser resolvidas antes de implementar os requisitos dependentes.

## ADDED Requirements

### Requirement: Baseline estimado sem reconstrução no histórico vazio (CA1)

O sistema SHALL calcular baseline ESTIMATED sem reconstrução histórica quando confirmar que o atleta em calibração não possui treinos realizados nem métricas diárias no tenant. SHALL preservar a política vigente de calibração e os efeitos necessários de inicialização de metadados/cache, sem criar dados medidos fictícios.

#### Scenario: Primeiro plano sem qualquer histórico
- **Given** um atleta em CALIBRATION, sem plano anterior, sem TreinoRealizado e sem MetricasDiarias
- **When** o contexto de geração é preparado
- **Then** o baseline tem origem ESTIMATED e nenhuma chamada a recalcularHistoricoCompleto ocorre
- **And** nenhuma série diária fictícia é criada e o plano exige revisão do coach

#### Scenario: Reavaliação semanal ainda sem histórico
- **Given** um atleta permanece em calibração e ainda não possui treinos nem métricas
- **When** ocorre reavaliação semanal no ciclo de planejamento
- **Then** o baseline continua estimado sem reconstrução histórica
- **And** as regras vigentes de estágio/saída não são substituídas pela ausência de rebuild

### Requirement: Classificação distingue vazio de dados parciais ou inconsistentes (CA2, CA12)

O sistema SHALL determinar ausência total pelos registros pertinentes ao tenant, não pelo número de planos, semanas completas ou pela ausência de dados em uma janela recente. SHALL NOT introduzir corte arbitrário de histórico para calcular CTL/ATL nesta mudança.

#### Scenario: Atividade recente sem semana completa
- **Given** um atleta sem plano anterior com uma atividade realizada ontem e semanasObservadas igual a zero
- **When** prepara o baseline
- **Then** o histórico é reconhecido como não vazio e a atividade participa do caminho vigente de cálculo

#### Scenario: Métricas antigas sem treino realizado disponível
- **Given** um atleta sem treinos disponíveis, mas com métricas diárias antigas
- **When** prepara o baseline
- **Then** não usa o atalho de ausência total nem descarta essas métricas silenciosamente
- **And** mantém o tratamento de reconciliação explicitamente definido para esse estado

#### Scenario: Histórico extenso
- **Given** um atleta com histórico de 398 dias
- **When** percorre o caminho de histórico não vazio
- **Then** esta change não trunca o histórico em 42, 90 ou 398 dias nem reinicializa a recorrência CTL/ATL arbitrariamente

### Requirement: Calibração governa o contexto anterior à geração (CA3, CA11)

O sistema SHALL resolver o contexto de calibração e as restrições determinísticas pertinentes antes da primeira geração pela IA. SHALL usar a mesma decisão e referência temporal no prompt, validação e persistência, sem manter transação de banco aberta durante a chamada externa.

#### Scenario: Política conhecida antes do prompt
- **Given** um atleta em CALIBRATION com política e restrições resolvidas
- **When** monta o prompt e chama a IA
- **Then** as restrições da calibração já fazem parte do contrato de geração
- **And** os checks sobre a resposta usam essa mesma política, não somente observação posterior em shadow

#### Scenario: Geração atravessa meia-noite
- **Given** o contexto foi preparado antes da meia-noite e a resposta chega depois
- **When** valida e persiste o plano
- **Then** a referência temporal do planejamento permanece a do snapshot

#### Scenario: Calibração com atividades acumuladas
- **Given** um atleta em calibração passou a ter dados reais
- **When** ocorre o re-baseline semanal
- **Then** dados reais participam da fórmula e do score vigentes
- **And** a mudança não altera silenciosamente os critérios de saída ou força origem MEASURED sem satisfazer a regra vigente

### Requirement: Invariantes obrigatórias são verificadas após normalização (CA4, CA5)

O sistema SHALL distinguir invariantes obrigatórias de recomendações por tipo de treino e SHALL verificar as invariantes sobre a representação normalizada. SHALL rejeitar violações obrigatórias residuais e SHALL NOT converter toda recomendação em erro. Fonte de verdade, tolerância e arredondamento SHALL ser compartilhados entre geração, normalização e validação conforme a matriz aprovada no design.

#### Scenario: Totais incoerentes após reparo
- **Given** a soma das etapas difere dos totais fora da tolerância aprovada e não existe reparo inequívoco que preserve a prescrição
- **When** termina a normalização
- **Then** a resposta é inválida para persistência e não é aceita apenas com WARN

#### Scenario: Normalização repetida
- **Given** um plano normalizado e coerente
- **When** a mesma normalização é reaplicada
- **Then** não duplica repetições nem modifica novamente os totais

#### Scenario: Recomendação isolada
- **Given** um treino viola apenas uma recomendação, mas cumpre todas as invariantes obrigatórias e a política de calibração
- **When** valida o plano
- **Then** a recomendação isolada não dispara rejeição ou retry

### Requirement: Pace respeita a semântica do tipo e das etapas (CA5)

O sistema SHALL validar ritmo, distância e duração usando o significado de cada campo por tipo de treino. SHALL NOT tratar automaticamente o pace do esforço como pace médio de uma sessão intervalada completa.

#### Scenario: Intervalado com recuperação mais lenta
- **Given** um intervalado válido tem aquecimento, esforços, recuperações e desaquecimento com ritmos distintos
- **When** verifica a consistência temporal e de distância
- **Then** usa a semântica aprovada das etapas e agregados e não rejeita somente pela diferença entre pace do tiro e média global

#### Scenario: Contínuo com dados incompatíveis
- **Given** um contínuo declara distância, duração e ritmo da sessão incompatíveis segundo a regra aprovada
- **When** a inconsistência permanece após normalização
- **Then** a validação obrigatória reprova a resposta

### Requirement: Resiliência usa um único orçamento de gerações (CA6)

O sistema SHALL executar no máximo duas gerações lógicas pela IA por requisição, reutilizando a resiliência existente e a proteção de orçamento antes da segunda tentativa. SHALL NOT iniciar um novo ciclo legado após esgotar as tentativas. Erros de infraestrutura SHALL manter seu tratamento distinto dos erros de prescrição.

#### Scenario: Primeira estrutura inválida e segunda válida
- **Given** a primeira resposta viola uma regra estrutural obrigatória e ainda há orçamento para retry
- **When** a segunda resposta atende ao contrato
- **Then** são feitas exatamente duas gerações lógicas e o plano segue ao check final

#### Scenario: Segunda resposta permanece inválida
- **Given** as duas respostas falham nas invariantes obrigatórias
- **When** esgota a resiliência
- **Then** retorna erro de domínio HTTP 422 com o envelope vigente e nenhum plano é salvo
- **And** não inicia terceira geração nem novo ciclo de fallback legado

#### Scenario: Orçamento esgotado antes do retry
- **Given** a primeira resposta falha e o orçamento vigente para iniciar a segunda foi esgotado
- **When** avalia o retry
- **Then** encerra com erro de domínio sem iniciar a segunda geração

### Requirement: Check final protege a representação persistida (CA7)

O sistema SHALL verificar as invariantes afetadas depois de todas as transformações finais e antes de salvar o plano. Violação obrigatória nessa etapa SHALL ser terminal, sem retry, plano parcial, consumo de revisão do plano ou evento de aprovação/exportação.

#### Scenario: Redistribuição ou inclusão de prova introduz violação
- **Given** a resposta passou pela validação prévia, mas uma transformação final viola restrição obrigatória
- **When** o check final examina a representação persistível
- **Then** retorna erro de domínio sem nova geração nem gravação parcial do plano

#### Scenario: Falha da IA após snapshot válido de onboarding
- **Given** um snapshot válido de onboarding foi gravado em transação curta anterior à IA
- **When** a geração falha
- **Then** esse snapshot pode permanecer como estado de onboarding
- **And** nenhum plano, consumo de revisão ou evento de aprovação/exportação é produzido pela falha

### Requirement: Revisão do coach e contratos públicos são preservados (CA8)

O sistema SHALL manter plano válido de baixa confiança em AGUARDANDO_REVISAO e SHALL excluí-lo das consultas apenas de aprovados até aprovação explícita pelo fluxo vigente. SHALL preservar DTOs de sucesso, autenticação e envelope de erro de domínio; a nova rejeição de inconsistência obrigatória SHALL usar HTTP 422.

#### Scenario: Plano válido do cenário C
- **Given** um atleta em calibração com reviewMode MANDATORY_BLOCKING
- **When** gera um plano que satisfaz todas as invariantes
- **Then** o plano permanece AGUARDANDO_REVISAO e não é autoaprovado
- **And** a consulta de planos aprovados não o retorna ao atleta

### Requirement: Isolamento e concorrência abrangem o novo contexto (CA9)

O sistema SHALL preservar autorização, isolamento por tenant e prevenção de plano ativo duplicado em todo o fluxo, incluindo baseline e snapshot. SHALL impedir persistência com contexto invalidado por alteração concorrente relevante sem iniciar retry oculto da IA.

#### Scenario: Identificador de atleta de outro tenant
- **Given** uma requisição autenticada em um tenant usa identificador pertencente a outro
- **When** tenta carregar contexto ou gerar o plano
- **Then** a operação é negada pelo contrato vigente sem ler/expor histórico nem atualizar baseline daquele atleta

#### Scenario: Duas gerações para a mesma semana
- **Given** duas requisições concorrentes geram plano para o mesmo atleta e semana
- **When** ambas tentam persistir
- **Then** permanece no máximo um plano ativo e a outra segue o contrato de conflito vigente

#### Scenario: Restrição relevante muda durante a IA
- **Given** uma restrição que invalida o snapshot muda após o carregamento
- **When** o fluxo chega ao limite de escrita
- **Then** não salva o plano baseado no contexto invalidado e não inicia nova geração oculta

### Requirement: Observabilidade distingue custo histórico e custo da IA (CA10)

O sistema SHALL medir etapas, tentativas e resultado por coorte e SHALL informar apenas intervalos efetivamente reconstruídos. SHALL NOT registrar prompt integral ou dados sensíveis em logs e SHALL NOT usar identificadores pessoais como labels de métricas.

#### Scenario: Cold-start vazio com retry
- **Given** uma requisição sem histórico precisa de duas gerações
- **When** termina com sucesso ou erro
- **Then** as métricas distinguem contexto/baseline, cada tentativa e persistência quando executada
- **And** registram zero dias reconstruídos sem atribuir ao histórico o tempo das chamadas à IA

#### Scenario: Reconstrução real com histórico
- **Given** existe intervalo de histórico que requer reconstrução no caminho vigente
- **When** o serviço executa esse trabalho
- **Then** o log/medição informa o intervalo e quantidade de dias realmente processados
