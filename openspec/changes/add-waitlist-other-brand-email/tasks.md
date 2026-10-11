## 1. Templates do e-mail `OTHER_BRAND`

- [x] 1.1 Criar `src/main/resources/templates/email/waitlist-confirmation-other-brand.html` e
      `.txt`, clonando a estrutura de `waitlist-confirmation-treinador.{html,txt}` (cabeçalho com
      logo via `assetsUrl`, corpo, assinatura). Texto: reconhece a limitação (hoje só Garmin) e
      promete aviso quando a marca do lead entrar. Variáveis: `nome`, `assetsUrl` (mesmas de
      `valoresBase`, sem variável nova).
      Validação: `./mvnw clean test` (nenhum teste quebra — templates novos não são referenciados
      ainda).

## 2. Bifurcação por segmento no listener

- [x] 2.1 Em `WaitlistNotificationListener`, adicionar `SUBJECT_OTHER_BRAND` e um método
      `mensagemOutraMarca(Waitlist lead)` análogo a `mensagemTreinador`, renderizando o novo par
      de template.
- [x] 2.2 Em `enviarConfirmacao`, para `lead.isTreinadorOuProprietario()`, bifurcar por
      `WaitlistSegment.derivar(lead.getPerfil(), lead.getWatchBrand())`: `OTHER_BRAND` →
      `mensagemOutraMarca`, qualquer outro valor → `mensagemTreinador` (comportamento atual
      preservado para `QUALIFIED`).
      Validação: `./mvnw clean test`.

## 3. Testes

- [x] 3.1 `WaitlistNotificationListenerTest`: caso novo — lead `TREINADOR`/`PROPRIETARIO` com
      `watchBrand` não-Garmin recebe o template `OTHER_BRAND`, não o de `QUALIFIED`.
- [x] 3.2 Confirmar que os casos existentes (`QUALIFIED` com `watchBrand=GARMIN`, `ATLETA` com
      qualquer `watchBrand`) continuam passando sem alteração — nenhuma regressão de assinatura de
      teste esperada. **Ajuste descoberto na implementação:** o fixture `lead(PerfilWaitlist)`
      não setava `watchBrand`, e `WaitlistSegment.derivar` já tratava `null` como `OTHER_BRAND`
      (regra pré-existente de BE-01) — os testes existentes passaram a cair no branch novo até o
      fixture ser corrigido para `GARMIN` por padrão.
      Validação: `./mvnw clean verify` — 219 testes, 0 falhas (backend completo: 4537 unit + 219
      IT, 0 falhas).

## 4. Fechamento

- [x] 4.1 Atualizar `instagram-conversao-specs-backend.md`: marcar BE-05 como entregue (`[x]`),
      removendo a nota "Faltando: terceiro segmento".
- [ ] 4.2 `./mvnw clean verify` final, commit, PR, `/done`.
