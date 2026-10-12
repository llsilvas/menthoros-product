# Tasks — add-waitlist-proprietario-watchbrand-fields

Repo: `apps/menthoros-front`. Validação padrão de cada bloco: `npm run lint && npm run build &&
npm run test:run` (bloco final roda os três).

## 1. Tipos e validação

- [ ] 1.1 `src/types/Waitlist.ts`: `PerfilWaitlist` ganha `'PROPRIETARIO'`; novo union type
      `WatchBrand` (`'GARMIN' | 'COROS' | 'POLAR' | 'APPLE' | 'OTHER' | 'UNKNOWN'`); `WaitlistInput`
      ganha `watchBrand?: WatchBrand`; `WaitlistResult` ganha `segment?: 'ATLETA' | 'QUALIFIED' |
      'OTHER_BRAND'`.
- [ ] 1.2 Helper `isTreinadorOuProprietario(perfil: PerfilWaitlist | '')` — local em
      `accessFormValidation.ts` ou `src/types/Waitlist.ts` (decidir no código, mesmo vocabulário do
      backend `PerfilWaitlist.isTreinadorOuProprietario`).
- [ ] 1.3 `accessFormValidation.ts`: condição de `qtdAtletas` passa de `perfil === "TREINADOR"`
      para `isTreinadorOuProprietario(perfil)`. Teste novo em `accessFormValidation.test.ts`
      cobrindo `PROPRIETARIO` com o mesmo comportamento de `TREINADOR`.

## 2. Formulário

- [ ] 2.1 `AccessRequestForm.tsx`: nova opção `<option value="PROPRIETARIO">Dono de
      assessoria</option>` no select "Você é".
- [ ] 2.2 Campo "Número de atletas" (condicional) e o `qtdAtletas` do payload passam a usar
      `isTreinadorOuProprietario(perfil)` em vez de `perfil === "TREINADOR"`.
- [ ] 2.3 Novo campo "Relógio predominante dos atletas" (`NativeSelect`, mesmo padrão visual dos
      campos existentes), visível quando `isTreinadorOuProprietario(perfil)`. Opções: Garmin,
      Coros, Polar, Apple, Outra, Não sei — "Não sei"/sem seleção não envia `watchBrand` no
      payload (ver proposal "Open Questions").
- [ ] 2.4 Remover o comentário do componente que lista os dois campos como "fora do escopo" (não
      é mais verdade).
- [ ] 2.5 Testes novos em `AccessRequestForm.test.tsx`: opção "Dono de assessoria" exige "Número
      de atletas"; campo de relógio aparece para TREINADOR/PROPRIETARIO e não para ATLETA; envio
      sem relógio selecionado funciona sem erro.

## 3. Tela de sucesso por segmento

- [ ] 3.1 `useWaitlist.ts`: `inscrever` passa a guardar o `WaitlistResult` (ou extrair e expor
      `segment`) retornado por `WaitlistService.inscrever`, em vez de descartar a resposta.
- [ ] 3.2 `content.ts`: nova entrada `accessSuccess.outraMarca` (texto reconhecendo a limitação —
      hoje só Garmin — e prometendo aviso quando a marca entrar).
- [ ] 3.3 `AccessRequestForm.tsx`: ao decidir `sucesso` no bloco `status === "success"`, bifurca por
      `segment` quando `perfilEnviado` é treinador/proprietário: `OTHER_BRAND` → `outraMarca`,
      senão `treinador` (comportamento atual). `ATLETA` não muda.
- [ ] 3.4 Teste novo em `AccessRequestForm.test.tsx`: lead treinador/proprietário com resposta
      `segment: "OTHER_BRAND"` mostra o texto `outraMarca`, não o genérico.

## 4. Fechamento

- [ ] 4.1 `npm run lint && npm run build && npm run test:run` completo, 0 falhas, sem regressão nos
      testes existentes de `AccessRequestForm`/`accessFormValidation`.
- [ ] 4.2 Checklist atualizado: FE-02 e FE-05 marcadas `[x]` **Entregue** em
      `instagram-conversao-specs-frontend.md`, com nota removendo o bloqueio "depende do backend"
      (já resolvido desde BE-01).
