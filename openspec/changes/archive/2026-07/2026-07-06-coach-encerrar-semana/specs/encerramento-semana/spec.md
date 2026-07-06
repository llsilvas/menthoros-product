## ADDED Requirements

### Requirement: Encerrar semana on-demand pelo treinador
O sistema SHALL expor uma ação `encerrarSemana(planoId)` que marca `PERDIDO` os treinos `PENDENTE`
elegíveis do `PlanoSemanal` informado e atualiza o status do plano. A elegibilidade SHALL ser: treino
`PENDENTE` com `dataTreino < hoje`, mais os de `dataTreino == hoje` **apenas quando** `hoje == plano.semanaFim`
(dia de fechamento da semana). Por ser decisão explícita do treinador, esta ação SHALL NOT aplicar carência.

#### Scenario: Fechar no domingo marca o longão do dia sem carência
- **WHEN** `encerrarSemana(planoId)` é chamado no domingo (`hoje == semanaFim`) para um plano com o longão de sábado e o de domingo em `PENDENTE`
- **THEN** ambos os longões (sábado e domingo/hoje) são marcados `PERDIDO`, ignorando a carência de 3 dias

#### Scenario: No meio da semana o treino de hoje é preservado
- **WHEN** `encerrarSemana(planoId)` é chamado numa terça (`hoje < semanaFim`) para um plano com `PENDENTE` de segunda, um `PENDENTE` de hoje (terça) e treinos futuros
- **THEN** só o de segunda (`dataTreino < hoje`) vira `PERDIDO`; o de hoje e os futuros permanecem `PENDENTE`

#### Scenario: Não altera REALIZADO, PARCIAL, LIVRE ou futuro
- **WHEN** `encerrarSemana(planoId)` roda sobre um plano com treinos `REALIZADO`, `PARCIAL`, `LIVRE` e `PENDENTE` estritamente futuro
- **THEN** nenhum desses treinos tem o status alterado

#### Scenario: Idempotência em plano já encerrado
- **WHEN** `encerrarSemana(planoId)` é chamado para um plano `CONCLUIDO` sem `PENDENTE` passado
- **THEN** nenhum treino muda, o status permanece `CONCLUIDO` e o resultado informa `treinosFinalizados = 0` sem lançar exceção

### Requirement: Encerrar a semana em lote para toda a assessoria
O sistema SHALL expor uma ação `encerrarSemanaLoteAssessoria` que encerra a semana corrente de todos
os atletas do tenant corrente, aplicando a mesma regra de elegibilidade on-demand (sem carência)
por atleta. A ação SHALL operar apenas sobre os atletas do `TenantContext` corrente e SHALL isolar a
falha de um atleta sem abortar o lote.

#### Scenario: Encerra a semana corrente de todos os atletas do tenant
- **WHEN** o treinador aciona o encerramento em lote para um tenant com N atletas, cada um com uma semana corrente contendo `PENDENTE` passados
- **THEN** a semana corrente de cada atleta é encerrada e o resultado traz um resumo por atleta mais os totais (atletas processados, planos concluídos, treinos perdidos)

#### Scenario: Lote é escopado ao tenant do treinador
- **WHEN** um treinador do tenant A aciona o encerramento em lote, havendo atletas no tenant A e no tenant B
- **THEN** apenas os atletas do tenant A são processados; nenhum atleta do tenant B é tocado

#### Scenario: Falha individual não aborta o lote e os demais são commitados
- **WHEN** o encerramento de um atleta lança exceção durante o lote de N atletas
- **THEN** os outros N-1 atletas ficam persistidos como `CONCLUIDO` (commit efetivado, cada atleta em sua própria transação) e o atleta com falha é reportado como `FalhaAtleta` no resultado

#### Scenario: Atleta sem semana corrente é ignorado, não é falha
- **WHEN** o lote encontra um atleta do tenant sem plano na semana corrente
- **THEN** o atleta é contabilizado como "sem plano" (ignorado), não como falha, e não afeta a contagem de processados

### Requirement: Preview do encerramento sem persistência
O sistema SHALL expor uma operação de preview (dry-run) que calcula o impacto do encerramento em lote
sem alterar nenhum dado, para o treinador confirmar antes de disparar.

#### Scenario: Preview retorna impacto projetado sem gravar
- **WHEN** o treinador chama o preview do encerramento em lote para um tenant com treinos `PENDENTE` passados
- **THEN** a resposta informa quantos treinos seriam marcados `PERDIDO` por atleta e quais planos fechariam, e nenhum treino ou plano é alterado no banco

### Requirement: Robustez de fuso, concorrência e plano sem elegíveis
O encerramento SHALL resolver a data corrente no fuso `America/Sao_Paulo` (ou via `CURRENT_DATE` do banco),
SHALL ignorar sem lançar um treino que deixou de ser `PENDENTE` durante o processamento, e SHALL evitar o
reprocesso perpétuo de planos passados sem treinos elegíveis.

#### Scenario: Data corrente resolvida no fuso local, não no do JVM
- **WHEN** o encerramento é acionado no domingo às 22h BRT (segunda 01h UTC) e existe um treino planejado para a segunda seguinte
- **THEN** o treino de segunda não é marcado `PERDIDO`

#### Scenario: Treino que virou REALIZADO durante o processamento é ignorado
- **WHEN** um treino passa de `PENDENTE` a `REALIZADO` entre a seleção e a marcação durante o encerramento
- **THEN** o encerramento ignora esse treino sem lançar exceção e finaliza os demais treinos do plano normalmente

#### Scenario: Plano passado sem treinos elegíveis é fechado e não reprocessado
- **WHEN** o fechamento automático seleciona um plano já passado (`semanaFim < hoje`) que não tem nenhum `PENDENTE` a finalizar (inclusive plano vazio)
- **THEN** o plano é levado a `CONCLUIDO` (ou removido da seleção) e não é reprocessado nas execuções seguintes

#### Scenario: On-demand no meio da semana avisa e não fecha o plano
- **WHEN** `encerrarSemana(planoId)` é chamado para um plano cujo `semanaFim` ainda é futuro, com `PENDENTE` passados e treinos futuros
- **THEN** só os `PENDENTE` com `dataTreino < hoje` são marcados `PERDIDO` (o treino de hoje é preservado, pois `hoje != semanaFim`), o plano permanece não `CONCLUIDO`, e o resultado traz um aviso de que a semana ainda não terminou

### Requirement: Fechar o plano semanal e sinalizar prontidão para a próxima
O sistema SHALL levar o `PlanoSemanal` a `CONCLUIDO` quando, após o encerramento, todos os seus
treinos estiverem `REALIZADO` ou `PERDIDO`, e SHALL publicar um `SemanaEncerradaEvent`. O sistema
SHALL NOT gerar automaticamente o plano da semana seguinte — a geração permanece disparada pelo treinador.

#### Scenario: Plano fecha quando todos os treinos estão finalizados
- **WHEN** `encerrarSemana(planoId)` conclui e todos os treinos do plano estão `REALIZADO` ou `PERDIDO`
- **THEN** `PlanoSemanal.status` passa a `CONCLUIDO` e o resultado informa `prontoParaProximaSemana = true`

#### Scenario: Evento de encerramento é publicado sem disparar geração
- **WHEN** um plano é encerrado
- **THEN** um `SemanaEncerradaEvent` com `planoId`, `atletaId`, `tenantId`, nº de perdidos e `origem` (`ON_DEMAND` ou `AUTOMATICO`) é publicado, e nenhum plano da próxima semana é gerado como efeito

#### Scenario: Origem distingue fechamento pelo coach e pelo sistema
- **WHEN** um plano é encerrado pela ação do treinador e outro pelo scheduler
- **THEN** o primeiro evento tem `origem = ON_DEMAND` e o segundo `origem = AUTOMATICO`, permitindo ao coach distinguir "eu fechei" de "o sistema fechou"

#### Scenario: Evento só é entregue após o commit da transação
- **WHEN** o encerramento de um atleta sofre rollback (falha ou optimistic lock) após a publicação do evento
- **THEN** os consumidores do `SemanaEncerradaEvent` não são acionados (entrega em `AFTER_COMMIT`), evitando reação a um encerramento não commitado

### Requirement: Fechamento automático com carência de 3 dias
O sistema SHALL executar diariamente um job que encerra os planos semanais não `CONCLUIDO` cujo
`semanaFim` seja anterior ou igual a `hoje - 3 dias`, aplicando a mesma regra de finalização de
pendentes passados. Planos dentro da carência SHALL NOT ser encerrados automaticamente.

#### Scenario: Carência bloqueia o fechamento automático
- **WHEN** o job diário roda e existe um plano não `CONCLUIDO` cujo `semanaFim` foi há 2 dias
- **THEN** o plano não é encerrado

#### Scenario: Fechamento automático após a carência
- **WHEN** o job diário roda e existe um plano não `CONCLUIDO` cujo `semanaFim` foi há 3 ou mais dias, com `PENDENTE` passados
- **THEN** o plano é encerrado (pendentes passados → `PERDIDO`, plano → `CONCLUIDO`)

#### Scenario: Isolamento multi-tenant durante a varredura
- **WHEN** o job encerra planos elegíveis de dois tenants distintos
- **THEN** cada encerramento executa com o `TenantContext` do seu próprio tenant e nenhuma query acessa dados de outro tenant

### Requirement: Reversibilidade de treino finalizado como perdido
O sistema SHALL permitir que um treino planejado marcado `PERDIDO` volte a `REALIZADO` quando o
atleta registrar a execução retroativamente, recalculando o status do plano.

#### Scenario: Registro retroativo reverte PERDIDO para REALIZADO
- **WHEN** o atleta registra retroativamente um treino cujo planejado está `PERDIDO`
- **THEN** o planejado passa a `REALIZADO`, vincula-se ao `TreinoRealizado` criado, e o status do `PlanoSemanal` é recalculado

### Requirement: Autorização e isolamento do endpoint de encerramento
O endpoint `POST /api/v1/coach/planos/{planoId}/encerrar-semana` SHALL exigir papel de treinador ou
admin e SHALL validar que o plano pertence ao tenant corrente.

#### Scenario: Usuário sem papel de coach é rejeitado
- **WHEN** um usuário sem papel de treinador/admin chama `POST /api/v1/coach/planos/{planoId}/encerrar-semana`
- **THEN** a resposta é 403

#### Scenario: Plano de outro tenant não é encontrado
- **WHEN** um treinador chama o endpoint com um `planoId` que pertence a outro tenant
- **THEN** a resposta é 404 (via validação de tenant), sem encerrar nada

### Requirement: Persistência da origem de encerramento para métrica de adoção
O sistema SHALL persistir a origem do encerramento (`ON_DEMAND` ou `AUTOMATICO`) no
`PlanoSemanal` no momento do encerramento, habilitando a consulta da métrica-farol de
adoção (proporção de encerramentos on-demand ≥ 60%).

#### Scenario: Encerramento on-demand persiste origem ON_DEMAND
- **WHEN** o treinador encerra uma semana via ação individual ou lote
- **THEN** o `PlanoSemanal.origemEncerramento` é persistido como `ON_DEMAND`

#### Scenario: Encerramento automático persiste origem AUTOMATICO
- **WHEN** o scheduler encerra uma semana após a carência
- **THEN** o `PlanoSemanal.origemEncerramento` é persistido como `AUTOMATICO`

#### Scenario: Planos pré-existentes têm origem nula
- **GIVEN** um plano encerrado antes da migration
- **WHEN** consultado
- **THEN** `origemEncerramento` é `null` (não fabricar dado retroativamente)

### Requirement: Carência do fallback parametrizável via property
O scheduler de encerramento automático SHALL usar o valor da property
`menthoros.encerramento-semana.carencia-dias` (default `3`) como número de dias de
carência, em vez de um literal hardcoded.

#### Scenario: Carência customizada respeita o valor configurado
- **GIVEN** `menthoros.encerramento-semana.carencia-dias=5`
- **WHEN** o job diário roda e existe um plano não `CONCLUIDO` cujo `semanaFim` foi há 4 dias
- **THEN** o plano não é encerrado (carência de 5 dias ainda não decorreu)

#### Scenario: Carência default é 3 dias quando a property não está definida
- **GIVEN** nenhum override de `menthoros.encerramento-semana.carencia-dias`
- **WHEN** o job diário roda e existe um plano cujo `semanaFim` foi há 3 dias
- **THEN** o plano é encerrado (default 3 dias)
