# Tasks — add-coach-suggestion-edit-delta

Validação por bloco: backend `./mvnw clean test` (IT classes exigem `./mvnw clean verify` no
gate final); frontend `npm run lint && npm run build && npm test`. Branch
`feature/add-coach-suggestion-edit-delta` nos dois repos antes de qualquer código. Backend
mergeia antes do front. Pré-requisito: `add-coach-suggestion-review-actions` já mergeada.

## 1. Backend — modelo

- [ ] 1.1 Migration `Vnn__Add_edit_delta_columns_tb_sugestao_coach.sql` (design D1): colunas
      `summary_original` (text, nullable), `editado_pelo_coach` (boolean not null default
      false), `edited_at` (timestamptz, nullable), `versao` (bigint not null default 0). Sem
      alterar `chk_sugestao_status` nem `uk_sugestao_pending`.
      *verify:* IT Testcontainers — colunas existem, defaults corretos, constraints antigas
      intactas.
- [ ] 1.2 Entidade `SugestaoCoach`: campos `summaryOriginal`, `editadoPeloCoach` (default
      `false` via `@Builder.Default`), `editedAt`, `@Version versao`.
      *verify:* `SugestaoCoachGeneratorJobTest` continua verde sem passar `versao` explicitamente.

## 2. Backend — serviço e endpoint

- [ ] 2.1 `SugestaoCoachService.editar(id, novoSummary, versaoEsperada)` (design D2/D3): guarda
      de estado (só PENDING, senão `DomainRuleViolationException`), snapshot de
      `summaryOriginal` só na primeira edição, `editadoPeloCoach = true`, `editedAt = agora`.
      *verify:* CA1, CA2, CA3.
- [ ] 2.2 `PUT /api/v1/coach/sugestoes/{id}` em `CoachSugestaoController`, mesma autorização e
      `@RequireTenant` do controller. `SugestaoCoachEditInputDto` (`summary` `@NotBlank` +
      `@Size(max = 500)`, `versaoEsperada` opcional).
      *verify:* CA6 (404 cross-tenant), CA7 (400 summary vazio), CA10 (400 summary > 500 chars).
- [ ] 2.3 `SugestaoCoachOutputDto` ganha `summaryOriginal`, `editadoPeloCoach`, `editedAt`,
      `versao`. Mapper ajustado.
      *verify:* CA4, CA5 (payload correto com e sem edição).
- [ ] 2.4 `versaoEsperada` opcional em `aprovar`/`rejeitar` (design D4, achado do pre-mortem):
      quando presente, compara com a `versao` atual antes de mutar e responde 409
      (`ConflitoVersaoException`, mapeada no `GlobalExceptionHandler`) se divergir; quando
      ausente, comportamento inalterado.
      *verify:* CA9 (aprovar/rejeitar com versão desatualizada → 409, mesmo sem sobreposição de
      transação de banco).
- [ ] 2.5 Teste de concorrência: duas edições/decisões simultâneas na mesma sugestão (transações
      sobrepostas) → `OptimisticLockException` mapeada para 409 (design D4, rede de segurança do
      `@Version`).
      *verify:* CA8.

## 3. Frontend — service e tipos

- [ ] 3.1 `SugestaoService.editar(id, summary, versaoEsperada?)` → `PUT
      /api/v1/coach/sugestoes/{id}`; `aprovar`/`rejeitar` passam a enviar `versaoEsperada`.
      `types/SugestaoCoach.ts` ganha `summaryOriginal`, `editadoPeloCoach`, `editedAt`, `versao`.
      *verify:* `npm run build` verde.

## 4. Frontend — edição e delta no dialog

- [ ] 4.1 Botão "Editar" no `CoachDialog` de `RecentSuggestionsPanel.tsx` (ao lado de
      Aprovar/Rejeitar de `add-coach-suggestion-review-actions`), visível só em PENDING: troca o
      resumo por textarea (`maxLength={500}`) com Salvar/Cancelar. 409 em qualquer ação mostra
      "esta sugestão mudou desde que você abriu — recarregue".
      *verify:* CA1, CA9 (mensagem de conflito) refletidos na UI.
- [ ] 4.2 Utilitário `wordDiff(original, atual)` (design D5, LCS por palavra, sem lib nova, teto
      de 200 palavras por lado com fallback sem destaque) + renderização com destaque
      (inserção/remoção) quando `editadoPeloCoach === true`; sem seção de diff quando nunca
      editada.
      *verify:* CA4, CA5; testes parametrizados do `wordDiff` (inserção, remoção, substituição,
      texto idêntico, texto acima do teto cai no fallback).
- [ ] 4.3 Testes RTL do fluxo completo: editar, ver delta, tentar editar sugestão já decidida
      (botão ausente), conflito de versão.
      *verify:* `npm run lint && npm run build && npm test` verde.

## 5. Integração e encerramento

- [ ] 5.1 Gate backend completo (`./mvnw clean verify`), gate front, `/qa` nos dois repos.
- [ ] 5.2 Validação manual em `develop` (Railway): editar uma sugestão PENDING real duas vezes,
      confirmar que `summaryOriginal` não muda na segunda edição; abrir em duas abas e confirmar
      409 na segunda edição concorrente.
