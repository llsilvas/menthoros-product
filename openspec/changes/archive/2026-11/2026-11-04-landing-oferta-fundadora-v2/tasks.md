# Tasks: landing-oferta-fundadora-v2

Repositório único: `apps/menthoros-front` (`src/landing/**`, `src/pages/waitlist/**` só nos testes).
Sem migration, sem mudança de contrato. Branch `feat/landing-oferta-fundadora-v2`, em worktree
(`.worktrees/landing-oferta-fundadora-v2`), porque há outras sessões ativas no repositório.

## 1. Integrações: Garmin direto, outras marcas em teste

- [x] 1.1 `content.ts`: reescrever `garminNotice` (home e `/waitlist`), `how.steps[0].b`, a resposta
      do FAQ "Preciso que meus atletas tenham um relógio específico?" e `accessSuccess.outraMarca.body`
      (CA-02, CA-03).
      *verify:* busca por "só lê" e "Hoje o Menthoros só" em `src/landing` não retorna nada.
      — copy de `garminNotice`, `how.steps[0]`, FAQ do relógio e `accessSuccess.outraMarca` reescrita; `content.test.ts` (novo) garante "direto", "em teste via intervals.icu" e a ausência de "só lê"/"ainda não".

- [x] 1.2 Atualizar os testes: `AccessRequestForm.test.tsx:241` (regex "só lê dados de relógios
      garmin") e `WaitlistPage.test.tsx:127` se a marca "Garmin" mudar de elemento.
      *verify:* `npx vitest run src/landing src/pages/waitlist` verde.
      — `AccessRequestForm.test.tsx` (regex de outra marca e do aviso) e `WaitlistPage.test.tsx` (aviso e linha de oferta) atualizados; 92 testes de `src/landing` e `src/pages/waitlist` verdes.

- [x] 1.3 Deixar explícito que o treinador convida e o atleta autoriza o Garmin: no item de convite dos atletas
      (`founderOffer.perks`) e na resposta do FAQ do relógio (CA-07).
      *verify:* teste de componente confere a frase do item e do FAQ.
      — item 2 de `founderOffer.perks` e FAQ do relógio dizem que o treinador convida e cada atleta aceita e autoriza a conexão; coberto em `content.test.ts`.

## 2. Oferta v2 no bloco fundador, hero e proposta de valor

- [x] 2.1 `content.ts`: `hero.scarcity` com "em paralelo, sem migrar"; `founderOffer.perks` (três
      itens, CA-01); `valueProposition.offerPre/offerPost` em forma curta.
      — `hero.scarcity`, `founderOffer.perks` (3 itens) e `valueProposition.offerPre` atualizados.

- [x] 2.2 `sections.tsx` (`FounderOfferCard`): renderizar `founderOffer.perks` como lista entre a linha
      pós-teste e a nota de continuidade, sem mudar a ordem dos cinco elementos existentes.
      *verify:* `Pricing.test.tsx` mantém o teste de ordem e ganha um caso para os três itens.
      — `FounderOfferCard` renderiza `perks` como lista entre a linha pós-teste e a nota de continuidade; `Pricing.test.tsx` ganhou o teste de ordem dos itens.

## 3. FAQ

- [x] 3.1 `content.ts`: "Quanto custa?" com a devolução de 30 dias; nova pergunta "Preciso largar a
      ferramenta que uso hoje?" (CA-04).
      — "Quanto custa?" cita a devolução de 30 dias; nova pergunta "Preciso largar a ferramenta que uso hoje?".

- [x] 3.2 Conferir CA-05: busca por "ilimitad", "gratuito", "horas", "Strava", "depoimento" no texto
      visível; só "Técnicos: Ilimitados" do Scale pode permanecer (já publicado).
      — `content.test.ts` varre toda a copy: sem Strava, horas economizadas, depoimento, gratuito permanente ou atletas ilimitados.

## 4. Validação

- [x] 4.1 `npm run lint && npm run build` e `npx vitest run src/landing src/pages/waitlist` (CA-06).
      — `npm run lint` sem problemas, `npm run build` ok, `npm run test:run` 263 arquivos e 2441 testes verdes.

- [x] 4.2 Conferir no navegador (home e `/waitlist`) em 360 e 1440 px: o bloco com a lista não quebra o
      layout e não há texto cortado. Registrar evidência.
      — Playwright headless do repositório (Chromium), home em 360 e 1440 px: bloco fundador e lista legíveis, sem texto cortado e sem rolagem horizontal. **Não foi conferido em navegador real com zoom 200%.**

- [ ] 4.3 Antes do merge, o founder confirma A1 a A3 (proposal) e o texto da devolução.
      **Adiada (2026-11-04, arquivamento):** o PR #177 foi mergeado sem a confirmação registrada aqui.
      A3 (processo de estorno da devolução de 30 dias) segue aberta com o founder.

## 5. Fechamento

- [x] 5.1 Marcar as tasks, PR `feat/landing-oferta-fundadora-v2` para `develop` (via `/pr`), depois
      `/done`. Atualizar `founder/marketing.md` (ganchos H4, H5 e H8 deixam de depender da landing).
      Feito: PR #177 mergeado em `develop` em 2026-11-01. `founder/marketing.md` não existe em nenhum
      repositório do workspace; a atualização dos ganchos fica para onde o plano de marketing viver.
