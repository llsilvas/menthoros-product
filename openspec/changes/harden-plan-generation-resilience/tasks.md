> Independente do seam `Constraint` e do strangler — trata validade estrutural de etapas. Pré-requisito de contexto: `debito-tecnico-camada-ia` (temperatura 0.2, já mergeada). Coordenar janela do `IaServiceImpl` com `introduce-plan-constraints` e `refactor-iaservice-decomposition`. Validar contra o golden-master de `add-plan-generation-eval-harness`.

## 1. Inventário e dedup

- [ ] 1.1 (teste) Caracterizar o comportamento atual: treino estruturalmente inválido derruba o plano inteiro com `LLMException` (fixture offline, sem LLM)
- [ ] 1.2 Unificar os 4 validadores idênticos (`REGENERATIVO`/`LONGO`/`CONTINUO`/`TEMPO_RUN`) em `validarEstrutura3Etapas(tipo)` + ponto único de reparo
- [ ] 1.3 Classificar cada hard-fail como reparável vs. requer-retry (decisão registrada no design)

## 2. Reparo determinístico

- [ ] 2.1 (TDD) Aquecimento/desaquecimento faltante → sintetizar etapa formulaica; "2 etapas (falta desaq)" → 3 válidas
- [ ] 2.2 (TDD) Ordem trocada com os 3 tipos presentes → reordenar para o canônico
- [ ] 2.3 (TDD) `repeticoes != 1` → expandir (reusar `expandirEtapasAgregadas`)
- [ ] 2.4 Logar e contar cada reparo (telemetria); nunca silencioso
- [ ] 2.5 `./mvnw clean test`

## 3. Retry único com feedback

- [ ] 3.1 (TDD) Quando o reparo não se aplica (falta PRINCIPAL, intervalado), re-chamar o LLM 1x com o motivo da rejeição; cobrir "falha → retry → sucesso" e "falha → retry falha → erro de domínio"
- [ ] 3.2 Extrair a orquestração reparo+retry para um colaborador dedicado (não inflar `IaServiceImpl`)
- [ ] 3.3 Teto = 1 retry (latência ~80s/tentativa); sem backoff longo
- [ ] 3.4 `./mvnw clean test`

## 4. Telemetria

- [ ] 4.1 Contadores Micrometer: violações por tipo, reparos aplicados, retries, falhas finais
- [ ] 4.2 Expor no registry Prometheus existente; nomes/labels consistentes com o padrão do projeto

## 5. Validação Final

- [ ] 5.1 `./mvnw clean test` verde (suíte completa)
- [ ] 5.2 Golden-master sem regressão não-intencional
- [ ] 5.3 (MANUAL) Reproduzir o cenário `REGENERATIVO` inválido e confirmar recuperação (reparo ou retry) em vez de 503
- [ ] 5.4 Confirmar nenhuma mudança nas regras de validação (só no comportamento de recuperação)
- [ ] 5.5 Atualizar este `tasks.md`
