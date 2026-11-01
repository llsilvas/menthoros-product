# Design — add-fit-historico-lote-front

## Context

Rascunho adiado (ver `proposal.md`, Status). Este documento fixa **como** construir a tela quando o
gatilho disparar, para quem implementar não ter que redescobrir os padrões do front. Tudo o que
está aqui já existe no repo em 2026-11-01; o componente novo consome, não inventa.

Canvas com os três estados: https://claude.ai/artifact/G5CMiZCkAoKntc698ZtMfb (cores aproximadas,
não os tokens reais; a implementação usa os tokens abaixo).

## Goals / Non-Goals

**Goals:**
- Dialog único, aberto de dois lugares, que encapsula seleção, fila e resumo.
- Reaproveitar `CoachDialog`, tokens e componentes compartilhados sem estilo paralelo.
- Lógica em hook e adapter puro; o componente só renderiza.

**Non-Goals:**
- Componente de upload genérico para outras telas.
- Tela própria (rota) para a importação.
- Mobile dedicado (a seleção de muitos arquivos em celular é improvável).

## Decisões

### D1 — Dialog sobre `CoachDialog`, não card no perfil

`FitHistoricoDialog` em `features/coach/components/`, sobre `shared/components/CoachDialog.tsx`
(props: `title`, `subtitle`, `chip`, `maxWidth="md"`, `disableClose`, `actions`, `actionsHint`,
`dividers`, `contentSx`). A ação é de onboarding, uma vez por atleta; um `SectionCard` no perfil
ficaria vazio depois e o perfil já tem dez cards. Análogos a copiar na estrutura:
`components/features/planos/BatchPlanDialog.tsx` e `EncerrarLoteDialog.tsx` (operação em lote com
resultado por item) e `components/features/atleta/AtletaDialog.tsx` (`disableClose` enquanto salva).

### D2 — Dois pontos de entrada, um estado

- `CoachAthletesPage`: `RosterActionType` ganha `'fit-historico'`; item no `getActions` da coluna
  `actions`, com `GridActionsCellItem` e `showInMenu`, entre "Sincronizar Strava" e "Projeção de
  prova". Ao fechar após importar, `fetchRoster()`.
- `CoachAthleteProfilePage`: `Button size="small" startIcon` no bloco `ml: 'auto'` do cabeçalho, ao
  lado de "Preencher onboarding", mesmo `sx={{ color: surface[400] }}`. Ao fechar após importar,
  `fetchProfile()`.

O dialog recebe `atletaId`, `atletaNome`, `open`, `onClose(importouAlgo: boolean)`.

### D3 — Hook, adapter e serviço

- **Serviço:** novo método em `src/api/services/FitUploadService.ts`, ao lado de `importar(arquivo)`:
  `importarParaAtleta(atletaId: string, arquivo: File): CancelablePromise<TreinoRealizadoDto>` com
  `url: '/api/v1/coach/atletas/{atletaId}/treinos/importar-fit'`, `formData: { arquivo }` e `errors`
  `403/404/422`. Portado à mão (cliente curado; `generate:api` só como referência).
- **Hook:** `useImportarHistoricoFit(atletaId)` em `features/coach/hooks/`, no formato de
  `useAtletas` (`useState` + `useCallback`, expõe `loading` e `error`). Estado: lista de itens
  `{ arquivo, status: 'PENDENTE'|'ENVIANDO'|'IMPORTADO'|'JA_EXISTIA'|'ERRO', motivo?, treino? }`,
  índice atual, `cancelado`. Fila `for ... await` sequencial; `201` → `IMPORTADO`, `200` →
  `JA_EXISTIA`, `ApiError 422` → `ERRO` "Arquivo .fit inválido", `404` → "Atleta não encontrado",
  rede → "Falha de conexão". Cancelar seta a flag; o loop sai após o `await` corrente. Retentativa
  refaz a fila só com os `ERRO`. Estimativa de tempo = média dos concluídos × restantes.
- **Adapter:** `buildFitImportSummary(itens)` em `features/coach/adapters/`, função pura:
  contagens, lista de erros e período coberto (`dataTreino` mais antiga e mais recente, semanas).
  Reaproveita `features/athlete/adapters/fitUploadResultAdapter.ts` (`buildFitUploadPreview`) para
  o preview de cada treino. Nome no padrão `buildXxxFromYyy`.

### D4 — Componentes e tokens, por estado

| Elemento da tela | Componente / token |
|---|---|
| Casca, título, chip "Histórico", ações | `CoachDialog` |
| Aviso de autorização e "sem desfazer" | `Alert severity="warning"` do MUI, cor via tema (sem hex) |
| Drop zone | `Box` com `border: 2px dashed` em `content.cardBorder`, `radius` de `shared/design-tokens/density.ts`; `<input type="file" accept=".fit" multiple>` com `<label>` |
| Lista de arquivos (pré-voo, progresso, erros) | `Card variant="flat"` de `shared/components/Card.tsx` como contêiner; linhas com `Typography` |
| Status por arquivo | `StatusBadge` (`variant` + `label`, `size="sm"`), texto sempre junto da cor |
| Contadores (importados, já existiam, com erro) | `KPICard` ou `MetricCell` de `shared/components/` |
| Barra de progresso | `LinearProgress variant="determinate"` do MUI, `aria-label` |
| Selo "≥ 6 semanas" | `StatusBadge` |
| Botões | `PRIMARY_BTN_SX` e `GHOST_BTN_SX` de `shared/components/actionButtonSx.ts` |
| Confirmar "Cancelar restante" | `ConfirmDialog` de `shared/components/` |
| Cores de texto e superfície | `surface`, `content`, `text` de `theme/tokens.ts`; `colors`, `elevation` de `shared/design-tokens/` |

Proibições que o lint pega: hex/rgb/hsl literal fora da camada de tokens (`no-restricted-syntax`
em `eslint.config.js`). Políticas que o lint não pega, em `shared/design-tokens/forbidden-uses.ts`:
lime só em brand/primary-action; `semantic.info` nunca em brand/hero. Spec canônica:
`menthoros-product/openspec/specs/design-system/spec.md` (`radius` único, `Card` compartilhado).

### D5 — Regras do `CLAUDE.md` do front que valem aqui

- Componente só apresentação; dados e fila no hook; transformação no adapter.
- Estados `loading`, `empty` e `error` renderizados sempre.
- Sem `any`; `interface FitHistoricoDialogProps` explícita.
- Nada interativo dentro de `FormControlLabel` (não se aplica ao `<label>` da drop zone, que
  envolve só o `<input type="file">`).
- Copy PT-BR; nomes de arquivo, componente, hook e tipos em inglês; valores de status técnico em
  inglês (`'PENDENTE'` aqui é domínio, mantém PT-BR como `'ATRASADO'`).
- Links internos com `RouterLink` + `ROUTES`, nunca `href` absoluto ("Ver treinos do atleta" vai ao
  perfil).
- Teste de componente com Testing Library; E2E obrigatório (entrada de dados que alimenta o motor).

### D6 — Gate

`/qa` roda o `frontend-reviewer` contra o `CLAUDE.md`; `npm run lint` falha em hex literal;
`src/theme/limeDiscipline.test.ts` audita o lime.

## Riscos / Trade-offs

- **Tempo por arquivo desconhecido** → depende da task 1.3 de `add-fit-historico-lote`. Acima de
  ~1 s, a estimativa de tempo e o cancelamento deixam de ser detalhe.
- **Fechar o navegador no meio da fila** → o que entrou fica (idempotente no reenvio). O
  `disableClose` só cobre o dialog; `beforeunload` é non-goal.
- **Período estimado pelos nomes** → só funciona se o nome do arquivo trouxer data. Sem isso, o
  pré-voo mostra contagem e tamanho; o período real vem do resumo.
- **`CancelablePromise`** → o cliente já cancela a requisição em voo; o hook pode usar isso em
  "Cancelar restante" em vez de esperar o arquivo atual, se o IT mostrar arquivos lentos.

## Open Questions

- `KPICard` ou `MetricCell` para os contadores? Decidir pela densidade visual na implementação.
- O item do menu "Ações" deve ficar escondido para atleta sem e-mail/convite? Hoje não há regra
  parecida nos outros itens; manter visível.
