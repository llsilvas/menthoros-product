# Prévia — add-coach-suggestion-edit-delta (brief de execução)

Brief consolidado para executar a change via Claude Code. Fonte canônica: `openspec/changes/add-coach-suggestion-edit-delta/` (proposal.md, design.md, tasks.md, specs/). Em caso de divergência de detalhe, a fonte é a change, não este brief.

## Objetivo (1 frase)

Permitir que o coach edite o texto (`summary`) de uma `SugestaoCoach` PENDING, preservando o texto original da IA (`summaryOriginal`) e exibindo o diff antes/depois — fecha o gap "EDITED + diff" da Direção 2 do strategic compass (copiloto que aprende o método do coach).

## Repositórios e branches (verificado 2026-10-21)

- Backend: `/workspace/apps/menthoros-backend` — branch atual `develop`
- Frontend: `/workspace/apps/menthoros-front` — branch atual `develop`
- Produto (change docs): `/workspace/menthoros-product` — branch `master` (a change já vive aqui; não commitar código de implementação neste repo)

Criar `feature/add-coach-suggestion-edit-delta` nos DOIS repos (backend + front) antes de codar. Backend mergeia antes do front.

## Estado verificado do código (o que já existe)

Backend (`apps/menthoros-backend`):

- Entidade `src/main/java/br/com/menthoros/backend/entity/SugestaoCoach.java`: já tem `summary`, `reasoningJson`, `status` (PENDING/APPROVED/REJECTED), `confidence`, `reviewedAt`, `reviewedBy`, `rejectionReason`, `expiresAt`. NÃO tem `@Version`, `summaryOriginal`, `editadoPeloCoach`, `editedAt`.
- Controller `.../controller/CoachSugestaoController.java`: `GET /api/v1/coach/sugestoes`, `GET .../{id}`, `POST .../{id}/aprovar`, `POST .../{id}/rejeitar` (rejeitar já recebe corpo `RejeitarSugestaoRequestDto` com `rejectionReason`). NÃO existe `PUT .../{id}`.
- Service `.../services/SugestaoCoachService.java` + `impl/SugestaoCoachServiceImpl.java`: `aprovar(id)`, `rejeitar(id, request)`. NÃO existe `editar(...)`.
- NÃO existe `ConflitoVersaoException` — criar e mapear no `GlobalExceptionHandler` (→ 409).
- Migrations em `src/main/resources/db/migration/` — última é `V102__add_status_lifecycle_to_tb_waitlist.sql`. Nova = `V103`.
- DTO `.../dto/output/SugestaoCoachOutputDto.java` (record): já tem `summary`, `reasoning`, `rejectionReason` — falta adicionar `summaryOriginal`, `editadoPeloCoach`, `editedAt`, `versao`.

Frontend (`apps/menthoros-front`):

- Service `src/api/services/SugestaoService.ts`: `aprovar(id)`, `rejeitar(id, rejectionReason?)`. NÃO existe `editar(...)`.
- Tipo `src/types/SugestaoCoach.ts`: adicionar `summaryOriginal`, `editadoPeloCoach`, `editedAt`, `versao`.
- UI `src/features/coach/components/RecentSuggestionsPanel.tsx`: já tem `CoachDialog` com Aprovar/Rejeitar + `RejeitarSugestaoModal` (motivo). Adicionar botão Editar (só PENDING) + render do diff.

## Decisões de design (resumo — fonte: design.md)

- D1: SEM novo estado `EDITED` no enum `StatusSugestao`. Edição é propriedade da sugestão PENDING (`editadoPeloCoach` boolean), não estado do fluxo. Não mexe em `chk_sugestao_status` nem `uk_sugestao_pending`.
- D2/D3: `editar(id, novoSummary, versaoEsperada)`: só PENDING (senão `DomainRuleViolationException` → 422); snapshot `summaryOriginal` só na PRIMEIRA edição (nunca sobrescrever); `editadoPeloCoach = true`; `editedAt = agora`.
- D4: `versaoEsperada` opcional (query param) nos três endpoints (`editar`, `aprovar`, `rejeitar`) — `@Version` sozinho não detecta aba desatualizada. Presente → compara com `versao` atual; diverge → 409 (`ConflitoVersaoException`). Ausente → comportamento inalterado. Rede de segurança: `OptimisticLockException` também mapeada para 409.
- D5: `wordDiff(original, atual)` por palavra (LCS, sem lib nova), teto 200 palavras/lado, fallback sem destaque acima do teto.

## Ordem de execução (mapeia tasks.md)

1. Backend modelo: migration `V103` (4 colunas) + entidade (campos + `@Version versao`).
2. Backend serviço/endpoint: `editar` + `PUT` + `SugestaoCoachEditInputDto` + OutputDto + `versaoEsperada` em aprovar/rejeitar + `ConflitoVersaoException`.
3. Frontend service/tipos: `editar(...)` + campos novos no tipo + `versaoEsperada` em aprovar/rejeitar.
4. Frontend UI: botão Editar (PENDING) + `wordDiff` + render original/atual + mensagem de 409.
5. Integração: gate backend, gate front, `/qa` nos dois repos, validação manual no Railway.

## Números e limites

- `@Size(max = 500)` em `summary` (input); `rejectionReason` já usa 500.
- `wordDiff` teto 200 palavras/lado.
- Migration `V103`; sem mudar `chk_sugestao_status` nem `uk_sugestao_pending`.

## Critérios de aceite (resumo — completos em proposal.md)

- CA1: editar PENDING → `summaryOriginal` = texto original da IA, `summary` = novo, `editadoPeloCoach = true`, `editedAt` setado.
- CA2: segunda edição não muda `summaryOriginal`.
- CA3: editar APPROVED/REJECTED → 422, nada muda.
- CA6: cross-tenant → 404.
- CA7: summary vazio → 400. CA10: >500 chars → 400.
- CA8/CA9: concorrência → 409 (transação sobreposta E aba desatualizada via `versaoEsperada`).
- CA4/CA5: dialog mostra original/atual com diff quando editado; sem seção de diff quando nunca editado.

## Fora de escopo

- Editar `tipo`/`confidence`/`reasoningJson` (só `summary`).
- Editar sugestão já decidida (APPROVED/REJECTED).
- Histórico de múltiplas versões (só original + atual).
- Reverter para original com 1 clique.
- Ações em massa.

## Gotchas / atenção

- `rejeitar` já tem corpo `RejeitarSugestaoRequestDto` — `versaoEsperada` entra como query param, não no corpo.
- Entidade já tem `rejectionReason`/`reviewedBy` — migration `V103` é aditiva, não toca nesses campos.
- Não commitar nada em `menthoros-product` durante a implementação (a change já está versionada lá); código vai nos repos backend/front.
- O `CLAUDE.md` do backend (`apps/menthoros-backend/CLAUDE.md:401`) está desatualizado — ainda descreve `IaServiceImpl` com ~1500 linhas (hoje ~399). Ler com ceticismo; o executor da change não mexe nessa classe.

## Validação final

- Backend: `cd /workspace/apps/menthoros-backend && ./mvnw clean verify`
- Frontend: `cd /workspace/apps/menthoros-front && npm run lint && npm run build && npm test`
- Manual (Railway/develop): editar PENDING real 2x (confirmar `summaryOriginal` não muda na 2ª); abrir em 2 abas → 409.
