# Tasks — add-coach-suggestion-edit-delta

Validação por bloco: backend `./mvnw clean test` (IT classes exigem `./mvnw clean verify` no
gate final); frontend `npm run lint && npm run build && npm test`. Branch
`feat/add-coach-suggestion-edit-delta` (padrão `<tipo>/<change-id>`) nos dois repos antes de qualquer código. Backend
mergeia antes do front.

Pré-requisito: ✅ `add-coach-suggestion-review-actions` mergeada (arquivada 2026-09-27) e
`add-coach-suggestion-decision-audit` mergeada (arquivada 2026-10-09). Migration nova = **V103**
(a última é `V102__add_status_lifecycle_to_tb_waitlist.sql`). Atenção: `rejeitar` já recebe corpo
`RejeitarSugestaoRequestDto` (`rejectionReason`) — o `versaoEsperada` da task 2.4 entra como
**query param**, não no corpo.

## 1. Backend — modelo

- [x] 1.1 Migration `V103__Add_edit_delta_columns_tb_sugestao_coach.sql` (design D1): colunas
      `summary_original` (text, nullable), `editado_pelo_coach` (boolean not null default
      false), `edited_at` (timestamptz, nullable), `versao` (bigint not null default 0). Sem
      alterar `chk_sugestao_status` nem `uk_sugestao_pending`.
      *verify:* IT Testcontainers — colunas existem, defaults corretos, constraints antigas
      intactas.
- [x] 1.2 Entidade `SugestaoCoach`: campos `summaryOriginal`, `editadoPeloCoach` (default
      `false` via `@Builder.Default`), `editedAt`, `versao` (`long`, **sem `@Version`**, default 0
      também no `@Builder`).
      *verify:* `SugestaoCoachGeneratorJobTest` verde sem passar `versao`; sugestão gerada pelo job
      nasce com `versao = 0`, `editadoPeloCoach = false`.

## 2. Backend — serviço e endpoint

- [x] 2.1 `SugestaoCoachRepository.editarSePendente(id, tenantId, summary, versaoEsperada, agora)`
      (design D4): `UPDATE` condicional (`status = PENDING AND versao = :versaoEsperada`,
      `summary_original = COALESCE(...)`, `versao + 1`). `SugestaoCoachService.editar` chama e, com
      0 linhas, recarrega: não PENDING → `DomainRuleViolationException` (422, vence); senão
      `DomainConflictException` (409).
      *verify:* CA1, CA2, CA3, CA11, CA12.
- [x] 2.2 `PUT /api/v1/coach/sugestoes/{id}` em `CoachSugestaoController`, mesma autorização e
      `@RequireTenant` do controller. `SugestaoCoachEditInputDto` (`summary` `@NotBlank` +
      `@Size(max = 500)`, `versaoEsperada` `@NotNull`). `@ApiResponses` conforme o contrato do
      design.md.
      *verify:* CA6 (403 cross-tenant, 404 inexistente), CA7, CA10 (500 passa / 501 falha), CA13.
- [x] 2.3 `SugestaoCoachOutputDto` ganha `summaryOriginal`, `editadoPeloCoach`, `editedAt`,
      `versao`. Mapper ajustado.
      *verify:* CA4, CA5 (payload correto com e sem edição).
- [x] 2.4 `versaoEsperada` opcional em `aprovar`/`rejeitar` (query param): `decidirSePendente`
      ganha `versao = versao + 1` e `AND (:versaoEsperada IS NULL OR versao = :versaoEsperada)`;
      0 linhas com versão divergente → `DomainConflictException` (409); sem o parâmetro,
      comportamento inalterado. Atualizar `@ApiResponses` dos dois endpoints.
      *verify:* CA9; os testes existentes de `aprovar`/`rejeitar` continuam verdes sem o parâmetro.
- [x] 2.5 Teste de concorrência (Testcontainers): (a) duas edições com a mesma `versaoEsperada` →
      uma 200, outra 409; (b) `editar` depois de `aprovar` comitado → 422 e `summary` intacto.
      *verify:* CA8, CA12.

## 3. Frontend — service e tipos

- [x] 3.1 `SugestaoService.editar(id, summary, versaoEsperada?)` → `PUT
      /api/v1/coach/sugestoes/{id}`; `aprovar`/`rejeitar` passam a enviar `versaoEsperada`.
      `types/SugestaoCoach.ts` ganha `summaryOriginal`, `editadoPeloCoach`, `editedAt`, `versao`.
      O cliente é curado à mão (CLAUDE.md front): gerar o OpenAPI em diretório scratch e **portar
      à mão** `editar` e o parâmetro novo, sem commitar saída crua.
      *verify:* `npm run build` verde.

## 4. Frontend — edição e delta no dialog

- [x] 4.1 Botão "Editar" no `CoachDialog` de `RecentSuggestionsPanel.tsx` (ao lado de
      Aprovar/Rejeitar de `add-coach-suggestion-review-actions`), visível só em PENDING: troca o
      resumo por textarea (`maxLength={500}`) com Salvar/Cancelar. 409 em qualquer ação mostra
      "esta sugestão mudou desde que você abriu — recarregue".
      *verify:* CA1, CA9 (mensagem de conflito) refletidos na UI.
- [x] 4.2 Utilitário `wordDiff(original, atual)` (design D5, LCS por palavra, sem lib nova, teto
      de 200 palavras por lado com fallback sem destaque) + renderização com destaque
      (inserção/remoção) quando `editadoPeloCoach === true`; sem seção de diff quando nunca
      editada.
      *verify:* CA4, CA5; testes parametrizados do `wordDiff` (inserção, remoção, substituição,
      texto idêntico, texto acima do teto cai no fallback).
- [x] 4.3 Testes RTL do fluxo completo: editar, ver delta, tentar editar sugestão já decidida
      (botão ausente), conflito de versão.
      *verify:* `npm run lint && npm run build && npm test` verde.
- [x] 4.4 E2E Playwright (`tests/e2e/`, fluxo coach-in-the-loop — obrigatório): editar texto de
      sugestão PENDING, ver original + destaque, aprovar; segunda aba edita → 409 com a mensagem
      de recarregar. Se inviável, registrar aqui o motivo do adiamento.
      *verify:* `npm run test:e2e` verde e o spec visita o dialog de edição.

## 5. Integração e encerramento

- [x] 5.1 Gate backend completo (`./mvnw clean verify`), gate front, `/qa` nos dois repos.
- [ ] 5.2 **ADIADA** — Validação manual em `develop` (Railway): editar uma sugestão PENDING real duas vezes,
      confirmar que `summaryOriginal` não muda na segunda edição; abrir em duas abas e confirmar
      409 na segunda edição concorrente.
      *Motivo do adiamento:* exige login e duas abas no ambiente real, o que não foi possível na
      sessão de arquivamento. O comportamento está coberto por ITs no backend (editar x editar e
      editar x aprovar em paralelo, `SugestaoCoachEditDeltaIT`) e por 3 cenários E2E no front
      (`tests/e2e/coach/suggestion-edit-delta.spec.ts`, backend simulado). Falta apenas o
      click-through em `develop`; se falhar, abrir change `fix-` nova.
