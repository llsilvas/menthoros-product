# aviso-mensalidade

Motivo de atenção no Radar para mensalidade vencida e régua de dois e-mails ao atleta antes do
vencimento, desligável por contrato.

## ADDED Requirements

### Requirement: Mensalidade vencida no Radar

O sistema SHALL incluir na fila de atenção do treinador todo atleta com ao menos uma mensalidade
EM_ABERTO vencida, com motivo MENSALIDADE_VENCIDA, severidade MEDIA até 7 dias de atraso e ALTA
acima, evidência com o número de dias, e sem valor monetário.

#### Scenario: Vencida há 3 dias
- **GIVEN** atleta com mensalidade EM_ABERTO vencida há 3 dias
- **WHEN** o Radar é montado
- **THEN** o atleta aparece com MENSALIDADE_VENCIDA, MEDIA, evidência "vencida há 3 dias"

#### Scenario: Só mensalidades pagas
- **GIVEN** atleta cujas mensalidades estão todas PAGAS ou CANCELADAS
- **WHEN** o Radar é montado
- **THEN** o atleta não aparece por esse motivo

### Requirement: Aviso prévio e aviso do dia ao atleta

Para mensalidade EM_ABERTO de contrato ativo com aviso ligado, valor definido e atleta com e-mail,
o sistema SHALL enviar um e-mail de aviso prévio uma única vez em qualquer dia entre 7 e 1 dias
antes do vencimento, e um e-mail de aviso do dia uma única vez no dia do vencimento. Nenhum
e-mail SHALL ser enviado após o vencimento. O e-mail SHALL conter nome da assessoria, valor e data,
sem instrução de pagamento.

#### Scenario: Aviso prévio idempotente
- **GIVEN** mensalidade vencendo em 7 dias, elegível
- **WHEN** o job roda hoje e amanhã
- **THEN** exatamente um e-mail de aviso prévio é enviado e a data de envio fica gravada

#### Scenario: Recuperação dentro da janela
- **GIVEN** mensalidade vencendo em 3 dias sem nenhum aviso enviado
- **WHEN** o job roda
- **THEN** envia o aviso prévio

#### Scenario: Vencida sem aviso
- **GIVEN** mensalidade vencida ontem sem nenhum aviso enviado
- **WHEN** o job roda
- **THEN** nada é enviado

#### Scenario: Contrato com aviso desligado
- **GIVEN** contrato com aviso ao atleta desligado
- **WHEN** o job roda
- **THEN** nenhum e-mail é enviado e nada é gravado

#### Scenario: Falha de envio
- **GIVEN** o envio falha para uma mensalidade
- **WHEN** o job roda
- **THEN** a data de envio não é gravada, o erro é logado e as demais mensalidades são processadas

### Requirement: Toggle por contrato

O proprietário SHALL poder ligar e desligar o aviso ao atleta por contrato, com o padrão ligado.

#### Scenario: Desligar
- **WHEN** o proprietário desliga o aviso no contrato
- **THEN** o contrato persiste aviso desligado e o job passa a ignorar suas mensalidades
