# Spec delta: coach-athlete-profile

> Capability nova: tela de perfil do atleta no shell do coach (`/#/coach/athletes/:atletaId`).
> Formato: requirements com cenários verificáveis. Medidas e tokens no `design.md` da change.

## ADDED Requirements

### Requirement: A primeira dobra mostra o que exige decisão

A Visão geral SHALL exibir, logo abaixo das abas, uma faixa "Precisa de decisão · N" com no máximo
3 cards, um por item que exige ação do treinador, ordenados por severidade (`CRITICA` > `ALTA`) e
depois pelo peso do motivo. Fontes: toda sugestão `PENDING` em `sugestoesRecentes` (card próprio,
com `summary` e `confidence` de `SugestaoService.detalhe`), todo sinal em `sinaisRecentes` (card
próprio; funde com a sugestão só quando `sugestaoId` vier preenchido), provas pendentes de
ciência do coach e, para o proprietário, cobrança vencida. Em viewport 1366×768 a faixa inteira
SHALL caber na primeira dobra. Sem itens e sem falha de fonte, a faixa SHALL NOT renderizar.
Quando `avisos` contém `"sinaisRecentes"` ou `"sugestoesRecentes"`, ou o `detalhe` de uma
sugestão falha, a faixa SHALL permanecer visível com "Não foi possível carregar as decisões" e
"Tentar de novo". Os cards "Sinais recentes" e "Sugestões recentes" SHALL NOT existir na tela.

#### Scenario: Três fontes, três cards
- **WHEN** o perfil traz uma sugestão `PENDING`, há uma prova pendente de ciência e o proprietário tem cobrança `OVERDUE`
- **THEN** a faixa mostra "Precisa de decisão · 3" e três cards: sugestão (bloco de IA com o `summary` do `detalhe` e ações Aceitar · Ajustar · Rejeitar), prova (Revisar prova · Ver provas) e mensalidade (Dar baixa · Abrir contrato)

#### Scenario: Sinal e sugestão sem vínculo
- **WHEN** o perfil traz um sinal `ADERENCIA` com `sugestaoId = null` e uma sugestão `PLAN_ADJUST` `PENDING`
- **THEN** são dois cards: o do sinal, sem bloco de IA, e o da sugestão, com bloco de IA e ações

#### Scenario: Fonte indisponível
- **WHEN** `avisos` contém `"sugestoesRecentes"` e há um sinal carregado
- **THEN** a faixa mostra o card do sinal e o estado "Não foi possível carregar as decisões · Tentar de novo"; nunca some

#### Scenario: Mais de três itens
- **WHEN** há cinco itens elegíveis
- **THEN** a faixa mostra os três de maior severidade/peso e "+2" com link para a aba Histórico

#### Scenario: Cobrança não é do treinador
- **WHEN** o usuário não é proprietário e a cobrança está vencida
- **THEN** não há card de mensalidade nem aba Financeiro

#### Scenario: Aceitar remove o card
- **WHEN** o treinador aciona "Aceitar" num card com sugestão
- **THEN** `SugestaoService.aprovar` é chamado, o card some e o contador do título cai em 1, sem recarregar a página; em erro, o card permanece com a mensagem de erro junto às ações

#### Scenario: Motivo desconhecido
- **WHEN** o backend envia um `motivo` que o front não conhece
- **THEN** o card renderiza com o valor capitalizado como título e peso 0, sem lançar

#### Scenario: Sinal de carga cita o número
- **WHEN** o sinal é `FADIGA` ou `SOBRECARGA` e `profile.pmc` termina em TSB −18,4 e ATL 92
- **THEN** a evidência do card mostra "TSB −18,4 · ATL 92" e um link "Ver PMC" que ativa a aba Histórico

#### Scenario: Mesmo estado que o Inbox
- **WHEN** a sugestão foi aprovada no Inbox e o treinador abre o perfil
- **THEN** ela não está na faixa; e uma sugestão aprovada na faixa não está na fila do Inbox na próxima carga

### Requirement: Plano da semana em linhas planejado × realizado

O card "Plano da semana" SHALL listar os 7 dias da semana do plano vigente, cada um em uma linha
com as colunas Dia, Planejado, Realizado e Ação. A coluna Realizado SHALL mostrar o treino
realizado vinculado por `treinoRealizadoId` em `realizadosRecentes` (tipo, duração, TSS, RPE quando
houver), com o chip informativo "Tipo diferente do planejado" (tom neutro) quando ambos os tipos
são conhecidos e diferem e o chip de alerta "Dor relatada" quando `sensacoes` contém `DOR`; "Perdido" para dia passado sem realizado; "Pendente"
com o estado de sincronização para dia futuro; "Hoje" para o dia corrente sem realizado. As regras
de edição e cadeado SHALL ser as de `CurrentWeekPlan` (`editable`, `editRejection`).

#### Scenario: Realizado diferente do prescrito com dor
- **WHEN** Seg tem planejado `REGENERATIVO` e o realizado vinculado é `CONTINUO`, 42 min, TSS 41, `sensacoes = ["DOR"]`
- **THEN** a linha mostra "Regenerativo" à esquerda, "Contínuo · 42 min · TSS 41" à direita, os chips "Tipo diferente do planejado" e "Dor relatada" e o cadeado com o rótulo de `buildLockLabelFromRejection`

#### Scenario: Tipo do realizado desconhecido
- **WHEN** o realizado vinculado não tem `tipoTreino`
- **THEN** não há chip de tipo (ausência de chip não afirma conformidade)

#### Scenario: Dia perdido
- **WHEN** Qua já passou, tem treino planejado e `statusExecucao = PERDIDO`
- **THEN** a coluna Realizado mostra "Perdido" em tom de alerta e nenhum chip

#### Scenario: Hoje
- **WHEN** a linha é a do dia corrente e não há realizado
- **THEN** a linha tem fundo destacado e a coluna Realizado diz "Hoje"

#### Scenario: Realizado fora da janela
- **WHEN** `treinoRealizadoId` não está em `realizadosRecentes`
- **THEN** a coluna Realizado mostra só o estado (`Realizado`), sem chips

#### Scenario: Totais da semana
- **WHEN** os realizados vinculados somam TSS 85 e os planejados somam 143
- **THEN** o cabeçalho do card mostra "TSS 85 / 143 planejado"

#### Scenario: Total parcial
- **WHEN** um `treinoRealizadoId` da semana não está em `realizadosRecentes` (ou `avisos ∋ "realizadosRecentes"`) e os demais somam 85
- **THEN** o cabeçalho mostra "TSS ≥ 85 / 143 planejado" com tooltip "1 treino sem carga carregada"; nunca "TSS 0" com treino concluído

#### Scenario: Dois chips não empilham em notebook
- **WHEN** o viewport é 1366×768 e uma linha tem os dois chips
- **THEN** a altura dessa linha é igual à de uma linha com realizado sem chips

### Requirement: Cabeçalho em duas linhas com abas

O cabeçalho SHALL ter o nome do atleta como único `h1` da página, nível e objetivo em PT-BR na
linha de apoio, o canal do relógio em um chip com detalhe sob demanda, a ação "Ajustar plano" e
um menu com as demais. Abaixo, as abas "Visão geral", "Financeiro" (só
proprietário; rótulo com "N vencida" quando há cobrança vencida) e "Histórico", com a aba ativa na
query `tab`. A aba Financeiro SHALL conter a seção de cobrança; Histórico SHALL conter o PMC
completo, Melhores esforços, Revisão semanal e Provas.

#### Scenario: Único h1
- **WHEN** a página renderiza
- **THEN** há exatamente um `heading` de nível 1, com o nome do atleta

#### Scenario: Deep link
- **WHEN** o treinador abre `/#/coach/athletes/{id}?tab=historico`
- **THEN** a aba Histórico está ativa e o PMC completo está visível

#### Scenario: Detalhe do canal
- **WHEN** o treinador aciona o chip do canal
- **THEN** um popover mostra modelo, status, última atividade e a ação de reenvio, com o mesmo texto que `CoachWatchLine` exibia

### Requirement: Coluna de contexto compacta

A Visão geral SHALL ter, à direita do plano, nesta ordem: resumo de cobrança (proprietário; só
vencida ou a vencer em até 7 dias), "Carga diária (TSS)" com barras de realizado e planejado,
rótulo de valor e seletor 2/4/12 semanas (default 4), "Aderência semanal" com até 4 semanas na
escala de cor de `coach-athlete-diagnosis` e link para a série de 8 semanas em Histórico, e um
card "Sem dados ainda" com uma linha por recurso vazio. A Visão geral é um resumo: os requisitos
de 8 semanas e do gráfico de Forma de `coach-athlete-diagnosis` SHALL continuar atendidos na aba
Histórico. Quando `avisos` contém `"pmc"` ou `"aderenciaSemanal"`, o card correspondente SHALL
mostrar "Dado indisponível", nunca zeros.

#### Scenario: PMC falhou
- **WHEN** `profile.pmc = []` e `avisos ∋ "pmc"`
- **THEN** "Carga diária" mostra "Dado indisponível" e nenhuma barra

#### Scenario: Duas semanas de aderência
- **WHEN** `aderenciaSemanal` tem 2 entradas, ambas 25%
- **THEN** o card mostra as duas barras em vermelho e a nota "2 semanas com dados"

#### Scenario: Recursos vazios
- **WHEN** não há melhores esforços nem revisão semanal
- **THEN** "Sem dados ainda" tem duas linhas; quando ambos existem, o card não renderiza

### Requirement: Rótulos, datas e acessibilidade

A tela SHALL NOT exibir valor cru de enum; todo nível, objetivo, tipo de treino, motivo, severidade,
confiança e status SHALL passar por `enumLabels`. Datas SHALL usar `Seg 09/11` para dia e `09–15/11`
para intervalo. Texto visível SHALL ter no mínimo 13px, exceto eyebrows maiúsculos de 11px com
contraste ≥ 4,5:1. Elementos interativos SHALL ter alvo ≥ 40px (abas 44px), `:focus-visible`
visível, `cursor: pointer`, transições de 150–300ms desligadas sob `prefers-reduced-motion`.

#### Scenario: Sem enum cru
- **WHEN** o perfil traz `nivel = INTERMEDIARIO`, treino `CONTINUO`, sinal `ADERENCIA` `ALTA`
- **THEN** a tela mostra "Intermediário", "Contínuo", "Aderência" e nenhum dos valores crus aparece em texto visível

#### Scenario: Reduced motion
- **WHEN** `prefers-reduced-motion: reduce` está ativo
- **THEN** botões e links não têm `transition-duration` maior que 0

#### Scenario: Coluna única
- **WHEN** o viewport tem menos de 900px
- **THEN** faixa de decisão e colunas empilham em uma coluna sem rolagem horizontal
