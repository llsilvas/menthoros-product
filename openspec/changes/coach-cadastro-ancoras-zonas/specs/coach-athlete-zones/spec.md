## ADDED Requirements

### Requirement: Treinador cadastra as âncoras das zonas do atleta
O sistema SHALL expor `PUT /api/v1/coach/atletas/{atletaId}/zonas/ancoras` para o treinador gravar as
âncoras de FC (limiar, máxima, data do teste, origem) e/ou de pace (limiar em segundos/km, data do
teste, origem). Grupo ausente SHALL manter os valores atuais daquele eixo. O grupo de FC SHALL exigir
o limiar; a máxima é opcional (vazia mantém a vigente). A máxima informada ou, se vazia, a gravada
SHALL ser no mínimo o topo da Z5 (`round(limiar × 1,06)`); máxima estimada SHALL NOT bloquear o
salvamento. Os limites aceitos SHALL ser os mesmos das restrições do banco. A resposta SHALL ser a mesma tabela de zonas
do `GET .../zonas`, recalculada. Acesso restrito a `TECNICO`/`ADMIN`; atleta de outro tenant responde `404`.

#### Scenario: Cadastrar pace de limiar
- **WHEN** o treinador envia `pace = { limiarSegKm: 290, dataTeste: "2026-10-12", origem: "TESTE_CAMPO" }`
  para um atleta sem `paceLimiar`
- **THEN** a resposta traz `disponibilidade.pace = true`, `ancoras.fonteLimiarPace = TESTE_CAMPO` e as
  seis zonas com `pace` calculado por `ZonaTreinoService`

#### Scenario: Só um eixo
- **WHEN** o corpo traz só o grupo `pace`
- **THEN** `fcLimiar`, `fcMaxima`, data e origem de FC permanecem como estavam

#### Scenario: FC máxima abaixo do topo da Z5
- **WHEN** `fc.maxima = 169` e `fc.limiar = 168`
- **THEN** a resposta é `400` apontando `fc.maxima` (mínimo 178) e nada é gravado

#### Scenario: Máxima estimada não bloqueia
- **WHEN** o atleta não tem `fc_maxima` gravada nem data de nascimento e o treinador envia só
  `fc.limiar = 185`
- **THEN** a resposta é `200` e `fcMaxima.estimada` continua `true`

#### Scenario: Atleta de outro tenant
- **WHEN** o `atletaId` pertence a outro tenant
- **THEN** o PUT e a simulação respondem `404`; perfil sem `TECNICO`/`ADMIN` recebe `403`

#### Scenario: Reenvio ao intervals.icu
- **WHEN** o treinador salva o grupo `fc` de um atleta com intervals.icu conectado e o intervals.icu falha
- **THEN** a resposta continua `200` e os valores ficam gravados; a falha só gera log

### Requirement: Simulação das zonas sem persistir
O sistema SHALL expor `POST /api/v1/coach/atletas/{atletaId}/zonas/simulacao`, com o mesmo corpo do
cadastro, devolvendo as zonas que aquelas âncoras gerariam, sem alterar o atleta. O front SHALL usar
este endpoint para a prévia e não SHALL reimplementar o cálculo das zonas.

#### Scenario: Simular não grava
- **WHEN** o treinador simula `pace.limiarSegKm = 290` e em seguida consulta `GET .../zonas`
- **THEN** o GET devolve os mesmos valores de antes da simulação

### Requirement: Diálogo de cadastro de zonas a partir do card
O card "Zonas do atleta" SHALL oferecer "Editar zonas" quando o host permitir edição, abrindo um
diálogo com abas "Zonas de FC" e "Zonas de Ritmo", campos de âncora, prévia das seis zonas vinda da
simulação e o aviso "Os próximos planos usam estes valores. Treinos já criados com alvo em bpm ou
ritmo fixo não mudam." Salvar SHALL atualizar, sem recarregar a página, todos os consumidores das
zonas do mesmo atleta que estiverem montados.

#### Scenario: Consumidores atualizados
- **WHEN** `PlanoDetalhePanel` e `CurrentWeekPlan` do mesmo atleta estão montados e o treinador salva
  no diálogo
- **THEN** o card e o seletor de zona passam a usar as novas faixas, e uma resposta mais antiga que
  chegue depois é descartada

#### Scenario: FC estimada
- **WHEN** `ancoras.fcLimiarEstimada = true`
- **THEN** o card continua mostrando a tabela de FC, com selo "estimada" e o CTA "Cadastrar limiar de FC"

#### Scenario: FC máxima estimada não é promovida
- **WHEN** o treinador salva só `fc.limiar` e a máxima vigente é estimada
- **THEN** `fcMaxima.estimada` continua `true`

#### Scenario: Âncora inválida no diálogo
- **WHEN** o treinador digita `fc.maxima` menor que o limiar
- **THEN** o campo mostra o erro, a prévia daquele eixo some e "Salvar zonas" fica desabilitado

## MODIFIED Requirements

### Requirement: Tabela de zonas visível na revisão e na edição do plano
O front SHALL exibir, no painel de revisão do plano e nos dialogs de editar/adicionar treino, uma
seção recolhível "Zonas do atleta" com as seis zonas (pace, FC, RPE típico como referência genérica
com tooltip, uso típico), as âncoras com datas e origem, o chip de
ajuste por fadiga quando `segundosPorKm > 0` e aviso quando o último teste de limiar tem mais de
90 dias. Estados de carregamento, erro e eixo indisponível SHALL ser explícitos.

#### Scenario: Plano em revisão
- **WHEN** o treinador abre um plano em `AGUARDANDO_REVISAO`
- **THEN** a seção existe, recolhida, e ao expandir mostra as seis linhas com os valores do endpoint

#### Scenario: Sem pace de limiar
- **WHEN** o atleta não tem `paceLimiar`
- **THEN** a coluna de pace mostra "Ritmo não cadastrado"; quando o host permite edição, o texto é um
  link que abre o diálogo de cadastro na aba "Zonas de Ritmo"; a coluna de FC segue preenchida
