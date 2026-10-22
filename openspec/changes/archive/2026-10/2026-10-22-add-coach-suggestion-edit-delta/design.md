# Design — add-coach-suggestion-edit-delta

## Context

`SugestaoCoach` (`entity/SugestaoCoach.java`) tem `status` (`StatusSugestao`: PENDING/APPROVED/
REJECTED) travado por `CHECK chk_sugestao_status` (`V36__Create_tb_sugestao_coach.sql`) e um
índice parcial único `uk_sugestao_pending` (`atleta_id, tipo` WHERE `status = 'PENDING'`) que
garante no máx. uma PENDING por atleta+tipo. `CoachSugestaoController` expõe listar/detalhe/
aprovar/rejeitar, todos `hasAnyRole('TECNICO','ADMIN')` + `@RequireTenant`.
`SugestaoCoachGeneratorJob` roda diário, só faz `INSERT` (nunca `UPDATE` numa sugestão existente)
— idempotência vem do índice único, capturando `DataIntegrityViolationException`.

Não há nenhum campo de versionamento na entidade hoje. O precedente mais próximo de "coach editou
algo gerado por IA" é `TreinoPlanejado` (`entity/TreinoPlanejado.java:28-38`): `@Version versao` +
`editadoPeloCoach` (boolean) — mas é só um flag, sem snapshot do valor original nem diff.

## Goals / Non-Goals

**Goals:** coach edita o `summary` de uma sugestão PENDING sem perder o texto original da IA;
delta visível no dialog; sem corrida silenciosa entre edições concorrentes.

**Non-Goals:** editar `tipo`/`confidence`/`reasoningJson`; histórico de múltiplas versões; reverter
com um clique; novo estado no fluxo de decisão; motivo de rejeição.

## Decisions

### D1. Sem estado `EDITED` — edição é um atributo da sugestão PENDING

Alternativa descartada: adicionar `EDITED` ao enum `StatusSugestao`, com transições
PENDING → EDITED → APPROVED. Rejeitada porque:

- Exigiria migration alterando o `CHECK chk_sugestao_status` e decidir se `EDITED` conta para o
  índice parcial `uk_sugestao_pending` (hoje só cobre `PENDING`) — mais superfície de mudança sem
  ganho: o *fluxo* de decisão continua sendo PENDING → APPROVED|REJECTED, só o *conteúdo* mudou.
- `aprovar`/`rejeitar` já tratam estado terminal com `DomainRuleViolationException`; reusar a
  mesma guarda para "editar só vale em PENDING" mantém o service com uma única fonte de verdade
  sobre transições válidas.

Escolhido: `editadoPeloCoach` (boolean) + `summaryOriginal` (nullable) + `editedAt`, seguindo a
convenção de nome já usada em `TreinoPlanejado`. `status` não muda com a edição.

```sql
-- Vnn (próxima livre)
ALTER TABLE tb_sugestao_coach
  ADD COLUMN summary_original text,
  ADD COLUMN editado_pelo_coach boolean NOT NULL DEFAULT false,
  ADD COLUMN edited_at timestamptz,
  ADD COLUMN versao bigint NOT NULL DEFAULT 0;
```

Sem `DROP`, sem tocar `chk_sugestao_status` nem `uk_sugestao_pending` — puramente aditivo.

### D2. `summaryOriginal` fixado na primeira edição, nunca sobrescrito

`SugestaoCoachServiceImpl.editar(id, novoSummary)`:

```java
if (sugestao.getSummaryOriginal() == null) {
    sugestao.setSummaryOriginal(sugestao.getSummary()); // snapshot antes de trocar
}
sugestao.setSummary(novoSummary);
sugestao.setEditadoPeloCoach(true);
sugestao.setEditedAt(Instant.now());
```

Múltiplas edições não acumulam histórico — o delta exibido é sempre "o que a IA gerou" vs. "o
texto atual", não "a edição anterior vs. a atual". Decisão de escopo (Non-Goal: histórico
completo); se aparecer necessidade real de auditoria fina, é uma tabela de eventos à parte, não
mais colunas nesta entidade.

### D3. Guarda de estado reaproveita o padrão de `aprovar`/`rejeitar`

```java
if (sugestao.getStatus() != StatusSugestao.PENDING) {
    throw new DomainRuleViolationException("Sugestão não está mais pendente");
}
```

Mesma exceção, mesmo mapeamento HTTP (422) que `aprovar` já usa para APPROVED→APPROVED sendo
no-op vs. REJECTED→APPROVED sendo erro — aqui toda transição fora de PENDING é erro (CA3), sem
caso de no-op (editar duas vezes em PENDING é sempre válido, D2 cobre a semântica).

### D4. Concorrência: `UPDATE` condicional com `versao`, sem `@Version`

**Achados do pre-mortem Codex (2026-09-23) e do DoR (2026-10-22):**

1. `@Version` não pega aba desatualizada — Hibernate só detecta transações de banco sobrepostas,
   não uma leitura de navegador antiga. A aba A lê `versao` 0, B edita (vira 1), A aprova sem
   recarregar e decide sobre texto que nunca viu, sem 409.
2. `@Version` também **não protege `editar` × `aprovar`/`rejeitar`**: `decidirSePendente` é um
   `UPDATE` JPQL em massa (`SugestaoCoachRepository.java`) que não passa pelo lock otimista do
   Hibernate nem incrementa `versao`. Um `editar` que carregou a sugestão PENDING antes de um
   `aprovar` comitar gravaria texto numa sugestão já APPROVED (viola CA3).

**Decisão:** `versao` é uma coluna `bigint` **comum** (sem `@Version`), incrementada à mão em todo
`UPDATE` que muda o conteúdo ou o status, e comparada **dentro da cláusula `WHERE`** — a checagem e
a escrita são uma única instrução atômica, sem janela entre ler e gravar. Segue o mesmo padrão que
`decidirSePendente` já usa para `status = PENDING`.

- `editar`: `UPDATE ... SET summary = :novo, summary_original = COALESCE(summary_original,
  summary), editado_pelo_coach = true, edited_at = :agora, versao = versao + 1 WHERE id = :id AND
  tenant_id = :tenantId AND status = 'PENDING' AND versao = :versaoEsperada`.
  `versaoEsperada` é **obrigatório** no `PUT` (sem ele a segunda edição sobrescreveria a primeira
  sem 409 — CA8).
- `decidirSePendente` ganha `versao = versao + 1` no `SET` e `AND (:versaoEsperada IS NULL OR
  versao = :versaoEsperada)` no `WHERE`. `versaoEsperada` é **opcional** em `aprovar`/`rejeitar`
  (query param): ausente, comportamento de hoje, para não quebrar caller antigo.
- **0 linhas afetadas** → o service recarrega a sugestão e decide, **nesta ordem**: inexistente/
  outro tenant → 404/403 (já tratado por `findByIdAndTenantId` + `@RequireTenant`); status ≠
  PENDING → 422 em `editar` (em `aprovar`/`rejeitar` valem as regras atuais: no-op ou 422);
  senão (versão divergente) → `DomainConflictException` → 409. **Estado terminal vence versão
  divergente.**
- `DomainConflictException` já existe e já é mapeada em 409 no `GlobalExceptionHandler`; não se
  cria `ConflitoVersaoException`.

Sem lock pessimista (sem scheduler disputando a linha; únicas escritas concorrentes são coach ×
coach). Sem `@Version`: a entidade não precisa de lock otimista porque nenhum caminho de escrita
passa por `save` sobre sugestão existente — o job só faz `INSERT`.

### D5. Diff de palavras sem biblioteca nova — com limite explícito

**Achado do pre-mortem Codex:** `summary` é `TEXT` no banco e o `PUT` só validava `@NotBlank` —
nada impede colar um texto longo (ou um payload de API grande) na textarea, o que faria o LCS
O(n·m) e a renderização de tokens rodarem sobre entrada não limitada, travando o dialog.

**Correção:** `SugestaoCoachEditInputDto.summary` ganha `@Size(max = 500)` (generoso para "uma ou
duas frases", coerente com o que o job hoje gera via `item.suggestedAction()`) — validado no
backend, `maxLength` espelhado na textarea do frontend. O `wordDiff(original, atual)` (LCS por
palavra, sem lib nova, tokens `unchanged | added | removed`) recebe adicionalmente um teto de
tokens (ex.: 200 palavras por lado); se qualquer um dos dois textos exceder, a função não roda o
LCS — o dialog cai para exibir os dois textos lado a lado sem destaque palavra-a-palavra, em vez
de travar. Esse teto é defensivo (dado legado ou uma corrida entre o limite do DTO e uma edição
direta no banco), já que o `@Size` do input deveria impedir o caso normal.

## Risks / Trade-offs

- **Sem histórico de edições intermediárias:** aceito, é Non-Goal explícito; auditoria fina não
  tem consumidor hoje (mesmo racional de D1 em `add-contrato-atleta-mensalidade`).
- **Campos novos na entidade e `@Builder`/`@AllArgsConstructor`:** `versao` e `editadoPeloCoach`
  com default no banco e na entidade (`@Builder.Default`); o job gerador (`INSERT`) não muda.
- **Diff caseiro em vez de lib testada:** superfície pequena (frases curtas), coberto por testes
  parametrizados (inserção, remoção, substituição, texto idêntico).

## Pre-mortem (2026-09-23, Codex adversarial review)

Dois achados, ambos incorporados:

1. **`@Version` não pega aba desatualizada** (D4 original) — Hibernate só detecta transações de
   banco sobrepostas, não uma leitura de navegador antiga; `aprovar`/`rejeitar` liam a linha mais
   recente e decidiam sobre texto que o coach nunca viu, sem 409. Corrigido com `versaoEsperada`
   comparado no `WHERE` do `UPDATE` (D4 revisado após o DoR de 2026-10-22: sem `@Version`).
2. **`summary` sem limite de tamanho** — `@NotBlank` sozinho não impede texto longo; o LCS e a
   renderização do diff rodariam sobre entrada não limitada. Corrigido com `@Size(max = 500)` no
   DTO e teto de tokens no `wordDiff` com fallback sem destaque (D5 revisado).

## Contrato de API

| Endpoint | Sucesso | Erros |
|---|---|---|
| `PUT /api/v1/coach/sugestoes/{id}` body `{summary, versaoEsperada}` (ambos obrigatórios) | 200 `SugestaoCoachOutputDto` | 400 (summary vazio, > 500, `versaoEsperada` ausente) · 403 (sem papel ou outro tenant, via `@RequireTenant`) · 404 (inexistente) · 409 (versão divergente) · 422 (não PENDING) |
| `POST .../{id}/aprovar?versaoEsperada=` (opcional) | 200 | + 409 (versão divergente), demais inalterados |
| `POST .../{id}/rejeitar?versaoEsperada=` (opcional) | 200 | + 409 (versão divergente), demais inalterados |

No front, os dois 409 (versão divergente e "outra decisão concorrente") usam a **mesma mensagem**:
"esta sugestão mudou desde que você abriu — recarregue".

## Rollback

Migration aditiva: reverter o deploy deixa as quatro colunas inertes (sem `DROP`). Ordem de
rollback inversa à de merge: **front primeiro** (ele depende dos campos novos), depois backend.

## Migration Plan

1. Backend: migration aditiva + campos na entidade + `editar` no service + endpoint + DTOs.
   PR backend → develop.
2. Front: `SugestaoService.editar`, botão Editar no `CoachDialog` (depende de
   `add-coach-suggestion-review-actions` já ter os botões Aprovar/Rejeitar), diff de palavras.
   PR front → develop.

## Open Questions

- Nenhuma além das registradas no proposal ("Open Questions & Assumptions").
