# Tasks — coach-encerrar-semana-ui

Trilha Fast · frontend (`apps/menthoros-front`). Validação por bloco: `npm run lint && npm run build`.
Depende de `coach-encerrar-semana` mergeada (contratos de API — já em `develop`).

### Âncoras de código (verificado no repo, base `be48f1b`)

- **Cliente de API**: front usa **serviços curados à mão** (`src/api/services/*Service.ts`) que chamam `__request()` — padrão de referência `src/api/services/FitUploadService.ts:10-29` (usa `OpenAPI.HEADERS`). O `generate:api` (`package.json:11`) aponta para `http://localhost:8099/api-docs` (backend rodando) — **não é pré-requisito**: escrevo `CoachSemanaService` à mão + tipos espelhando os DTOs do backend. Regen opcional se o backend estiver de pé.
- **Hook de referência**: `src/hooks/useFitUpload.ts:5-32` (`{ acao, loading, error, result, reset }`, `useState`, sem React Query).
- **Ação individual**: Card de plano em `src/components/features/planos/planosDialog.tsx:435-651` (aberto pelo `CoachAthletesPage` action='plano'). Tipos: `src/types/PlanoSemanal.ts` (`PlanoStatus`).
- **Lote**: `src/features/coach/pages/CoachAthletesPage.tsx` — `BulkBar` (`:178-204`) e grid com seleção; bom ponto para "Encerrar semana de todos".
- **Dialog shell**: `src/shared/components/CoachDialog.tsx:80-213` (responsivo, `maxWidth`, `fullScreenOnMobile`, `actions`).
- **CTA gerar próximo plano**: `PlanosDialog` já gera plano (`usePlanoSemanal.gerarPlanoSemanal`, toggle PRÓX_SEMANA `:300-387`).
- **Estado pós-ação**: `TreinoCard.tsx` já renderiza status `PERDIDO`; recarregar via `useCoachRoster.fetchRoster()` / `usePlanoSemanal.fetchPlanosPorAtleta`.
- **Validação**: `npm run lint` (eslint), `npm run build` (`tsc -b && vite build`), `npm run test:run` (vitest).

## 1. Tipos + serviço/hook

- [x] 1.1 Tipos dos DTOs de encerramento (`EncerramentoSemanaResult`, `EncerramentoLoteResult`, `FalhaAtleta`, enum `OrigemEncerramento`) em `src/types/` espelhando o backend. (Regen do cliente é opcional — ver âncoras.)
- [x] 1.2 `CoachSemanaService` (`src/api/services/`) com `encerrarSemana(planoId)`, `encerrarLote()`, `previewEncerrarLote()` no padrão `FitUploadService` (`__request` + `OpenAPI.HEADERS`); exportar em `src/api/index.ts`.
- [x] 1.3 Hook `useEncerrarSemana` (`src/hooks/`) no padrão `useFitUpload` — expõe individual/lote/preview com `loading`/`error`/`result`.
- [x] 1.4 **verify:** `npm run lint && npm run build` + teste (Vitest) do service/hook (mock do `__request`, estados de sucesso/erro).

## 2. Ação individual "Encerrar semana"

- [x] 2.1 Botão "Encerrar semana" no Card de plano (`planosDialog.tsx`); chama `encerrarSemana(planoId)` e exibe o resumo (nº perdidos, status, `aviso`). Recarrega os planos após sucesso.
- [x] 2.2 Tratar `aviso` (meio de semana) como informação, não erro (critério 4).
- [x] 2.2b Estado visual distinto: `prontoParaProximaSemana=true` → verde + CTA; `false` → amarelo/warning com `aviso` em destaque.
- [x] 2.2c CTA "Gerar plano da próxima semana" quando `prontoParaProximaSemana=true` → aciona o fluxo de geração já existente no `PlanosDialog` (toggle PRÓX_SEMANA + `gerarPlanoSemanal`). Zero backend.
- [x] 2.3 **verify:** `npm run lint && npm run build && npm run test:run` (teste de componente do resumo: verde/amarelo, aviso, CTA condicional).

## 3. Lote da assessoria com confirmação (preview)

- [x] 3.1 Botão "Encerrar semana de todos" no `CoachAthletesPage` (BulkBar/toolbar).
- [x] 3.2 Dialog de confirmação responsivo (`CoachDialog`) que carrega o `previewEncerrarLote()` e mostra o impacto projetado (treinos/atletas); só dispara o real após aceite; cancelar não altera nada (critério 2).
- [~] 3.2b **ADIADO** (segue via `encerrarLote()` completo): a seleção granular por atleta com nomes exigiria o backend expor `atletaId`/nome nos resultados de sucesso do preview (`EncerramentoSemanaResult` só tem `planoId`; o roster não expõe `planoId`). Follow-up: adicionar `atletaId`+`nome` ao `EncerramentoSemanaOutputDto`. Original: Seleção granular: lista de atletas com checkbox (todos marcados por default); coach pode desmarcar; a execução chama o encerramento **individual** por atleta selecionado (orquestração no front) — mantém o preview coerente com o que será aplicado.
- [x] 3.3 Card de resumo do lote: totais + lista de `falhas` por atleta sem travar os que deram certo (critério 3).
- [x] 3.4 **verify:** `npm run lint && npm run build && npm run test:run` (teste: preview obrigatório antes de confirmar; cancelar = no-op; render de falhas).

## 4. Estado pós-ação e regressão

- [x] 4.1 Reloads ligados: individual → `fetchPlanosPorAtleta`; lote → `fetchRoster`. Nota: `origem` vem no resultado mas não é exibida (ação do coach é sempre ON_DEMAND); distinguir AUTOMATICO em leituras posteriores é o follow-up documentado no design (exige persistir/expor `origem` nas telas de leitura).
- [x] 4.2 Garantir dialogs responsivos (telas menores/maiores) e nenhum fluxo existente quebrado (critério 5).
- [x] 4.3 **verify final:** `npm run lint && npm run build && npm run test:run` + smoke manual.
