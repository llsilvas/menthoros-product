# contrato-atleta

Registro do contrato comercial entre atleta e assessoria, geração automática de mensalidades,
baixa e cancelamento pelo proprietário, status derivado visível a todo treinador. O Menthoros não
movimenta dinheiro.

## ADDED Requirements

### Requirement: Contrato do atleta

O sistema SHALL manter no máximo um contrato ativo por atleta, com periodicidade
(MENSAL/TRIMESTRAL/SEMESTRAL/ANUAL), valor opcional, dia de vencimento (1–31), data de início e
flag de aviso ao atleta (default ligado). Criar, editar e encerrar SHALL exigir o papel
`PROPRIETARIO` e o tenant do atleta.

#### Scenario: Criação gera a primeira mensalidade
- **GIVEN** atleta sem contrato ativo
- **WHEN** o proprietário cria contrato MENSAL, dia 10, início 2026-09-21
- **THEN** existe uma mensalidade EM_ABERTO com vencimento 2026-10-10

#### Scenario: Edição vale só para o futuro
- **GIVEN** contrato com valor 200 e uma mensalidade EM_ABERTO
- **WHEN** o proprietário altera o valor para 250
- **THEN** a mensalidade em aberto mantém 200 e a próxima gerada nasce com 250

#### Scenario: Encerrar preserva o que é devido
- **GIVEN** contrato ativo com uma mensalidade EM_ABERTO
- **WHEN** o proprietário encerra o contrato
- **THEN** nenhuma mensalidade nova é gerada e a em aberto continua contando no status

#### Scenario: Técnico não proprietário é barrado
- **GIVEN** usuário com papel `TECNICO` sem `PROPRIETARIO`
- **WHEN** chama qualquer endpoint de contrato ou mensalidade
- **THEN** recebe 403

### Requirement: Renovação automática

Enquanto o contrato estiver ativo, o sistema SHALL garantir diariamente que existe uma
mensalidade com vencimento maior ou igual a hoje, gerando as faltantes em sequência a partir da
última, com o dia de vencimento ajustado ao último dia do mês quando necessário. A geração SHALL
ser idempotente.

#### Scenario: Dia 31 em fevereiro
- **GIVEN** contrato MENSAL, dia 31, última mensalidade em 2027-01-31
- **WHEN** a renovação roda em 2027-02-01
- **THEN** a nova mensalidade vence em 2027-02-28, e a seguinte em 2027-03-31

#### Scenario: Recuperação de dias perdidos
- **GIVEN** contrato MENSAL cuja última mensalidade venceu há 3 meses
- **WHEN** a renovação roda
- **THEN** três mensalidades são geradas, uma por mês, e rodar de novo não gera nenhuma

### Requirement: Baixa e cancelamento

O proprietário SHALL poder dar baixa numa mensalidade EM_ABERTO (data de pagamento e valor pago,
com o valor da mensalidade como padrão), desfazer a baixa de uma PAGA, e cancelar uma EM_ABERTO.
Qualquer outra transição SHALL ser rejeitada com 409.

#### Scenario: Baixa com valor padrão
- **WHEN** o proprietário dá baixa sem informar valor pago
- **THEN** a mensalidade fica PAGA com valor pago igual ao valor da mensalidade

#### Scenario: Cancelar mensalidade paga
- **GIVEN** mensalidade PAGA
- **WHEN** o proprietário tenta cancelar
- **THEN** recebe 409 e nada muda

### Requirement: Status derivado sem valor

Todo treinador SHALL ver, no roster e no perfil do atleta, o status de cobrança derivado das
mensalidades EM_ABERTO (VENCIDO se alguma venceu; PROXIMO_VENCIMENTO se a mais próxima vence em
até 7 dias; EM_DIA caso contrário) e o próximo vencimento. Nenhuma resposta fora dos endpoints do
proprietário SHALL conter valor de contrato ou de mensalidade.

#### Scenario: Atleta sem contrato
- **GIVEN** atleta sem contrato
- **WHEN** um treinador lê o roster
- **THEN** status e próximo vencimento estão ausentes

#### Scenario: Técnico vê status, não valor
- **GIVEN** mensalidade EM_ABERTO vencida há 2 dias
- **WHEN** um técnico não proprietário lê o roster
- **THEN** vê VENCIDO e a data, e a resposta não contém nenhum campo de valor

### Requirement: Migração dos campos legados

Os campos `tipoPlanoAtleta` e `dataVencimentoPlano` de `Atleta` SHALL ser convertidos em contrato
ativo e primeira mensalidade quando houver data, e removidos em seguida.

#### Scenario: Atleta com data legada
- **GIVEN** atleta com tipo TRIMESTRAL e vencimento 2026-10-05
- **WHEN** a migração roda
- **THEN** existe contrato ativo TRIMESTRAL, dia 5, início 2026-10-05, valor nulo, e uma
  mensalidade EM_ABERTO em 2026-10-05
