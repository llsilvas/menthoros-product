**Tamanho:** S · **Trilha:** Fast

## Why

`add-founders-slots-endpoint` (backend PR #173) já entrega `GET /api/v1/founders/slots` como fonte
única de vagas da turma fundadora. O frontend continua lendo de `VAGAS_PROGRAMA_FUNDADOR = 10`, uma
constante estática em `src/landing/content.ts` — o problema original (bio do Instagram "4", post
fixado "10", site "10") volta a existir no momento em que o founder emitir convites e o número real
divergir do hardcoded. Falta só consumir o endpoint que já existe.

Origem: FE-04 da análise de conversão do Instagram
(`menthoros-product/artifacts/instagram-conversao-specs-frontend.md`).

## What Changes

Somente `apps/menthoros-front`. Sem mudança de contrato (consome um GET público já existente).

- `FoundersSlotsService.ts` (`src/services/`) — wrapper fino sobre `GET /api/v1/founders/slots`,
  mesmo padrão de `WaitlistService.ts`.
- `useFoundersSlots()` (`src/hooks/`) — busca uma vez no mount (`useEffect`, guard de cancelamento,
  mesmo padrão de `useLogoAssessoria.ts`), expõe `{ data, loading, error }`. Sem polling: o cache de
  ~30s do backend já mantém o dado razoavelmente fresco, e a página não fica aberta horas a fio.
- Dois pontos de exibição passam a ler o dado ao vivo em vez da constante estática:
  - `FounderOfferCard` (home, `sections.tsx`) — badge "Programa fundador · N vagas".
  - Cabeçalho do formulário em `/waitlist` (`WaitlistPage.tsx`) — "Turma fundadora — N vagas".
- Função pura `foundersSlotsLabel(state)` (`src/landing/foundersSlotsCopy.ts`) centraliza a regra de
  texto por estado, reutilizada pelos dois pontos acima:
  - Carregando ou falha do endpoint: **sem número** — "Programa fundador" / "Turma fundadora", sem
    sugerir um valor que pode estar errado.
  - Vagas abertas (`open: true`): "Programa fundador · Restam N de T vagas" / "Turma fundadora —
    Restam N de T vagas".
  - Vagas esgotadas (`open: false`): "Lista de espera — próxima turma", nos dois lugares. O
    formulário continua ativo (nenhuma mudança no `AccessRequestForm` em si — só o texto ao redor).

## Non-Goals

- Não troca as menções narrativas ao número de vagas em prosa corrida — `hero.scarcity`
  ("10 vagas do programa fundador · 60 dias grátis"), `finalCta.sub`, a resposta do FAQ "Quanto
  custa?" e a linha de rodapé do `AccessRequestForm` ("... N vagas no programa fundador") continuam
  lendo a constante estática `VAGAS_PROGRAMA_FUNDADOR`. São menções incidentais dentro de frases
  maiores, não o "contador" que a spec original tinha em mente — refazer essas frases para
  acomodar `N de T` dinâmico em cada uma é um trabalho de copy maior, de retorno bem menor que os
  dois pontos de decisão (badge da home, cabeçalho do formulário). Pode virar follow-up se o founder
  quiser esses textos também dinâmicos.
- Não implementa polling/atualização em tempo real — busca uma vez por carregamento de página.
- Não bloqueia o envio do formulário quando `open: false` — a spec original já pedia isso
  explicitamente ("manter o formulário ativo").

## Critérios de aceite

1. **Vagas abertas** — Given o endpoint retorna `{total:10, taken:3, remaining:7, open:true}`, When
   a home ou `/waitlist` carrega, Then o badge/cabeçalho mostra "Restam 7 de 10 vagas".
2. **Vagas esgotadas** — Given `{remaining:0, open:false}`, Then o texto vira "Lista de espera —
   próxima turma" nos dois lugares, e o formulário continua recebendo envios normalmente.
3. **Falha do endpoint** — Given a requisição falha (rede, 5xx), Then o texto exibido é "Programa
   fundador" / "Turma fundadora", sem nenhum número — nunca um valor antigo ou inventado.
4. **Sem flash de número errado** — Given a página acabou de carregar e a resposta ainda não
   chegou, Then o texto também aparece sem número (mesmo tratamento do estado de falha), nunca o
   "10" estático por um instante antes de trocar.
5. **Regressão** — `npm run lint && npm run build && npm run test:run` passam; os testes existentes
   de `WaitlistPage.test.tsx`/`sections` continuam verdes (ajustados se a estrutura do texto mudar).

## Métrica de sucesso

Proxy mecânico: os 5 critérios acima, cobertos por teste de componente com `fetch` mockado nos três
estados (sucesso aberto, sucesso esgotado, falha). Métrica de produto real (nenhuma divergência
entre o que o site mostra e o que o founder realmente convidou) só é observável em produção, depois
do founder emitir o próximo convite.

## Open Questions & Assumptions

- **Premissa:** o endpoint não exige tratamento de CORS/tenant especial — já está em
  `app.public-paths` no backend, mesmo padrão de `/api/v1/waitlist`, que o front já consome sem
  problema.
- **Premissa:** "Lista de espera — próxima turma" é o texto aprovado para o estado esgotado — não
  foi validado com o founder; é uma tradução direta da intenção da spec original ("Entrar na lista
  da próxima turma"). Ajustar com uma revisão de copy se o founder preferir outra redação, sem
  precisar reabrir a change (é uma constante de texto).
