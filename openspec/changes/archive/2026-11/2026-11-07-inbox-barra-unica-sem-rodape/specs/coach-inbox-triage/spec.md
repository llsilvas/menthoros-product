# coach-inbox-triage — delta (inbox-barra-unica-sem-rodape)

Capability nova: a tela de triagem do treinador (`/coach/inbox`), lista de atletas à esquerda e
detalhe do selecionado à direita. Este delta cobre só o que esta change decide; os demais
comportamentos da tela (fila de atenção, CTA contextual, estados da lista) seguem nos testes e
entram na capability quando uma change os tocar.

## ADDED Requirements

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
