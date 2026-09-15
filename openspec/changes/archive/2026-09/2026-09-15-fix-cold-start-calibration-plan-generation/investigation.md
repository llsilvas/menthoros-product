# Investigação: cold-start durante calibração

Data: 2026-09-08. Escopo: diagnóstico e proposta para revisão; nenhuma correção implementada.

## Decisão

NO-GO para considerar o incidente corrigido. Existe evidência de geração lenta e de aceitação de inconsistências; não existe implementação corretiva nem execução dos gates sobre uma correção.

## Evidência de produção

Trace `752cabbf-660d-4935-9b9c-68f85ed17c7e`, geração em 2026-09-07. Fonte original: logs consultados em modo somente leitura no backend Railway de produção. A timeline sanitizada está em [evidence/production-timeline.json](evidence/production-timeline.json); logs brutos permanecem apenas no diretório temporário de diagnóstico, fora do Git. Tempos abaixo usam timestamps da aplicação, não timestamps de coleta do Railway.

| Evento | Horário da aplicação |
|---|---|
| Início da requisição | 22:32:11,416 |
| Primeira resposta rejeitada: intervalado com quatro etapas; retry | 22:32:46,338 |
| Segunda resposta: avisos de inconsistência | 22:33:21,795–801 |
| Nenhuma métrica nas últimas seis semanas | 22:33:21,825 |
| Aviso de recálculo histórico completo | 22:33:21,863 |
| Fim: HTTP 200, 70.598 ms | 22:33:22,014 |

A demora observada concentra-se nas duas tentativas de geração, aproximadamente 35 segundos por intervalo. Esses intervalos incluem processamento da aplicação; não são medições isoladas do provedor. Há apenas 151 ms entre o aviso de recálculo e o fim da requisição: o recálculo não explica os 70,6 segundos deste caso.

A segunda resposta registra: contínuo de 5 km/45 min com pace 6:30–7:00/km (aviso de 33%); longo de 6 km/60 min com o mesmo pace (48%); intervalado de 4 km/36 min com pace 5:00–5:30/km (71%) e soma de etapas de 4,86 km. O HTTP 200 demonstra sucesso da requisição; não demonstra aprovação pelo coach, exposição ao atleta nem exportação ao dispositivo.

O usuário informa que o público afetado é novo, sem histórico e em calibração. O log de ausência de métricas é compatível, mas sozinho não prova ausência de qualquer registro histórico nem o estado CALIBRATION persistido. Os 398 dias encontrados anteriormente pertenciam a um caso LOCAL distinto e não devem ser atribuídos a este incidente.

## Achados no código local

1. **[MAJOR] `services/helper/PlanGenerationPersister.java:146`** — o contexto de onboarding é resolvido quando o DTO da IA já existe. `IaServiceImpl.java:327` monta o prompt sem esse contexto explícito; `PlannerShadowService.java:126` mantém o planner em shadow, sem substituir o plano. A política de calibração não governa explicitamente essa geração. **Ação:** resolver o contexto antes da IA e aplicar as restrições de calibração ao resultado efetivo, preservando a revisão obrigatória.
2. **[MAJOR] `services/impl/IaServiceImpl.java:1487` e `:357`** — a consistência entre ritmo, distância e duração e as violações de qualidade terminam em avisos. Uma primeira falha estrutural pode custar outra chamada inteira, seguida de aceitação de um resultado ainda inconsistente. **Ação:** definir invariantes por tipo de treino, validar os dados finais após normalizações e impedir persistência de violações obrigatórias. Não converter indiscriminadamente recomendações em erros nem criar uma cascata de retries.
3. **[MINOR, neste incidente] `services/onboarding/impl/BaselineCalculatorImpl.java:62`** — chama reconstrução completa antes de calcular as semanas observadas. Com zero semanas, a proporção heurística é 1 e o baseline final é inteiramente estimado. `TsbServiceImpl.java:442` emite o aviso de operação custosa antes de descobrir que não há intervalo a reconstruir. **Ação:** caminho explícito para ausência de treinos e métricas, sem rebuild; manter inicialização/consistência de metadados e cache necessárias. Tornar o log fiel ao trabalho executado. O impacto pode ser maior para atletas com histórico, mas não é a causa dominante deste trace.

## OpenSpec

A change arquivada `2026-07-22-athlete-onboarding-baseline` exige, em CA2, baseline ESTIMATED, fase CALIBRATION e revisão do coach para ausência de histórico; CA4 mantém o plano aguardando revisão e invisível ao atleta até aprovação. O design dessa change previa reconstrução completa para obter CTL/ATL: remover esse acoplamento exige documentar a nova decisão, não tratar o comportamento como simples descumprimento da implementação.

Não foi comprovado bypass da revisão nem violação de visibilidade. O shadow também é intencional no desenho atual; a integração da calibração à geração deve ser alinhada com a change `planner-engine-enforcement`, evitando implementar duas estratégias concorrentes.

## Proposta de change para revisão

Change criada: `fix-cold-start-calibration-plan-generation`. Ver [proposal.md](proposal.md), [design.md](design.md), [tasks.md](tasks.md) e [spec delta](specs/cold-start-plan-generation/spec.md). Estado: proposta para revisão, sem implementação.

- Resolver baseline, confiança, estágio e restrições de calibração antes da montagem do plano/prompt.
- Para atleta realmente sem treinos e sem métricas, produzir baseline estimado sem reconstrução histórica. Distinguir esse estado de métricas antigas ou histórico removido.
- Usar estrutura e limites determinísticos compatíveis com a política vigente de calibração; delimitar o papel da IA e o comportamento quando ela não atende ao contrato.
- Definir a fonte de verdade de distância/duração/pace e reconciliar totais com etapas. Em intervalados, distinguir o pace do esforço do pace médio da sessão; o alerta atual de 71% não basta, sozinho, para definir a nova regra bloqueante.
- Preservar revisão obrigatória do coach e isolamento de tenant. Contratos de rejeição/fallback precisam ficar explícitos na spec antes da implementação.
- Medir duração por etapa, número de tentativas, motivo de rejeição e quantidade real de dias recalculados, sem registrar dados sensíveis do prompt.
- Para atletas com histórico: reaproveitar métricas válidas e avaliar atualização incremental desde o primeiro dado alterado; reservar rebuild completo para reconstrução necessária. Não truncar arbitrariamente em 42/90/398 dias, porque isso pode alterar métricas acumuladas sem um estado inicial válido.

### Aceitação proposta

- Primeiro plano, sem treinos/métricas, em calibração: baseline ESTIMATED e zero chamadas ao rebuild completo.
- Restrições de calibração presentes antes da chamada à IA e verificadas no plano final.
- Fixture com quatro etapas: comportamento de recuperação delimitado; resultado final inconsistente não persiste como válido.
- Totais coerentes com as etapas e semântica de pace por modalidade de treino.
- Plano de baixa confiança permanece aguardando revisão e não aparece no endpoint de planos aprovados.
- Histórico existente, dado retroativo e histórico removido têm comportamentos explícitos e não perdem correção das métricas.
- Evidência de latência separa custo da IA, retry, baseline e persistência; não promete eliminar os 70 segundos apenas removendo o rebuild.
- Gates da implementação: `./mvnw clean test` e `./mvnw clean verify`, com resultados anexados à change.

## Evidência de teste e limites

[ColdStartProbe.java](evidence/ColdStartProbe.java) executou componentes reais de baseline, normalização e resiliência com repositórios simulados e duas respostas sintéticas. O baseline vazio chamou rebuild uma vez. A primeira resposta falhou por quatro etapas; a segunda, com seis, foi aceita e produziu o aviso de 71,4%. O probe encerrou com AssertionError intencional (RED) ao detectar a aceitação. Saída em [probe.log](evidence/probe.log).

Isso reproduz o mecanismo com fixture reconstruída, não o JSON original da produção. Usa classes locais já compiladas; não é teste end-to-end nem comprova equivalência do commit local com o deploy. A soma de etapas da fixture é diferente da produção. Nenhuma chamada real à IA foi feita pelo probe.

Nenhum arquivo de aplicação foi alterado nesta investigação. A suíte completa não foi executada nesta etapa; resultados de revisões anteriores não aprovam uma correção futura. Permanecem a confirmar: estado persistido exato do atleta, payload final salvo/exportado e correspondência do commit do deploy ao código revisado.


## Rastreabilidade e revisão documental

- Código local inspecionado: backend HEAD `a4e8ad4a4eb4677f1b5520f07266a02c93cdd9ec`. A equivalência com o commit implantado não foi confirmada. As linhas do relatório são fotografias dessa revisão; revalidar símbolos na implementação.
- Paths dos achados são relativos a `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/`.
- Classes adicionais relevantes: `CalibrationServiceImpl.avaliarSemana` também chama o baseline; `PlanoResilienceService` limita gerações a duas e checa orçamento de 100 s antes de iniciar a segunda, sem cancelar chamada em voo; `GlobalExceptionHandler.handleDomainRuleViolation` usa HTTP 422 com `status`, `error`, `message`.
- O log diz mínimo 8 etapas, enquanto a exceção da primeira rejeição informa mínimo 6. Alinhar a regra e sua comunicação na matriz de invariantes; nenhum desses números vira prescrição universal nesta proposta.
- A proposta não conclui inadequação clínica de intervalados em calibração. Tipos/intensidades precisam seguir a política aprovada; o pace do tiro pode diferir legitimamente da média global.
- Decisões pendentes e critérios novos estão registrados como propostos, sem tratar o shadow e o rebuild previstos no design anterior como descumprimento automático da spec.

### Evidência de criação da OpenSpec

Em 2026-09-08, `openspec validate fix-cold-start-calibration-plan-generation --strict --no-interactive` passou tanto no staging quanto no repositório product. Os 11 arquivos foram conferidos contra o staging, os links locais resolvem e não há whitespace residual. Tasks 0.1–0.3 concluídas; revisão de decisões, implementação e gates Maven permanecem pendentes. Isso valida os artefatos documentais, não aprova a correção de backend.
