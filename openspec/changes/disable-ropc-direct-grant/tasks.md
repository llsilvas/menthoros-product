# Tasks — disable-ropc-direct-grant (S · Full · infra)

> Escopo: `menthoros-infra` (`keycloak/menthoros-realm.json`). **Zero diff em `apps/`** — o código já
> está migrado (PRs front #54 e #55). O que falta é provedor, não aplicação.
>
> Alvos: **HomeLab** e **Railway `develop`**. Produção não existe (`SPRINTS.md:291`).
>
> Validação: o próprio Keycloak, exercitado por requisição. Não há suíte automatizada cobrindo
> configuração de realm.
>
> ⚠️ **Acesso admin aos dois Keycloaks é pré-condição de tudo a partir da seção 3.** Foi o gargalo
> que travou a change original.

## 0. Pré-corte — levantamento

- [ ] 0.1 **Responder Q1: alguém usa o password grant do `menthoros-web` fora do Apidog?** Script,
      job agendado, integração antiga, coleção de outro dev. O corte é o momento em que isso aparece,
      e aparece quebrando.
      *verify:* levantamento registrado no proposal, ainda que a resposta seja "ninguém".
- [ ] 0.2 **Decidir Q2: o `menthoros-api` recebe `pkce.code.challenge.method: S256` junto?** Ele já
      está com `directAccessGrants: false`, mas sem o atributo de PKCE — mesma lacuna, client vizinho.
      *verify:* decisão registrada no proposal; se entrar, vira parte da task 3.1.
- [ ] 0.3 **Confirmar acesso admin aos dois Keycloaks** antes de tocar em qualquer coisa. O acesso ao
      Railway foi exercitado em 2026-08-05 (upgrade para 26.7.0); o do HomeLab, pelo `sync-realm.sh`.
      *verify:* login admin bem-sucedido nos dois.

## 1. Sync do realm — sem o corte

> Separado de propósito: o sync de 2026-08-04 revelou drift real entre arquivo e servidor. Misturar
> "o realm mudou" com "a segurança mudou" torna qualquer quebra ambígua.

- [ ] 1.1 Rodar `sync-realm.sh` contra o **HomeLab**, com o realm **ainda sem o corte**, e registrar
      o que mudou. Isso reconcilia drift e leva o client `menthoros-test`, que já está no arquivo
      versionado.
      ⚠️ **Conferir o alvo no `.env.sync` antes de rodar** — o script aplica em quem estiver lá, sem
      pedir confirmação.
      *verify:* sync sem erro; diff do que mudou registrado.
- [ ] 1.2 Mesmo sync contra o **Railway `develop`**.
      *verify:* `menthoros-test` presente no realm do Railway, confirmado pela Admin API.

## 2. Saída de emergência — antes de fechar a porta

> Validar a alternativa **depois** do corte é descobrir que ela não funciona quando a original já
> morreu.

- [ ] 2.1 Obter token pelo `menthoros-test` **nos dois alvos** e confirmar que o token nasce com
      `tenant_id` (o scope `organization` é DEFAULT nesse client, justamente para isso).
      *verify:* token emitido e claim de tenant presente, nos dois ambientes.
- [ ] 2.2 Trocar o `client_id` na configuração do Apidog para `menthoros-test` e exercitar uma
      requisição autenticada de verdade.
      *verify:* requisição autenticada respondendo `200`, não `403` — o erro mais caro deste ambiente
      é o login parecer bem-sucedido e tudo devolver 403.
- [ ] 2.3 Comunicar a troca de `client_id` a quem usa o teste manual (CA5).

## 3. O corte

- [ ] 3.1 No `menthoros-realm.json`, client `menthoros-web` **e só nele**:
      `directAccessGrantsEnabled: false` + `attributes["pkce.code.challenge.method"] = "S256"`.
      ⚠️ **Não tocar no `menthoros-test`** (o direct grant dele é proposital) nem no `menthoros-api`,
      salvo decisão da 0.2.
      *verify:* diff do arquivo mostrando exatamente dois clients afetados — ou um, conforme a 0.2.
- [ ] 3.2 Abrir PR no `menthoros-infra` e revisar **antes** de qualquer servidor mudar. O
      `sync-realm.sh` aplica o JSON cegamente; o PR é a única revisão que existe entre o arquivo e o
      provedor de identidade.

## 4. Aplicação no HomeLab

- [ ] 4.1 `sync-realm.sh` contra o HomeLab, agora com o corte.
      ⚠️ **A partir daqui o rollback deixa de ser barato** — deixa de ser reverter o frontend e passa
      a ser reverter configuração de IdP, com acesso admin, sob pressão.
- [ ] 4.2 **CA1:** tentar `grant_type=password` no `menthoros-web` com credenciais que funcionavam
      antes.
      *verify:* Keycloak **recusa**. Ler a configuração no console não vale — o que importa é o
      provedor recusando.
- [ ] 4.3 **CA2:** login completo pelo app — mesmo redirect, mesma sessão, mesmo destino.
- [ ] 4.4 **CA4:** tentar autorizar sem `code_challenge`.
      *verify:* Keycloak recusa. Sem isso o PKCE segue opcional no servidor.
- [ ] 4.5 **CA3:** exercitar a criação real de organização pelo backend contra o HomeLab, **e** rodar
      `KeycloakOrganizationGatewayImplTest`.
      *verify:* organização criada de fato e teste verde. O teste é unitário e não prova o provedor —
      por isso os dois.

## 5. Aplicação no Railway `develop`

- [ ] 5.1 `sync-realm.sh` contra o Railway, com o corte. Só depois da seção 4 inteira verde.
- [ ] 5.2 Repetir 4.2 a 4.5 contra o Railway. Ter passado no HomeLab não é evidência para o Railway —
      são servidores diferentes, e o drift entre eles já apareceu antes.

## 6. Fechamento

- [ ] 6.1 Registrar o **rollback** no README do `menthoros-infra`: `directAccessGrantsEnabled: true` +
      sync devolve o grant; remover `pkce.code.challenge.method` reverte só o PKCE. São reversíveis
      de forma independente.
- [ ] 6.2 Atualizar o `SPRINTS.md`: a linha "🔴 Corte do ROPC" do Bloco 3 passa a apontar para esta
      change, e a pendência herdada da `migrate-login-to-authorization-code-pkce` fica encerrada.
- [ ] 6.3 Registrar que **produção não requer ação** — quando a infra nascer, aplica o realm
      versionado já com o corte.
