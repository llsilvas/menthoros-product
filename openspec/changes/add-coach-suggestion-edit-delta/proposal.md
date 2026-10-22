# add-coach-suggestion-edit-delta — O coach ajusta o texto da IA e o Menthoros guarda o antes/depois

**Tamanho:** M · **Trilha:** Full

> Full porque toca os dois repositórios, muda o contrato de API (novo endpoint + campos novos no
> DTO de saída) e altera schema de banco (migration com colunas novas em `tb_sugestao_coach`).

## Status

Pronta para implementação (2026-10-21); ajustada após DoR em 2026-10-22 (D4 sem `@Version`, `versaoEsperada` obrigatório no `PUT`, contrato de API, rollback, E2E). Dependência satisfeita: `add-coach-suggestion-review-actions`
entregue e arquivada em 2026-09-27 (endpoints `aprovar`/`rejeitar` + botões Aprovar/Rejeitar no
`CoachDialog` de `RecentSuggestionsPanel.tsx`). O "motivo da rejeição" (Open Question abaixo) também
já foi implementado por `add-coach-suggestion-decision-audit` (arquivada 2026-10-09): campo
`rejectionReason` na entidade, `RejeitarSugestaoRequestDto` e modal de motivo no front.

## Revisão de produto (2026-09-23, `product-reviewer`)

**Veredito: Refine** — não no desenho da feature (bem alinhado a coach-in-the-loop), mas no
sequenciamento: esta change (M/Full, migration + contrato de API novo) está sendo proposta para
resolver uma dor ainda não observada, em cima de uma dependência (`review-actions`) que ainda nem
está em produção. A métrica de sucesso da própria proposta reconhece isso — "motivo da rejeição
não é registrado hoje" — expondo que o dado que provaria a necessidade do edit-delta não existe
ainda. Alternativa mais barata sugerida: um campo de motivo de rejeição (texto livre) na mesma
`review-actions`, Fast/S, geraria o sinal direto sobre se "rejeitar só por redação" é de fato
padrão de fricção, antes de comprometer o esforço M. Registrado como decisão do founder em "Open
Questions & Assumptions" — não bloqueia esta proposta, mas o founder decide se implementa
edit-delta já ou espera uma janela de uso real de `review-actions` primeiro.

## Pre-mortem (2026-09-23, Codex adversarial review)

Dois achados de `needs-attention`, ambos incorporados ao design (ver `design.md`):

1. **`@Version` não detecta aba desatualizada** (só sobreposição de transações no banco) **nem protege editar × decidir** (a decisão é `UPDATE` em massa) — sem
   correção, um coach podia aprovar/rejeitar um `summary` que mudou desde que abriu o dialog, sem
   nenhum erro. Corrigido com `versaoEsperada` (obrigatório em `editar`, opcional em `aprovar`/`rejeitar`) nos três endpoints (`editar`, `aprovar`,
   `rejeitar` — os dois últimos ganham esse parâmetro nesta change, ver "What Changes").
2. **Sem limite de tamanho em `summary`** — o diff de palavras (D5) rodaria sobre texto colado sem
   limite. Corrigido com `@Size(max = 500)` no DTO e teto de tokens no diff, com fallback sem
   destaque para entrada fora do limite.

## Why

`SugestaoCoach` guarda o texto que a IA gerou (`summary`) e a justificativa (`reasoningJson`), com
três estados: PENDING → APPROVED | REJECTED. Hoje o coach só pode aceitar o texto como está ou
rejeitar a sugestão inteira — não há como corrigir uma frase mal formulada, ajustar o tom para o
atleta específico, ou refinar a ação sugerida sem jogar fora a sugestão e perder o sinal que a
gerou. Isso empurra o coach para dois extremos ruins: aprovar um texto que não diria daquele jeito,
ou rejeitar uma sugestão correta no mérito só por causa da redação.

Coach-in-the-loop pressupõe que o coach pode **editar**, não só aprovar/rejeitar (ver estrela-guia
em `config.yaml`). Além disso, sem guardar o texto original, não há como auditar depois o que a IA
de fato propôs versus o que foi ao atleta — informação que alimenta o aprendizado do sistema de
sugestões (`SugestaoCoachGeneratorJob`) e a confiança do coach nele.

## What Changes

### Backend (`menthoros-backend`)

- **Entidade `SugestaoCoach`** ganha: `summaryOriginal` (TEXT, nullable — snapshot do `summary`
  gerado pela IA, preenchido **só na primeira edição**, nunca sobrescrito depois),
  `editadoPeloCoach` (boolean, default `false`, mesma convenção de nome de `TreinoPlanejado`),
  `editedAt` (timestamptz, nullable), `versao` (bigint, default 0, **coluna comum sem `@Version`**
  — incrementada nos `UPDATE` condicionais e comparada no `WHERE`, ver design.md D4).
- **`tipo`, `confidence` e `reasoningJson` continuam imutáveis** — só `summary` é editável. O
  job gerador (`SugestaoCoachGeneratorJob`) nunca escreve de novo numa sugestão existente
  (índice único por atleta+tipo+PENDING garante isso), então não há corrida entre job e edição.
- **Endpoint `PUT /api/v1/coach/sugestoes/{id}`**, mesma autorização do controller
  (`hasAnyRole('TECNICO','ADMIN')`) e `@RequireTenant`: body `{ summary: string, versaoEsperada:
  long }`, **ambos obrigatórios**. Implementado como `UPDATE` condicional (`status = PENDING AND
  versao = :versaoEsperada`): 0 linhas → 422 se não PENDING (vence), senão 409. Na primeira
  edição `summary_original` recebe o `summary` anterior (`COALESCE`), nunca é sobrescrito depois;
  `editadoPeloCoach = true`; `editedAt = agora`; `versao + 1`. Contrato completo de códigos em
  design.md.
- **`aprovar`/`rejeitar` (de `add-coach-suggestion-review-actions`) ganham `versaoEsperada`
  opcional** (query param) — achado do pre-mortem. `decidirSePendente` passa a incrementar
  `versao` e a comparar `versaoEsperada` no `WHERE`; 409 se divergir; ausente, comportamento
  inalterado (design.md D4).
- **Migration** adiciona quatro colunas em `tb_sugestao_coach`: `summary_original`,
  `editado_pelo_coach`, `edited_at`, `versao`. Sem mudança no `CHECK chk_sugestao_status` nem no
  índice parcial `uk_sugestao_pending` — o enum de status não muda.
- **DTO de saída** (`SugestaoCoachOutputDto`) ganha `summaryOriginal`, `editadoPeloCoach`,
  `editedAt`, `versao`. Novo `SugestaoCoachEditInputDto` (record, `summary` com `@NotBlank` e
  `@Size(max = 500)`, `versaoEsperada` opcional).

### Frontend (`menthoros-front`)

- `SugestaoService.ts` ganha `editar(id, summary, versaoEsperada?)` → `PUT
  /api/v1/coach/sugestoes/{id}`; `aprovar`/`rejeitar` passam a enviar `versaoEsperada` = a
  `versao` lida quando o dialog abriu.
- `types/SugestaoCoach.ts` ganha os quatro campos novos do DTO de saída (`summaryOriginal`,
  `editadoPeloCoach`, `editedAt`, `versao`).
- `CoachDialog` (em `RecentSuggestionsPanel.tsx`, já com Aprovar/Rejeitar de
  `add-coach-suggestion-review-actions`): quando `status === 'PENDING'`, ganha um botão "Editar"
  que troca o texto do resumo por um campo editável (textarea, `maxLength={500}`) com
  Salvar/Cancelar. Um 409 em qualquer ação (editar/aprovar/rejeitar) mostra "esta sugestão mudou
  desde que você abriu — recarregue" em vez de tentar de novo silenciosamente.
- Quando `editadoPeloCoach === true`, o dialog mostra os dois textos — "Sugestão original da IA"
  e "Editado por você" — com um diff simples de palavras (inserções/remoções destacadas por cor,
  sem biblioteca nova: função utilitária local de diff por palavra, já que o texto é curto,
  uma ou duas frases).

## Capabilities

### New Capabilities

- `coach-suggestion-edit-delta`: edição do texto de uma `SugestaoCoach` pendente pelo coach, com
  preservação do texto original da IA e exibição do delta.

## Fora do escopo

- Editar `tipo`, `confidence` ou `reasoningJson` — só `summary`.
- Editar sugestão já decidida (APPROVED/REJECTED) — editar e depois decidir, nessa ordem.
- Histórico de múltiplas versões (guarda só original + atual, não cada edição intermediária).
- Reverter para o original com um clique (o coach reedita manualmente se quiser voltar).
- Qualquer mudança em `add-coach-suggestion-review-actions` além de reusar o dialog dela.
- Ações em massa, editar por atleta em lote.

## Dependências e ordem

- Depende de `add-coach-suggestion-review-actions` — ✅ já entregue (arquivada 2026-09-27): botões
  Aprovar/Rejeitar existem no `CoachDialog` de `RecentSuggestionsPanel.tsx`.
- Backend mergeia antes do front (o front lê `summaryOriginal`/`editadoPeloCoach`/`editedAt`, que
  só existem depois da migration).

## Critérios de aceite

1. **Given** sugestão PENDING com `summary` = "Reduzir volume em 20%", **when** o coach edita
   para "Reduzir volume em 20% nas próximas duas semanas" e salva, **then** `summaryOriginal` =
   "Reduzir volume em 20%", `summary` = o novo texto, `editadoPeloCoach = true`, `editedAt`
   preenchido.
2. **Given** sugestão já editada uma vez (`summaryOriginal` preenchido), **when** o coach edita de
   novo, **then** `summaryOriginal` **não muda** — continua sendo o texto original da IA, não o
   texto da edição anterior.
3. **Given** sugestão APPROVED ou REJECTED, **when** chamado `PUT .../sugestoes/{id}`, **then**
   422 e nada muda.
4. **Given** sugestão nunca editada, **when** o coach abre o dialog, **then** vê só o texto atual,
   sem seção de "original" nem diff.
5. **Given** sugestão editada, **when** o coach abre o dialog, **then** vê original e atual, com
   as palavras diferentes destacadas.
6. **Given** técnico de outro tenant, **when** chama `PUT .../sugestoes/{id}` de sugestão de
   outro tenant, **then** 403 (mesmo comportamento de `@RequireTenant` nos demais endpoints do
   controller); id inexistente → 404.
7. **Given** `summary` vazio ou só espaços no body do `PUT`, **then** 400 (`@NotBlank`).
8. **Given** dois coaches com a mesma tela aberta (mesma `versao` lida), **when** o segundo `PUT`
   chega depois de o primeiro ter comitado, **then** 409 em vez de perder a primeira edição
   silenciosamente.
9. **Given** o coach A abre o dialog (lê `versao` = 0), o coach B edita o `summary` e comita
   (vira `versao` = 1), **when** o coach A clica Aprovar sem recarregar (envia
   `versaoEsperada = 0`), **then** o sistema responde 409 em vez de aprovar o texto que A nunca
   viu — mesmo sem sobreposição de transação de banco (cenário que `@Version` sozinho não cobre).
10. **Given** `summary` com mais de 500 caracteres no body do `PUT`, **then** 400 (500 passa, 501
    falha).
11. **Given** sugestão já APPROVED/REJECTED **e** `versaoEsperada` desatualizada, **when** `PUT`,
    **then** 422 (estado terminal vence versão divergente).
12. **Given** o coach A carregou a sugestão PENDING e o coach B a aprova, **when** A envia o `PUT`
    em seguida, **then** 422 e `summary` não muda (a decisão incrementa `versao`, nada é gravado
    numa sugestão decidida).
13. **Given** `PUT` sem `versaoEsperada`, **then** 400.

## Métrica de sucesso

Rotina do treinador, medida por query SQL em `tb_sugestao_coach` (dono: CPO, rodada manual no
fechamento de sprint — sem painel novo):

1. **Uso:** `editado_pelo_coach = true` em % das sugestões `APPROVED` na janela de 30 dias após o
   merge em produção. Meta de piso: **≥ 10%** (abaixo disso o recurso não está sendo usado).
2. **Valor:** nas assessorias fundadoras, ao menos 1 coach relata, na janela de 30 dias, que
   editou em vez de rejeitar por redação (qualitativo; o `rejectionReason` de
   `decision-audit` serve de linha de base).

## Riscos e mitigações

- **Aba desatualizada aprova/rejeita texto que não viu (achado do pre-mortem):** `@Version`
  sozinho só pega transações de banco sobrepostas, não uma leitura de navegador antiga.
  Mitigado com `versaoEsperada` opcional checado explicitamente antes de mutar, nos três
  endpoints (CA9, design.md D4).
- **Diff sem limite trava o dialog com texto colado grande (achado do pre-mortem):** `@Size(max =
  500)` no DTO + teto de tokens no `wordDiff` com fallback sem destaque (CA10, design.md D5).
- **Delta vira histórico implícito de PII/conteúdo sensível:** `summaryOriginal` e `summary` são
  texto sobre treino do atleta, já visível ao coach hoje (mesmo dado, um campo a mais) — sem
  informação nova sendo exposta, só preservada.
- **Diff caseiro em vez de biblioteca:** para frases curtas (uma ou duas orações), um diff de
  palavras por LCS simples é suficiente e evita dependência nova, agora com teto explícito de
  tokens; se o `summary` crescer para texto longo no futuro, revisar.

## Open Questions & Assumptions

- ✅ Sem novo estado `EDITED` no enum `StatusSugestao` — edição é uma propriedade da sugestão
  PENDING, não um estado do fluxo de decisão (decisão de design, ver design.md D1). Evita
  migration na `CHECK constraint` e no índice parcial.
- ✅ Só `summary` é editável (decisão de escopo, alinhada ao que o job realmente popula como texto
  livre).
- ✅ **Confirmada:** `add-coach-suggestion-review-actions` já mergeou (arquivada 2026-09-27).
- ✅ **Resolvido:** o **motivo** da rejeição já foi implementado por
  `add-coach-suggestion-decision-audit` (arquivada 2026-10-09) — campo `rejectionReason` +
  `RejeitarSugestaoRequestDto`. Esta change não precisa fazê-lo; só preservar o campo existente
  (a migration é aditiva).
- ✅ **Resolvido (founder, 2026-10-21):** implementar agora, sem esperar janela de uso. A métrica
  de sucesso passa a ser interpretável assim que esta change estiver em produção junto das duas
  anteriores.
