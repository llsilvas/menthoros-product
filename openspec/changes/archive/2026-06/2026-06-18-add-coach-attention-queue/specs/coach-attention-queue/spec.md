## ADDED Requirements

### Requirement: Priorizar atletas que exigem ação do treinador
O sistema SHALL expor, on-demand e read-only, uma fila de atenção do treinador que consolida sinais já produzidos pelo backend, priorizando atletas que exigem revisão operacional, restrita ao tenant do treinador.

#### Scenario: Contrato mínimo do item
- **WHEN** um item da fila for gerado
- **THEN** ele SHALL conter `atletaId`, `severity`, `priorityScore`, `primaryReason`, `suggestedAction` e ao menos uma evidência `{label, value}`

#### Scenario: Atleta com fadiga/forma em alerta
- **WHEN** o `tsbAtual` do atleta cair em faixa de alerta (`FaixaTsb` com `nivelAlerta` CRITICO/ALTO/ATENCAO)
- **THEN** o sistema SHALL incluí-lo com `primaryReason` de fadiga/forma e evidência do valor de TSB e da faixa

#### Scenario: Atleta com sobrecarga/progressão
- **WHEN** o `PlanoMetaDados` do atleta tiver `alertaSobrecarga`, `alertaRampAlto`, `alertaDiasConsecutivos` ou `alertaNecessitaDescanso` ativo
- **THEN** o sistema SHALL sinalizá-lo com o motivo e a ação correspondentes e evidência da flag/contagem

#### Scenario: Atleta com aderência ruim ou inativo
- **WHEN** o atleta acumular treinos `PERDIDO`/subexecução na janela recente **ou** estiver sem atividade há ≥ 7 dias
- **THEN** o sistema SHALL sinalizar necessidade de intervenção

#### Scenario: Atleta sem plano ativo
- **WHEN** um atleta não possuir `PlanoMetaDados` ativo
- **THEN** o sistema SHALL incluí-lo com `primaryReason = SEM_PLANO` e severidade ALTA, em vez de omiti-lo

#### Scenario: Corte de severidade na v1
- **WHEN** o único sinal de um atleta mapear para severidade MEDIA (ex.: zonas vencidas, ramp alto, 1-2 perdidos, inatividade entre 7 e 13 dias)
- **THEN** a fila v1 SHALL **não** exibir esse atleta (expõe apenas `severity ≥ ALTA`)

#### Scenario: Priorização determinística da fila
- **WHEN** múltiplos atletas estiverem sinalizados
- **THEN** o sistema SHALL ordenar por `severity` desc, depois `priorityScore` desc, depois sinal mais recente
- **AND** o mesmo estado de entrada SHALL produzir sempre a mesma ordem
- **AND** o sistema SHALL limitar a resposta a no máximo N itens por tenant (cap de segurança)

#### Scenario: Deduplicação por motivo principal
- **WHEN** um atleta possuir múltiplos sinais do mesmo motivo agregado
- **THEN** o sistema SHALL emitir um único item, consolidando as evidências
- **AND** quando houver motivos diferentes, o motivo principal SHALL ser o de maior severidade (desempate por `priorityScore`)

#### Scenario: Isolamento multi-tenant
- **WHEN** existirem atletas de outra assessoria (tenant)
- **THEN** a fila SHALL conter apenas atletas do tenant do treinador autenticado

### Requirement: Cada item da fila deve ser acionável
O sistema SHALL exibir motivo principal, ação sugerida e evidências para cada item da fila.

#### Scenario: Item de atenção exibido
- **WHEN** um atleta for listado na fila
- **THEN** o item SHALL incluir o motivo principal da priorização
- **AND** SHALL incluir uma recomendação de ação determinística (template por motivo)
- **AND** SHALL incluir evidências resumidas tipadas `{label, value}` que justificam a priorização

### Requirement: Alimentar a sinalização do calendário do coach
O sistema SHALL refletir a existência de itens de atenção na flag `hasAlert` do calendário do coach.

#### Scenario: hasAlert derivado da fila
- **WHEN** um atleta possuir item na fila de atenção
- **THEN** o dia correspondente no `CoachCalendarioDto` SHALL marcar `hasAlert = true` (deixando de ser fixo `false`)
