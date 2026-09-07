# add-waitlist-utm-attribution — Atribuir signups da waitlist à origem (UTM) do marketing

**Tamanho:** S · **Trilha:** Fast
**Status:** proposta — aguardando DoR / `/implement init`
**Criado:** 2026-09-07

## Problema

A landing (`app.menthoros.com`) é o destino do link da bio do Instagram, mas **nenhum** signup da
waitlist carrega a origem do tráfego. O `AccessForm` (`src/landing/AccessForm.tsx`) monta o payload
de inscrição e o `WaitlistServiceImpl` grava `origem = "landing"` **hardcoded**
(`services/impl/WaitlistServiceImpl.java:27,68`). Como carrossel de feed não tem link clicável
(`clicks = 0` em todo post no Zernio) e `tb_waitlist` não tem coluna de origem, **não é possível
afirmar se o marketing converte** — a métrica primária de aquisição (signups por canal) simplesmente
não existe.

O custo é decidir campanha, boost e conteúdo no escuro. A turma fundadora (10 vagas) está sendo
lançada agora (post de fundadora agendado para 2026-09-08); sem atribuição, nem o boost desse post
vai poder mostrar retorno.

## Escopo

Capturar os parâmetros UTM do link da bio (`?utm_source=…&utm_campaign=…`) na inscrição da waitlist
e persistí-los em `tb_waitlist`, com leitura por SQL. Campos **aditivos e opcionais** — sem quebra
de contrato.

**repos:** `menthoros-backend`, `menthoros-frontend`

**inclui:**
1. Backend — migration adicionando `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`
   (nullable) a `tb_waitlist`; campos na entity `Waitlist`, no `WaitlistInputDto` (opcionais) e no
   `WaitlistServiceImpl` (grava null-safe).
2. Frontend — leitura dos parâmetros UTM de `window.location.search` (NÃO `useSearchParams` — o app
   usa `createHashRouter`, então a query fica **antes** do `#` e o react-router não a enxerga) e
   inclusão no payload do `AccessForm`.
3. Instrumentação — leitura por SQL (consistente com `convite-assessorias-fundadoras`), sem dashboard.

**exclui:**
- Atribuir o cadastro de coach/fundadora (`/cadastro` / `coach-signups`) — a fundadora entra por token, não por UTM.
- Capturar `referrer` ou qualquer tracking além dos 4 parâmetros UTM padrão.
- `utm_term` (palavra-chave de mídia paga — não usado hoje).
- Dashboard/admin de leitura da waitlist (SQL manual basta para ~dezenas de leads).

## Critérios de aceite

- **CA1 — UTM persistido.** Given `POST /api/v1/waitlist` com `utm_source=instagram` e
  `utm_campaign=turma-fundadora`, When registrado, Then a linha em `tb_waitlist` grava esses valores
  (e `utm_medium`/`utm_content` como enviados).
- **CA2 — Ausência de UTM não quebra.** Given um POST sem os campos UTM, When registrado, Then a
  linha nasce com as 4 colunas `NULL` e responde `201` como hoje (cliente antigo intocado).
- **CA3 — Front lê a query certa.** Given `app.menthoros.com/?utm_source=instagram&utm_campaign=turma-fundadora#/`,
  When o `AccessForm` envia, Then o payload inclui `utmSource=instagram` e `utmCampaign=turma-fundadora`.
- **CA4 — Hash router não engole o UTM.** Given o `createHashRouter`, When se captura os parâmetros,
  Then a leitura usa `window.location.search` (a query antes do `#`), não `useSearchParams`.
- **CA5 — Sem quebra de contrato.** Given um payload de cliente antigo (sem `utm*`), When `POST`,
  Then resposta `201`/`200` e validação idênticas às de hoje.

## Métrica de sucesso

- **Primária:** 100% dos signups vindos de um link com UTM gravam `utm_source`; passa a ser possível
  responder "quantos signups vieram do Instagram / da campanha turma-fundadora" com 1 query SQL.
- **Secundária:** o `clicks` do Zernio deixa de ser a única (e inútil) proxy — o link da bio vira
  mensurável de fato.

## Open Questions & Assumptions

1. **Valor de `origem`.** Mantém-se `origem = 'landing'` (não mexer) e os `utm_*` viram a fonte fina
   de atribuição. Alternativa (derivar `origem` de `utm_source`) fica de fora — `origem` é
   `VARCHAR(40)` e `utm_source` pode estourar.
2. **Persistência do UTM na navegação.** O `createHashRouter` não limpa `window.location.search` ao
   trocar de rota hash, então a query permanece disponível no submit. Se isso mudar com a futura
   migração para browser router (`migrate-hash-to-browser-router`), a captura precisa ser revista.
3. **Número da migration.** Último conhecido: **V90** (SPRINTS 2026-09-05). Confirmar contra o
   `develop` atual do backend no `/implement init` — esta change usa o próximo número (V91).

## Non-goals

- Atribuição no cadastro de coach/fundadora (token, não UTM).
- `referrer`, `utm_term`, eventos de analytics, dashboard.
- Migração hash→browser router (change própria, já no radar).

## Referências

- Backend: `WaitlistController.java` (`POST /api/v1/waitlist`), `WaitlistServiceImpl.java:27,68`
  (`ORIGEM_LANDING` hardcoded), `Waitlist.java`, `WaitlistInputDto.java`, `V43__Create_waitlist.sql`
  (coluna `origem`).
- Frontend: `src/landing/AccessForm.tsx` (monta o payload), `src/services/WaitlistService.ts`,
  `src/hooks/useWaitlist.ts`, `src/types/Waitlist.ts` (`WaitlistInput`), `src/App.tsx`
  (`createHashRouter`).
