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

### D4. Concorrência: `@Version` cobre escrita simultânea, não aba desatualizada

**Achado do pre-mortem Codex (2026-09-23):** `@Version` sozinho não entrega o que CA8 promete.
Hibernate detecta transações de banco sobrepostas, não leituras de navegador desatualizadas. Se
a aba A carrega a sugestão na versão 0, a aba B edita e comita (vira versão 1), e só depois A
chama `aprovar` (sem nunca ter recarregado), a transação de A lê a versão 1 direto do banco e
aprova um texto que nunca viu — sem conflito, sem 409, porque não houve sobreposição de
transações. O mesmo vale para `rejeitar`. Isso é *pior* depois desta change, porque antes dela o
`summary` era imutável — agora aprovar/rejeitar podem decidir sobre texto que mudou depois que o
coach abriu o dialog.

**Correção:** o DTO de saída passa a expor `versao`; os três endpoints que agem sobre a sugestão
(`editar`, `aprovar`, `rejeitar`) passam a aceitar um parâmetro opcional `versaoEsperada` (Long).
Quando presente, o service compara com a `versao` atual **antes de mutar**, dentro da mesma
transação, e responde 409 (`ConflitoVersaoException`, mapeada no `GlobalExceptionHandler`) se
divergir — cobrindo tanto a aba desatualizada quanto a escrita sobreposta que `@Version` já
pegava. Quando ausente (chamada antiga, ex.: `aprovar`/`rejeitar` de `add-coach-suggestion-review-
actions` antes desta change atualizar o frontend deles), o comportamento é o de hoje — sem
checagem, para não quebrar um caller que ainda não foi atualizado. O `@Version` da entidade
continua existindo como rede de segurança para o caso raro de duas transações concorrentes lerem
a mesma versão e tentarem gravar ao mesmo tempo (a checagem explícita e o `@Version` cobrem
janelas de tempo diferentes: pré-leitura vs. commit).

Sem necessidade de lock pessimista como em `ContratoAtleta` (sem scheduler disputando a mesma
linha; as únicas escritas concorrentes possíveis são coach × coach).

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
- **`@Version` novo pode quebrar código que já faz `SugestaoCoach.builder()...build()` sem
  `versao`:** campo com default `0` no banco e na entidade (`@Builder.Default`), não exige
  mudança no job gerador.
- **Diff caseiro em vez de lib testada:** superfície pequena (frases curtas), coberto por testes
  parametrizados (inserção, remoção, substituição, texto idêntico).

## Pre-mortem (2026-09-23, Codex adversarial review)

Dois achados, ambos incorporados:

1. **`@Version` não pega aba desatualizada** (D4 original) — Hibernate só detecta transações de
   banco sobrepostas, não uma leitura de navegador antiga; `aprovar`/`rejeitar` liam a linha mais
   recente e decidiam sobre texto que o coach nunca viu, sem 409. Corrigido com `versaoEsperada`
   opcional nos três endpoints, checado antes de mutar dentro da transação (D4 revisado).
2. **`summary` sem limite de tamanho** — `@NotBlank` sozinho não impede texto longo; o LCS e a
   renderização do diff rodariam sobre entrada não limitada. Corrigido com `@Size(max = 500)` no
   DTO e teto de tokens no `wordDiff` com fallback sem destaque (D5 revisado).

## Migration Plan

1. Backend: migration aditiva + campos na entidade + `editar` no service + endpoint + DTOs.
   PR backend → develop.
2. Front: `SugestaoService.editar`, botão Editar no `CoachDialog` (depende de
   `add-coach-suggestion-review-actions` já ter os botões Aprovar/Rejeitar), diff de palavras.
   PR front → develop.

## Open Questions

- Nenhuma além das registradas no proposal ("Open Questions & Assumptions").
