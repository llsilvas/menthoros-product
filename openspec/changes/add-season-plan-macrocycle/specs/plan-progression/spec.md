## ADDED Requirements

### Requirement: Macro ativo define o alvo semanal

Com `SemanaPlanejada` do macro `ATIVO` presente para a semana de referência, o alvo semanal SHALL partir do `tssAlvo` da semana planejada, e não de `ctlAtual * 7`.

A decisão de progressão reativa SHALL continuar sendo calculada e registrada, mas SHALL NOT elevar o alvo acima do `tssAlvo` do macro. O step-back por progressão contínua SHALL NOT ser aplicado quando a fase vem do macro, porque as descargas já estão no macro.

Sem macro ativo, a progressão SHALL seguir exatamente as regras atuais desta capability.

#### Scenario: Progressão indicaria aumento acima do macro
- **WHEN** a progressão reativa indicaria +10% e a semana planejada pede 620 TSS
- **THEN** o alvo resolvido é 620

#### Scenario: Atleta sem macro
- **WHEN** o atleta não tem macro `ATIVO`
- **THEN** o alvo semanal é calculado como hoje, inclusive o step-back
