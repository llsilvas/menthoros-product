## 1. Incremental Daily Sync

- [x] 1.1 Definir job/trigger diário de sincronização incremental por atleta conectado
- [ ] 1.2 Garantir deduplicação por `externalId + atletaId`
- [ ] 1.3 Garantir isolamento multi-tenant em todo o fluxo
- [x] 1.4 Implementar estratégia híbrida MVP: scheduler diário + endpoint manual on-demand por atleta

## 2. Matching Planned vs Completed

- [ ] 2.1 Implementar busca de candidatos `TreinoPlanejado` por janela de data (D-1 a D+1)
- [ ] 2.2 Implementar cálculo de score de correspondência (data, tipo, duração, distância)
- [ ] 2.3 Implementar limiares v1: `>=0.80` automático, `0.50-0.79` ambíguo, `<0.50` não planejado
- [ ] 2.4 Implementar regra de empate: top1-top2 `< 0.10` => `AMBIGUO`
- [ ] 2.5 Implementar decisão de reconciliação: automático, ambíguo, não planejado

## 3. Persistence Model

- [ ] 3.1 Adicionar no `TreinoRealizado` os campos de estado atual de reconciliação
- [ ] 3.2 Criar tabela append-only de eventos de reconciliação (`tb_treino_reconciliacao_evento`)
- [ ] 3.3 Criar migração com índices e constraints mínimas de suporte
- [ ] 3.4 Garantir escrita transacional: atualizar estado atual + inserir evento no mesmo commit

## 4. Linking and Status

- [ ] 4.1 Persistir vínculo entre `TreinoRealizado` e `TreinoPlanejado` quando match automático
- [ ] 4.2 Persistir estado de reconciliação para todos os casos
- [ ] 4.3 Persistir metadados de decisão (score, razão, timestamp)

## 5. Manual Review Support

- [ ] 5.1 Expor casos `AMBIGUO` e `NAO_PLANEJADO` para revisão do treinador
- [ ] 5.2 Implementar ação `VINCULAR_MANUALMENTE`
- [ ] 5.3 Implementar ação `MARCAR_NAO_PLANEJADO`
- [ ] 5.4 Implementar ação `DESFAZER_VINCULO`
- [ ] 5.5 Implementar validações de domínio (mesmo tenant, mesmo atleta, consistência de vínculo)
- [ ] 5.6 Garantir idempotência das ações manuais

## 6. Audit Trail

- [ ] 6.1 Registrar `actorId`, `actionType`, `beforeState`, `afterState`
- [ ] 6.2 Registrar `beforePlannedId`, `afterPlannedId`, `reasonCode`, `reasonText`, `occurredAt`
- [ ] 6.3 Garantir consulta/auditoria por atividade para suporte operacional

## 7. Tests

- [ ] 7.1 Testes de unidade para score e regra de decisão
- [ ] 7.2 Testes de unidade para limiares e regra de empate
- [ ] 7.3 Testes de integração para fluxo completo de reconciliação
- [ ] 7.4 Testes de idempotência (reprocessamento sem duplicidade)
- [ ] 7.5 Testes de multi-tenant e timezone boundary
- [ ] 7.6 Testes das ações manuais e trilha de auditoria
- [ ] 7.7 Teste de integridade transacional (estado atual + evento)

## 8. Acceptance Criteria

- [ ] 8.1 Atividade diária importada não gera duplicata por `externalId + atletaId`
- [ ] 8.2 Atividade com match confiável (`score >= 0.80`) fica `VINCULADO_AUTOMATICO`
- [ ] 8.3 Atividade com baixa confiança (`0.50 <= score < 0.80`) fica `AMBIGUO` (não auto-vincula)
- [ ] 8.4 Atividade sem candidato/baixa aderência (`score < 0.50`) fica `NAO_PLANEJADO`
- [ ] 8.5 Empate de candidatos (delta `< 0.10`) nunca auto-vincula
- [ ] 8.6 Treinador pode executar `VINCULAR_MANUALMENTE`, `MARCAR_NAO_PLANEJADO` e `DESFAZER_VINCULO`
- [ ] 8.7 Toda ação manual gera trilha auditável completa
- [ ] 8.8 Estado atual em `TreinoRealizado` e último evento permanecem consistentes

## 9. Quality Targets Validation

- [ ] 9.1 Validar falso positivo <= 2% em `VINCULADO_AUTOMATICO` com amostra inicial de 200 atividades
- [ ] 9.2 Validar `AMBIGUO` <= 25% das atividades reconciliáveis
- [ ] 9.3 Validar cobertura automática diária >= 70%
- [ ] 9.4 Validar latência p95 <= 5 min no fluxo scheduler
- [ ] 9.5 Validar latência p95 <= 1 min no fluxo manual/on-demand
- [ ] 9.6 Validar 0 duplicatas por `externalId + atletaId`
- [ ] 9.7 Validar 100% de trilha auditável em ações manuais
- [ ] 9.8 Validar taxa de falha técnica < 3% no sync diário (com retry)

## 10. Sprint Slices (Execution Order)

- [ ] 10.1 Slice A - Persistência e migração: tasks `3.1` a `3.4`
- [ ] 10.2 Slice B - Matching engine: tasks `2.1` a `2.5`
- [ ] 10.3 Slice C - Fluxo manual e auditoria: tasks `4.1` a `6.3`
- [ ] 10.4 Slice D - Observabilidade e qualidade: tasks `9.1` a `9.8`
