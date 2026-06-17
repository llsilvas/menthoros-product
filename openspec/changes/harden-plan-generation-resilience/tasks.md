> **Rascunho** (criado 2026-06-17 a partir de falha real em produção: REGENERATIVO com 2 etapas → 503). Pré-requisito de contexto: `debito-tecnico-camada-ia` (já corrigiu a temperatura). Coordenar janela de edição do `IaServiceImpl` com `migrate-plan-prompt-to-skills` e `refactor-iaservice-decomposition`. Validar cada incremento contra o golden-master de `add-plan-generation-eval-harness`.

## 1. Inventário e caracterização

- [ ] 1.1 Mapear todas as validações que lançam `LLMException` em `validarENormalizarPlanoGerado` e classificar cada uma como **reparável (determinístico)** ou **requer retry**
- [ ] 1.2 (teste) Caracterizar o comportamento atual: um treino estruturalmente inválido derruba o plano inteiro com `LLMException` (fixture offline, sem LLM)
- [ ] 1.3 Definir o teto de retries e a política de backoff (decisão registrada no design)

## 2. Reparo determinístico (D2)

- [ ] 2.1 (TDD) Reparo de `REGENERATIVO` com etapas faltantes (ex.: sintetizar desaquecimento padrão) — teste com plano "2 etapas" → resultado com 3 etapas válidas
- [ ] 2.2 (TDD) Avaliar/implementar reparo de `validarRepeticoes` (normalizar para 1 quando a semântica permitir)
- [ ] 2.3 Logar e contar cada reparo aplicado (telemetria — ver seção 4); reparo nunca silencioso
- [ ] 2.4 `./mvnw clean test`

## 3. Retry com feedback (D1)

- [ ] 3.1 (TDD) Loop de geração com teto: ao falhar a validação, re-chamar o LLM injetando o motivo da rejeição anterior no prompt; cobrir caminho "falha → retry → sucesso" e "falha → retries esgotados → erro de domínio"
- [ ] 3.2 Extrair a orquestração de retry+reparo para um colaborador dedicado (não inflar `IaServiceImpl`) — coordenar com `refactor-iaservice-decomposition`
- [ ] 3.3 Backoff entre tentativas; nunca exceder o teto definido em 1.3
- [ ] 3.4 `./mvnw clean test`

## 4. Telemetria

- [ ] 4.1 Contadores Micrometer: violações por tipo de treino, reparos aplicados, retries, falhas finais
- [ ] 4.2 Expor no registry Prometheus existente; verificar nomes/labels consistentes com o padrão do projeto

## 5. (Opcional) Tightening do schema (D3)

- [ ] 5.1 Avaliar `minItems`/`maxItems` genérico na lista de etapas em `defaultJsonSchemaOptions()` como rede de baixo custo (sem tentar contagem condicional por tipo)

## 6. Validação Final

- [ ] 6.1 `./mvnw clean test` verde (suíte completa)
- [ ] 6.2 Golden-master (`add-plan-generation-eval-harness`) sem regressão não-intencional
- [ ] 6.3 (MANUAL) Reproduzir o cenário REGENERATIVO inválido e confirmar recuperação (reparo ou retry) em vez de 503
- [ ] 6.4 Confirmar nenhuma mudança nas regras de validação (apenas no comportamento de recuperação)
- [ ] 6.5 Atualizar este `tasks.md`
