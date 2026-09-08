# Evidências e reprodução

## Arquivos

- `production-timeline.json`: resumo sanitizado de eventos reais do trace, com horários da aplicação, duração total, avisos e limites de interpretação. Não contém IDs de atleta/tenant nem payload integral.
- `ColdStartProbe.java`: experimento diagnóstico sintético, fora da suíte do backend, executando baseline, normalização e resiliência reais com colaboradores de dados simulados.
- `probe.log`: saída da execução local em 2026-09-08; contém apenas UUIDs sintéticos.
- `run-probe.py`: reaplica o probe usando o classpath registrado em relatórios Surefire locais. Não faz chamada real à IA, não conecta ao banco e não compila o backend automaticamente.

## O que foi observado

1. Histórico vazio produziu baseline ESTIMATED, mas chamou `recalcularHistoricoCompleto` uma vez.
2. A fixture com quatro etapas foi rejeitada pelo validator e provocou uma nova geração simulada.
3. A segunda fixture, com seis etapas, foi aceita apesar do aviso de divergência de 71,4% calculado pelo logger atual.
4. O probe encerrou com código 1 e AssertionError intencional ao detectar essa aceitação. É evidência RED do comportamento explorado, não teste passando nem evidência de correção.

## Como reaplicar

Pré-requisitos: Java e Python locais; backend compilado e relatórios Surefire da versão sob análise. Para produzir classes/relatórios atualizados, executar `./mvnw clean test` no backend, dentro do fluxo autorizado de implementação/revisão. `./mvnw clean verify` continua obrigatório para o gate final de integração, mas não é requisito para entender este registro histórico.

Executar, a partir da raiz do workspace:

```bash
python3 menthoros-product/openspec/changes/fix-cold-start-calibration-plan-generation/evidence/run-probe.py apps/menthoros-backend
```

O runner repassa o exit code do Java. Antes da correção, o resultado esperado do experimento é 1 com a AssertionError registrada em `probe.log`. Depois de mudanças nas assinaturas/classes, o probe pode precisar ser adaptado; ele preserva o experimento histórico, não substitui os testes de regressão da implementação.

## Limitações

- A fixture não é o JSON original da IA de produção. Sua soma de etapas é diferente (o log real registra 4,86 km); ela reproduz o mecanismo de aceitação/retry.
- O cálculo exploratório de 71,4% usa o pace médio extraído do campo global conforme o comportamento atual. Uma futura regra de intervalados deve distinguir pace do esforço e da sessão; não copiar a AssertionError como critério clínico ou tolerância universal.
- A execução original reutilizou classes já compiladas; não houve rebuild completo do backend nesta investigação. Classe compilada, fonte local e deploy precisam ter versões conferidas na validação futura.
- O experimento não cobre controller, autenticação real, banco, persistência final, aprovação ou dispositivo. A consulta de produção foi somente leitura.
- Logs brutos e o classpath específico da máquina não entram no Git. A timeline sanitizada preserva a evidência relevante sem depender da permanência de `/tmp`.
