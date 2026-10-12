**Tamanho:** S · **Trilha:** Fast

## Why

`AccessRequestForm.tsx` (FE-02, PR #152) só conhece dois valores de "Você é" — `TREINADOR` e
`ATLETA` — e não tem campo de relógio, porque na época `expand-waitlist-access-contract` (BE-01)
ainda não existia. O comentário no próprio componente já documenta isso como fora de escopo "por
dependerem de coordenação com o backend".

BE-01 (PR #177, já mergeado) entregou os três pedaços que faltavam no contrato:
`PerfilWaitlist.PROPRIETARIO`, `WatchBrand` (`GARMIN`/`COROS`/`POLAR`/`APPLE`/`OTHER`/`UNKNOWN`,
ambos opcionais em `WaitlistInputDto`) e `segment` (`QUALIFIED`/`OTHER_BRAND`/`ATLETA`, derivado em
`WaitlistOutputDto`). `add-waitlist-other-brand-email` (BE-05) já usa esse `segment` para escolher
o e-mail de confirmação certo. O front nunca envia os dois campos novos e nunca lê `segment` —
então todo lead treinador/proprietário é tratado como `QUALIFIED` no formulário, mesmo quando na
prática o backend classificaria como `OTHER_BRAND`.

Origem: FE-02 e FE-05 da análise de conversão do Instagram
(`menthoros-product/artifacts/instagram-conversao-specs-frontend.md`), ambas marcadas "Parcial" com
a mesma causa.

## What Changes

Somente `apps/menthoros-front`. Sem mudança de contrato — os três campos já existem no backend.

- **Tipos (`src/types/Waitlist.ts`):** `PerfilWaitlist` ganha `'PROPRIETARIO'`; `WaitlistInput`
  ganha `watchBrand?: WatchBrand` (novo union type, mesmos 6 valores do enum backend);
  `WaitlistResult` ganha `segment?: 'ATLETA' | 'QUALIFIED' | 'OTHER_BRAND'`.
- **`AccessRequestForm.tsx` — "Você é":** nova opção "Dono de assessoria" (`PROPRIETARIO`). Os dois
  pontos do form que hoje checam `perfil === "TREINADOR"` (campo "Número de atletas" e o `qtdAtletas`
  enviado no payload) passam a usar um helper `isTreinadorOuProprietario(perfil)` — mesmo
  vocabulário do backend (`PerfilWaitlist.isTreinadorOuProprietario`), para não duplicar a regra
  como dois `===` soltos que divergem depois.
- **`AccessRequestForm.tsx` — campo novo "Relógio predominante dos atletas":** `NativeSelect`
  visível quando `isTreinadorOuProprietario(perfil)`, mesmo padrão visual do campo "Você é".
  Opções: Garmin, Coros, Polar, Apple, Outra, Não sei (mapeando para `UNKNOWN`). **Opcional** — sem
  seleção, não envia `watchBrand` no payload (equivalente a `UNKNOWN` no backend, que já resolve
  para `OTHER_BRAND`); não há erro de validação novo.
- **`accessFormValidation.ts`:** ajusta a condição de `qtdAtletas` para `isTreinadorOuProprietario`
  em vez de `perfil === "TREINADOR"` (consistência com o form).
- **Tela de sucesso (`accessSuccess` em `content.ts` + `AccessRequestForm.tsx`):** nova variante
  `outraMarca` (reconhecendo a limitação — hoje só Garmin — e prometendo aviso quando a marca
  entrar), exibida quando `perfilEnviado` é treinador/proprietário **e** `WaitlistResult.segment ===
  'OTHER_BRAND'`. Mantém `treinador` (QUALIFIED) e `atleta` (ATLETA) como estão.
- **`useWaitlist.ts`:** passa a expor o `WaitlistResult` (ou só `segment`) retornado por
  `inscrever`, para o componente decidir a variante de sucesso — hoje o hook descarta a resposta.

## Non-Goals

- Não muda nada no backend — `watchBrand`/`segment`/`PROPRIETARIO` já existem desde BE-01.
- Não implementa FE-06 (conteúdo da home) nem FE-07 (SEO/analytics) — changes separadas.
- Não adiciona nova integração de relógio (Coros/Polar/Apple continuam não suportados) — o campo é
  só para medir demanda, mesma filosofia do `WatchBrand` do backend.
- Não revisita o texto da tela de sucesso `treinador`/`atleta` existentes.

## Critérios de aceite

1. **Novo perfil** — Given o usuário seleciona "Dono de assessoria" em "Você é", When envia o
   formulário, Then o payload traz `perfil: "PROPRIETARIO"` e o campo "Número de atletas" aparece e
   é exigido, igual a `TREINADOR`.
2. **Relógio opcional** — Given `perfil` é `TREINADOR` ou `PROPRIETARIO`, Then o campo "Relógio
   predominante dos atletas" aparece; Given o usuário não seleciona nada, Then o envio funciona sem
   erro de validação e sem `watchBrand` no payload.
3. **Variante de sucesso por segmento** — Given um lead treinador/proprietário cuja resposta traz
   `segment: "OTHER_BRAND"`, Then a tela de sucesso mostra o texto `outraMarca`, não o `treinador`
   genérico; Given `segment: "QUALIFIED"`, Then mostra o texto `treinador` atual; Given `ATLETA`
   (sem watchBrand), Then o comportamento de sucesso não muda.
4. **Sem regressão** — `npm run lint && npm run build && npm run test:run` verdes; testes
   existentes de `AccessRequestForm`/`accessFormValidation` continuam passando.

## Métrica de sucesso

Proxy mecânico: os 4 critérios acima cobertos por teste de componente/unidade (perfil novo, campo
condicional, variante de sucesso por segmento) — mesmo padrão dos testes já existentes de
`AccessRequestForm.test.tsx`/`accessFormValidation.test.ts`.

## Open Questions & Assumptions

- **Premissa:** opção "Não sei" no select de relógio mapeia para não enviar `watchBrand` (em vez de
  enviar `"UNKNOWN"` explicitamente) — efeito idêntico no backend (`WaitlistSegment.derivar` só
  distingue `GARMIN` de "qualquer outra coisa", e campo ausente e `UNKNOWN` resolvem igual para
  `OTHER_BRAND`), e evita introduzir um terceiro estado (selecionado "não sei" vs. não respondeu)
  que a tela de sucesso não precisa diferenciar.
- **Premissa:** rótulos do select não repetem os nomes técnicos do enum (`"Outra"` em vez de
  `"OTHER"`, `"Não sei"` em vez de `"UNKNOWN"`) — convenção de copy em PT-BR do form existente.
- **Pulado deliberadamente:** `product-reviewer` (lente do coach/North Star) não se aplica — mesma
  classificação de operação de crescimento pré-signup dada a `add-waitlist-other-brand-email`.
