# Tasks — coach-encerrar-semana-ui

Trilha Fast · frontend (`apps/menthoros-front`). Validação por bloco: `npm run lint && npm run build`.
Depende de `coach-encerrar-semana` mergeada (contratos de API).

## 1. Cliente de API + serviço/hook

- [ ] 1.1 Regenerar o cliente TypeScript da API (openapi) com os endpoints de encerramento (individual, lote, preview).
- [ ] 1.2 `EncerramentoService` + hook `useEncerrarSemana` (individual, lote, preview) com estados de loading/erro.
- [ ] 1.3 Validação: `npm run lint && npm run build`.

## 2. Ação individual "Encerrar semana"

- [ ] 2.1 Botão de ação no contexto do plano/semana do atleta; chama o endpoint individual e exibe o resumo (perdidos, status, `aviso`).
- [ ] 2.2 Tratar o `aviso` (meio de semana) como informação, não erro (critério 4).
- [ ] 2.3 Validação: `npm run lint && npm run build` + smoke manual.

## 3. Lote da assessoria com confirmação (preview)

- [ ] 3.1 Botão "Encerrar semana de todos" no painel do treinador.
- [ ] 3.2 Dialog de confirmação **responsivo** que carrega o preview e mostra o impacto projetado (treinos/atletas); só dispara o encerramento real após aceite; cancelar não faz nada (critério 2).
- [ ] 3.3 Card de resumo do lote: totais + lista de falhas por atleta sem travar os que deram certo (critério 3).
- [ ] 3.4 Validação: `npm run lint && npm run build`.

## 4. Estado pós-ação e regressão

- [ ] 4.1 Refletir semanas encerradas / treinos `PERDIDO` nas telas existentes (fila de atenção / dashboard); distinguir `AUTOMATICO`/`ON_DEMAND` quando a origem estiver disponível.
- [ ] 4.2 Garantir dialogs responsivos (telas menores e maiores) e nenhum fluxo existente quebrado (critério 5).
- [ ] 4.3 Validação final: `npm run lint && npm run build`.
