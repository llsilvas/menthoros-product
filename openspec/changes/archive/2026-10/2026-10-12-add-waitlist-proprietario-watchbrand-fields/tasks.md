# Tasks — add-waitlist-proprietario-watchbrand-fields

Repo: `apps/menthoros-front`. Validação padrão de cada bloco: `npm run lint && npm run build &&
npm run test:run` (bloco final roda os três).

## 1. Tipos e validação

- [x] 1.1 `src/types/Waitlist.ts`: `PerfilWaitlist` ganha `'PROPRIETARIO'`; novo union type
      `WatchBrand` (`'GARMIN' | 'COROS' | 'POLAR' | 'APPLE' | 'OTHER' | 'UNKNOWN'`); `WaitlistInput`
      ganha `watchBrand?: WatchBrand`; `WaitlistResult` ganha `segment?: 'ATLETA' | 'QUALIFIED' |
      'OTHER_BRAND'`.
- [x] 1.2 Helper `isTreinadorOuProprietario(perfil: PerfilWaitlist | '')` — ficou em
      `src/types/Waitlist.ts` (mesmo vocabulário do backend `PerfilWaitlist.isTreinadorOuProprietario`).
- [x] 1.3 `accessFormValidation.ts`: condição de `qtdAtletas` passa de `perfil === "TREINADOR"`
      para `isTreinadorOuProprietario(perfil)`. Teste novo em `accessFormValidation.test.ts`
      cobrindo `PROPRIETARIO` com o mesmo comportamento de `TREINADOR`.

## 2. Formulário

- [x] 2.1 `AccessRequestForm.tsx`: nova opção `<option value="PROPRIETARIO">Dono de
      assessoria</option>` no select "Você é".
- [x] 2.2 Campo "Número de atletas" (condicional) e o `qtdAtletas` do payload passam a usar
      `isTreinadorOuProprietario(perfil)` em vez de `perfil === "TREINADOR"`.
- [x] 2.3 Novo campo "Relógio predominante dos atletas" (`NativeSelect`, mesmo padrão visual dos
      campos existentes), visível quando `isTreinadorOuProprietario(perfil)`. Opções: Garmin,
      Coros, Polar, Apple, Outra, Não sei — "Não sei"/sem seleção não envia `watchBrand` no
      payload (ver proposal "Open Questions").
- [x] 2.4 Remover o comentário do componente que lista os dois campos como "fora do escopo" (não
      é mais verdade).
- [x] 2.5 Testes novos em `AccessRequestForm.test.tsx`: opção "Dono de assessoria" exige "Número
      de atletas"; campo de relógio aparece para TREINADOR/PROPRIETARIO e não para ATLETA; envio
      sem relógio selecionado funciona sem erro.

## 3. Tela de sucesso por segmento

- [x] 3.1 `useWaitlist.ts`: `inscrever` passa a guardar o `segment` do `WaitlistResult` retornado
      por `WaitlistService.inscrever`, em vez de descartar a resposta.
- [x] 3.2 `content.ts`: nova entrada `accessSuccess.outraMarca` (texto reconhecendo a limitação —
      hoje só Garmin — e prometendo aviso quando a marca entrar).
- [x] 3.3 `AccessRequestForm.tsx`: ao decidir `sucesso` no bloco `status === "success"`, bifurca por
      `segment` quando `perfilEnviado` é treinador/proprietário: `OTHER_BRAND` → `outraMarca`,
      senão `treinador` (comportamento atual). `ATLETA` não muda.
- [x] 3.4 Teste novo em `AccessRequestForm.test.tsx`: lead treinador/proprietário com resposta
      `segment: "OTHER_BRAND"` mostra o texto `outraMarca`, não o genérico.

## 4. Fechamento

- [x] 4.1 `npm run lint && npm run build && npm run test:run` completo: 234 arquivos, 2030 testes,
      0 falhas, sem regressão nos testes existentes de `AccessRequestForm`/`accessFormValidation`.
- [x] 4.1b QA gate: `frontend-reviewer` + `clean-code-reviewer` (Claude) + Codex review cross-model.
      2 achados Important (Claude) corrigidos: tela de sucesso passou a decidir primeiro por
      `segment` (fonte de verdade do backend), com `perfilEnviado` só no fallback sem `segment`;
      comentário desatualizado em `content.ts` removido. 2 achados de duplicação/design corrigidos:
      `buildWaitlistPayload`/`resolveSuccessContent` extraídos como funções puras testáveis
      (`accessFormValidation.ts`), `preencherCamposBasicos` extraído no teste do componente.
      Codex deu NO-GO por falta de E2E no novo fluxo (`tests/e2e/landing/acesso.spec.ts` já é
      obrigatório para este formulário — gate de consentimento LGPD — e não cobria
      `PROPRIETARIO`/`watchBrand`/segmento `OTHER_BRAND`); corrigido com um cenário novo
      (proprietário + relógio + confirmação de outra marca), 4/4 specs verdes.
- [x] 4.2 Checklist atualizado: FE-02 e FE-05 marcadas `[x]` **Entregue** em
      `instagram-conversao-specs-frontend.md`, com nota removendo o bloqueio "depende do backend"
      (já resolvido desde BE-01).
