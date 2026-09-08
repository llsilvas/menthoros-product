**Tamanho:** L · **Trilha:** Full

# Cold-start: geração de plano durante calibração

**Change-id:** `fix-cold-start-calibration-plan-generation`
**Estado:** proposta para revisão — implementação não iniciada.
**Data:** 2026-09-08.

## Why

O treinador relata demora e treinos quebrados para atletas novos, sem plano anterior e sem histórico, em processo de calibração. Na requisição de produção analisada, a geração levou **70.598 ms**: a primeira resposta da IA foi rejeitada por um intervalado de quatro etapas; a segunda terminou com HTTP 200 apesar de avisos de inconsistência entre duração, distância, ritmo e soma das etapas.

O aviso de reconstrução histórica apareceu **151 ms antes do fim**. Portanto, eliminar essa reconstrução não resolve, por si só, a demora observada. Os **398 dias** encontrados anteriormente pertencem a outro atleta em logs locais; não são evidência de processamento de 398 dias para o novo atleta em produção.

O código local mostra três problemas relacionados:

1. O contexto de onboarding/calibração é resolvido na persistência, depois de a IA produzir o plano. O planner em shadow observa a saída, sem governar explicitamente essa geração.
2. Parte das validações apenas registra avisos; a segunda tentativa pode continuar inconsistente e ser aceita.
3. O baseline chama reconstrução completa mesmo quando não há histórico, embora o resultado seja 100% heurístico nesse caso.

Evidências, limitações e reprodução estão em [investigation.md](investigation.md) e [evidence/reproduction.md](evidence/reproduction.md). O diagnóstico identifica mecanismos reproduzíveis; não afirma que o payload final salvo ou exportado já foi inspecionado.

## What Changes

- Resolver um snapshot de baseline, confiança, fase/estágio, política e restrições **antes** do prompt; reutilizar a mesma decisão na validação e persistência.
- Criar o caminho de baseline estimado sem rebuild para ausência real de treinos e métricas. Primeiro plano, primeira semana de histórico e ausência de métricas recentes não equivalem a ausência total de histórico.
- Aplicar as restrições determinísticas vigentes da calibração à geração efetiva, com regras compartilhadas com o planner existente. Não criar um segundo motor.
- Definir invariantes de etapas, totais, unidades e semântica de pace; validar o resultado após reparos e depois das transformações finais de persistência.
- Reutilizar a resiliência existente com **no máximo duas gerações lógicas por requisição**. Falha obrigatória residual produz erro de domínio, sem plano parcial nem fallback que inicie novas gerações.
- Preservar a revisão obrigatória do coach e a invisibilidade ao atleta antes da aprovação.
- Separar, na observabilidade, carregamento, baseline, chamadas à IA, retry, validação e persistência; registrar o intervalo realmente recalculado, quando existir.

As decisões são propostas para revisão. Em particular, a precedência sobre o fail-open de `planner-engine-enforcement`, as tolerâncias por tipo de treino e o mecanismo de ativação precisam ser fechados nas tarefas 1.2–1.4 antes da implementação dependente.

## Capabilities

### New Capabilities

- `cold-start-plan-generation`: contrato integrado da geração para atletas em calibração, incluindo baseline vazio, restrições antecipadas, coerência final, resiliência limitada e revisão obrigatória. Delta em [specs/cold-start-plan-generation/spec.md](specs/cold-start-plan-generation/spec.md).

### Modified Capabilities

Nenhuma spec canônica existente é reescrita nesta criação. Os requisitos de onboarding estão no arquivo da change arquivada referenciado no design. O delta novo complementa esse contrato; a revisão deve resolver explicitamente a sobreposição com o enforcement ainda proposto antes de consolidar specs canônicas.

## Critérios de aceite

| ID | Cenário verificável |
|---|---|
| CA1 | Dado atleta em calibração sem treinos nem métricas, quando calcula o baseline, então mantém ESTIMATED, executa zero rebuilds e não inventa métricas MEASURED. |
| CA2 | Dado primeiro plano com atividade recente, métricas antigas ou histórico removido, quando classifica o histórico, então não usa o atalho de ausência total indevidamente. |
| CA3 | Dada geração em calibração, quando chama a IA, então o snapshot de calibração e suas restrições já estão resolvidos; prompt, checks e persistência usam a mesma decisão/data. |
| CA4 | Dado plano com violação obrigatória residual, quando termina a normalização ou transformação final, então a violação impede sua persistência como plano válido. |
| CA5 | Dada divergência entre etapas e totais, quando reconcilia o plano, então respeita a fonte de verdade e tolerâncias documentadas por tipo, sem confundir pace do tiro com pace médio da sessão. |
| CA6 | Dada primeira resposta inválida, quando a resiliência atua, então há no máximo um retry dentro do orçamento existente; falha final gera 422 e nenhum novo ciclo legado. |
| CA7 | Dada transformação final que introduz violação, quando o check final falha, então não há retry, plano parcial, evento de aprovação nem exportação. |
| CA8 | Dado atleta de baixa confiança em calibração, quando gera um plano válido, então ele permanece AGUARDANDO_REVISAO e não aparece em consultas apenas de aprovados. |
| CA9 | Dado outro tenant ou duas gerações concorrentes, quando executa o fluxo, então preserva isolamento e a prevenção existente de plano ativo duplicado. |
| CA10 | Dada requisição com sucesso, retry ou falha, quando registra métricas, então diferencia tentativas e etapas, sem atribuir custo histórico a um intervalo inexistente. |
| CA11 | Dado atleta em calibração que já acumulou atividades, quando reavalia a semana, então usa o dado real e preserva as regras vigentes de re-baseline e saída da calibração. |
| CA12 | Dado histórico extenso fora do caso vazio, quando gera ou atualiza métricas, então não introduz corte arbitrário de dias nem altera silenciosamente a recorrência CTL/ATL. |

## Métrica de sucesso

Benefício ao treinador: reduzir propostas que exigem correção manual de estrutura/aritmética e o tempo perdido em retries.

- Meta funcional: **zero planos aceitos com violação obrigatória residual** no conjunto de regressão aprovado; **zero rebuilds completos** no cold-start realmente vazio; **no máximo duas gerações lógicas** por requisição.
- Medir por coorte (calibração vazia, calibração com dados, demais): latência p50/p95, taxa de retry, sucesso e 422; comparar antes/depois com quantidade de amostras e versão do backend/modelo/prompt.
- Registrar, em amostra acompanhada pelo coach, número de planos que exigiram edição por inconsistência estrutural/aritmética dividido pelo total revisado. Não confundir toda edição editorial com defeito.
- Um trace de 70,6 s não define p95 nem permite prometer ganho percentual. Tarefa 1.5 fecha a meta operacional após baseline representativo; mínimo proposto de 30 gerações por coorte comparada, sem disparar chamadas pagas apenas para preencher amostra nesta fase.

## Impact

- **Repositórios:** backend na implementação; product nesta fase documental. Não há mudança de frontend ou migração planejada.
- **Classes candidatas:** `PlanGenerationContextLoader`, `PlanGenerationContext`, `OnboardingServiceImpl`, `BaselineCalculatorImpl`, `CalibrationServiceImpl`, `IaServiceImpl`, `PlanoTreinoPromptBuilder`, `PlanoResilienceService`, `PlanGenerationPersister`, `PlannerShadowService` e colaboradores de validação existentes. Tocar apenas o necessário ao contrato.
- **API:** preservar rota, DTOs, autenticação e sucesso; inconsistências obrigatórias antes aceitas com 200 passarão a falha 422 pelo contrato existente de `DomainRuleViolationException`. Essa é uma mudança observável, não um refactor transparente.
- **Banco:** nenhuma nova coluna ou edição de migrations aplicada prevista. Não salvar plano inválido. Escritas válidas de snapshot de onboarding têm ciclo próprio, descrito no design.
- **Coordenação obrigatória:** [planner-engine-enforcement](../planner-engine-enforcement/proposal.md) já propõe skeleton antes da IA, dois estágios de compliance, fallback legado e persistência FAILED. Reconciliar proprietário do código, precedência e orçamento; não duplicar infraestrutura.
- **Coordenação estrutural:** [refactor-iaservice-decomposition](../refactor-iaservice-decomposition/proposal.md) preserva comportamento e possui achados de revisão próprios. Esta correção comportamental deve permanecer rastreada aqui; extração integral da IaService não é requisito automático para resolver o incidente.
- **Origem:** [athlete-onboarding-baseline](../archive/2026-07/2026-07-22-athlete-onboarding-baseline/design.md), especialmente decisão 11; o rebuild era previsto no design original.

## Fora de escopo

- Refatoração geral da pasta services, bugs de paginação Strava, mudança de modelo/provedor ou timeout global.
- Truncar histórico em 42/90/398 dias ou reimplementar todo o processamento incremental.
- Gerador determinístico universal de etapas para todas as modalidades; mudança de fórmulas fisiológicas, limiares ou política de saída da calibração sem decisão de produto.
- Reparar planos antigos, aprovar planos, exportar treinos, mudar flags, fazer deploy, commit ou push nesta fase.

## Open Questions & Assumptions

1. **Identificação do incidente:** o relato define a coorte; confirmar commit do deploy, estado persistido CALIBRATION e ausência total de registros do atleta da requisição. O log só confirma ausência de métricas nas últimas seis semanas.
2. **Semântica e tolerâncias:** inventariar o que `ritmoAlvo` significa por tipo e quais quantidades governam cada etapa. O aviso de 71% em intervalado não é, sozinho, uma regra de rejeição correta. Resolver antes do CA5.
3. **Enforcement:** recomendação é falhar fechado para invariantes obrigatórias do cold-start, mesmo sob fail-open geral. É uma proposta de precedência que conflita com a change relacionada; resolver antes de implementar a integração.
4. **Ativação:** recomendar integração única, com rollout restrito à coorte e testes da matriz de flags. Não escolher nem ligar uma flag de produção implicitamente.
5. **Histórico não vazio:** o atalho é restrito a ausência comprovada de treinos e métricas. Otimização incremental ampla será desdobrada se exigir schema, job ou nova infraestrutura.
6. **Aprovação:** HTTP 200 não prova que o atleta viu o treino; não foi demonstrado bypass da revisão.
7. **Limites da revisão:** nenhuma execução nova dos gates Maven comprova uma correção nesta fase, pois nenhuma foi implementada.
