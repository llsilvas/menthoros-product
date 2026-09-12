# Tasks — fix-cold-start-calibration-plan-generation

**Estado:** proposta para revisão. Nenhuma task de implementação concluída. Criar estes artefatos não equivale a aprovar o design, resolver o incidente ou autorizar deploy.

## 0. Evidência e proposta

- [x] 0.1 Registrar diagnóstico, timeline de produção sanitizada, reprodução sintética e limitações em `investigation.md` e `evidence/`. **Validação:** rastreabilidade dos tempos/achados; distinguir produção de logs locais e fixture de payload real.
- [x] 0.2 Criar proposal, design e spec delta com critérios CA1–CA12 e conflitos de integração explícitos. **Validação:** leitura cruzada entre escopo, decisões e requisitos.
- [x] 0.3 Executar `openspec validate fix-cold-start-calibration-plan-generation --strict --no-interactive`, verificar links locais e diff. **Validação:** resultado anexado à investigação; nenhuma alteração no backend ou nas changes relacionadas.

## 1. Revisão antes de implementar

- [ ] 1.1 Confirmar commit do deploy e estado persistido do caso: CALIBRATION/estágio, baseline, quantidade total de treinos/métricas, plano final, status de revisão e eventual exportação. Consultas somente leitura, restritas ao tenant; anexar resumo sanitizado. **Validação:** diferenciar fatos confirmados de dados ainda indisponíveis; sem afirmar bypass com base em HTTP 200.
- [x] 1.2 Resolver sobreposição com `planner-engine-enforcement`. **RESOLVIDO (2026-09-08, design §8 "Decisões de precedência e sequência"):** (a) invariante obrigatória do cold-start **falha fechado (422)** mesmo sob fail-open geral; (b) **enforcement primeiro** — dono do gate/flag/orçamento —, esta change assenta sobre ele; (c) **orçamento único** do enforcement, tentativa debitada antes da chamada. Seções 2+ ficam **bloqueadas** até o enforcement estar em `develop` (só o baseline vazio, seção 2, é independente). Falta ainda a fronteira obrigatória × soft, que sai da matriz 1.3.
- [~] 1.3 Aprovar matriz por tipo de treino. **RASCUNHO PRONTO (2026-09-08, design §13)** — ancorado no validador real (`IaServiceImpl`, `PaceValidator`, `PlanQualityChecker`): fontes de verdade (duração/distância = soma das etapas; pace = min/km), estrutura por tipo (bloqueante hoje), e a proposta de quais WARNINGS sobem para obrigatória (triângulo pace×dist×duração, soma-etapas×distância). Confirmado o bug 6/8 (gate real `<6`, textos divergem). **Falta a decisão de produto** nos 4 pontos ⚠️ do §13.4 (tolerância do triângulo por tipo; padronizar 6 vs 8; PROVA/SUBIDA sem estrutura; conjunto final de obrigatórias). **Validação:** exemplos válidos/inválidos nos limites, após produto fechar os ⚠️.
- [ ] 1.4 Fechar escopo de ativação e integração com políticas de fase/estágio; revisar o impacto 200→422 e experiência do coach. Realizar pré-mortem da trilha Full e registrar os achados. **Validação:** decisões revisáveis registradas, sem regra fisiológica nova implícita e sem flip operacional.
- [ ] 1.5 Definir baseline e meta de latência/retry/edição por inconsistência, incluindo janela e amostra por coorte. **Validação:** tabela com p50/p95, sucesso/422, retry e denominadores; amostra insuficiente explicitada, nunca extrapolada do único trace.
- [ ] 1.6 Registrar revisão da proposta e liberar as tasks dependentes; escolher branch/worktree conforme regras do workspace antes de código. **Validação:** decisões 1.2–1.4 resolvidas para integrar enforcement; não marcar aprovação por validação sintática da OpenSpec.

## 2. Baseline vazio e re-baseline (CA1, CA2, CA11, CA12)

- [ ] 2.1 Adicionar regressão de zero treinos/zero métricas: ESTIMATED, zero chamadas ao rebuild, sem série diária fictícia. **Validação:** teste falha pelo motivo esperado antes da correção.
- [ ] 2.2 Implementar caminho vazio, preservando metadados e invalidação de cache necessários. **Validação:** teste 2.1 verde; execução repetida coerente; `./mvnw clean test`.
- [ ] 2.3 Cobrir primeiro plano com atividade recente, semanasObservadas=0 com histórico não vazio, métricas antigas sem treinos, histórico removido e caso extenso. **Validação:** ausência de falso cold-start; resultados CTL/ATL preservados fora do ramo alterado; `./mvnw clean test`.
- [ ] 2.4 Aplicar a mesma regra à avaliação semanal e evitar recomputação redundante do mesmo baseline no ciclo. Preservar entrada/saída e estágios de calibração. **Validação:** cenários OBSERVATION/CALIBRATION/STABILIZATION e transições com dados reais; `./mvnw clean test`.

## 3. Contexto e restrições antes da IA (CA3, CA8, CA9, CA11)

- [ ] 3.1 Cobrir ordem observável: contexto e política resolvidos antes do prompt; ausência de transação/lock durante chamada externa; mesma referência temporal até o save. **Validação:** testes unitários e de integração falham no ponto esperado.
- [ ] 3.2 Integrar snapshot aos colaboradores existentes, respeitando fronteiras JPA/domínio e as decisões 1.2–1.4. **Validação:** 3.1 verde; prompt inclui restrições efetivas; `./mvnw clean test`.
- [ ] 3.3 Eliminar reconstrução tardia conflitante no persister; documentar quais escritas de onboarding podem sobreviver a falha da IA. Preservar efeitos da avaliação semanal. **Validação:** nenhum plano, consumo de revisão ou evento de aprovação na falha; `./mvnw clean verify` para fronteiras transacionais.

## 4. Estrutura, totais e resiliência (CA4, CA5, CA6, CA7)

- [ ] 4.1 Converter a reprodução sintética em regressões mantidas no backend, respeitando a matriz 1.3. Incluir contínuo/longo incoerentes e intervalado válido com pace do tiro diferente da média. **Validação:** falhas corretas antes da implementação; não transplantar a AssertionError exploratória como regra fisiológica.
- [ ] 4.2 Reconciliar e validar etapas/totais após normalizações, com idempotência, limites/unidades e sem duplicação de repetições. **Validação:** fixtures válidas passam; violações obrigatórias falham; recomendações isoladas não bloqueiam; `./mvnw clean test`.
- [ ] 4.3 Inserir checks prévios no retry existente; garantir máximo de duas gerações lógicas, feedback sanitizado e orçamento existente sem novo fallback gerador. **Validação:** primeira válida=1 tentativa; inválida seguida de válida=2; inválida final=422; orçamento esgotado não inicia segunda; `./mvnw clean test`.
- [ ] 4.4 Inserir check sobre a representação final após redistribuição/inclusão de prova e demais ajustes, antes de salvar. **Validação:** transformação que quebra invariantes causa falha terminal sem retry/plano parcial; `./mvnw clean verify`.
- [ ] 4.5 Alinhar mensagens, prompt, schema e regras de etapas da coorte com a matriz aprovada. **Validação:** os limites comunicados não contradizem o validator; contagem de chamadas não cresce; `./mvnw clean test`.

## 5. Contratos, segurança e concorrência (CA7, CA8, CA9)

- [ ] 5.1 Cobrir o endpoint: sucesso com DTO vigente e falha obrigatória com 422/envelope vigente; falha de infraestrutura mantém seu contrato. **Validação:** testes de controller e `./mvnw clean test`.
- [ ] 5.2 Cobrir plano de baixa confiança aguardando revisão, invisibilidade em consultas de aprovados e ausência de autoaprovação/exportação. **Validação:** testes com JWT/tenant reais de teste e `./mvnw clean verify`.
- [ ] 5.3 Cobrir acesso cruzado de tenant, duas gerações concorrentes e alteração relevante do contexto durante a IA. **Validação:** nenhum vazamento/duplicata ativa e nenhum plano salvo com snapshot invalidado; `./mvnw clean verify`.
- [ ] 5.4 Conferir consumidores do fluxo compartilhado, inclusive lote se atingir a mesma integração. **Validação:** erro individual sanitizado não aborta demais atletas e não cria retry adicional; `./mvnw clean verify`.

## 6. Observabilidade e medição (CA10)

- [ ] 6.1 Instrumentar etapas/tentativas/coorte e motivo categorizado; tornar logs de rebuild condicionais a intervalo real. **Validação:** sucesso, retry, falha e zero dias distinguíveis; sem prompt ou dados sensíveis em logs/labels; `./mvnw clean test`.
- [ ] 6.2 Medir em ambiente de teste conforme 1.5 e registrar comparação com versão, amostra e taxas de sucesso/422. **Validação:** zero rebuild no vazio, máximo de duas gerações lógicas e ganho de latência atribuído à etapa correta; não declarar p95 sem amostra adequada.

## 7. Gates e entrega futura

- [ ] 7.1 Executar `./mvnw clean test` e anexar comando, commit, totais e resultado. **Validação:** zero falhas/erros.
- [ ] 7.2 Executar `./mvnw clean verify`, incluindo `*IT`, e anexar evidência. **Validação:** zero falhas/erros; `clean test` sozinho não substitui este gate.
- [ ] 7.3 Executar QA Full (revisões de código, segurança e testes), revisão de contrato e conferir CA1–CA12. **Validação:** findings classificados/resolvidos; decisão GO/NO-GO com evidências exigidas pelo AGENTS.md.
- [ ] 7.4 Registrar plano de ativação/reversão e compatibilidade com gates da change de enforcement. **Validação:** nenhum rollout automático nesta tarefa documental; eventuais planos antigos tratados em escopo separado.
- [ ] 7.5 Atualizar tasks e OpenSpec com implementação real, diff e impacto de contrato; executar novamente validação strict. **Validação:** documentação reflete entrega, sem marcar decisões pendentes como concluídas.

## 8. Modelo de carga cold-start e RECOVERY (design §14, ADR-0012 — grilling 2026-09-12)

> Depende do enforcement calibrado (PR do `fix/planner-enforcement-calibration`) para validar
> ponta-a-ponta. Tudo atrás de `planner-engine.enabled`. Ordem TDD; validar `./mvnw clean test`.

- [ ] 8.1 Threadar `CalibrationStage` + CTL de calibração (baseline blendado, capado ≤ 40) ao
      `OnboardingContext`/`PlannerInputSnapshot`, resolvidos antes do prompt (§4/§14.4). **verify:**
      teste do snapshot com/sem calibração; sem calibração o campo é ausente/graduado.
- [ ] 8.2 `LoadTargetResolver` — regime cold-start (§14.1): `targetTss = min(ctlBaseline,40) × 7 ×
      rampa(stage) × (RECOVERY|POST_RACE ? 0,5 : 1)`; banda ±25% no cold-start; piso 120 só em fase
      progressiva; saída = graduado → PMC/±10%. Ajustar o `ctlFallback` (commit `463b0c8`) para o CTL
      de calibração capado. **verify:** OBSERVATION 0,6 / CALIBRATION 0,75 / STABILIZATION 0,9;
      cap ≤40 (AVANÇADO 55→40); piso 120 progressiva e ausente em contenção; banda ±25%; graduado
      ignora rampa/cap.
- [ ] 8.3 `LoadTargetResolver` — redução ×0,5 de RECOVERY/POST_RACE (§14.2), multiplicativa com a
      rampa, distinta do `TaperStrategy`, sem piso. **verify:** RECOVERY reduz a ~0,5×baseline;
      lesionado cold-start = rampa×0,5; taper por prova inalterado.
- [ ] 8.4 Estender a alocação de dias ao `PROXIMA_SEMANA` (§14.3), **gated por `enabled=true`**:
      `obterTreinosParaPlano` roda a redistribuição em ambos os modos com o `diasAlvoPorTipo` do
      skeleton; `enabled=false` mantém dias do LLM (CA9). **verify:** teste PROXIMA_SEMANA com
      enabled=true aplica ordem (longão ancorado, duras não-adjacentes); enabled=false byte-a-byte.
- [ ] 8.5 Validar no piloto (Hugo/Maria zerados) que cold-start com plano coerente vira `PASSED` e a
      ordem faz sentido; divergência residual = `FAILED`+revisão (soft), nunca 422. **verify:** veredito
      no banco (compliance_status, faixa real) + inspeção da ordem dos treinos.
