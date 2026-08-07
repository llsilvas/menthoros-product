# Design — disable-ropc-direct-grant

**Criado:** 2026-08-05 · **Trilha:** Full

> A mudança são **dois atributos num client**. O design não existe para decidir *o quê* — existe para
> decidir *onde*, *em que ordem* e *como voltar atrás*, porque é aí que uma change de duas linhas
> derruba a autenticação de todo mundo.

## A mudança, literalmente

No `menthoros-infra/keycloak/menthoros-realm.json`, no client `menthoros-web`:

```diff
- "directAccessGrantsEnabled": true,
+ "directAccessGrantsEnabled": false,
  "attributes": {
+   "pkce.code.challenge.method": "S256"
  }
```

Estado verificado em 2026-08-05 no arquivo versionado:

| Client | `directAccessGrants` | `standardFlow` | `pkce.code.challenge.method` |
|---|:---:|:---:|---|
| `menthoros-web` | **`true`** ← alvo | `true` | **ausente** ← alvo |
| `menthoros-api` | `false` | `true` | ausente → **recebe `S256`** *(Q2 decidida: sim, 2026-08-05)* |
| `menthoros-test` | `true` *(proposital)* | `false` | ausente *(não se aplica)* |

## Decisão 1 — Só o `menthoros-web`

O `menthoros-test` **mantém** o direct grant: ele existe exatamente para ser a porta do teste manual
de API depois que o `menthoros-web` fechar a dele. Tem `standardFlow` desabilitado justamente para
não virar uma segunda porta de entrada real.

O `menthoros-api` já está com o grant fechado, e **recebe o `S256` junto** (Q2 decidida em
2026-08-05): mesma lacuna, client vizinho, fechada na mesma janela para não exigir uma segunda rodada
de sync e validação num provedor de identidade.

### ⚠️ O que esta fronteira NÃO fecha — achado da auditoria de segurança (2026-08-05)

O `menthoros-test` mantém `directAccessGrantsEnabled: true`. A justificativa acima — `standardFlow`
desabilitado, "não vira uma segunda porta de entrada real" — **estava errada quanto ao risco que
importa.** `standardFlow` desabilitado impede o fluxo de browser; **não impede o ROPC**, que é
exatamente o vetor que esta change existe para eliminar.

Estado verificado do `menthoros-test`:

```
publicClient          true      ← não exige secret de client
directAccessGrants    true      ← ROPC ativo
organization          DEFAULT   ← token nasce com tenant_id, sem pedir
fullScopeAllowed      true      ← todas as roles do realm
```

E o Keycloak de dev é **acessível pela internet**: o endpoint de token responde `400` (credencial
inválida) para `client_id=menthoros-test`, provando que o client aceita direct grant de qualquer
origem.

**Resultado líquido, dito sem eufemismo:** o corte fecha o ROPC onde promete e o mantém aberto sob
outro `client_id`, num ambiente exposto, com claim de tenant automático e escopo completo, sem MFA.
Quem tiver um par usuário/senha válido continua obtendo token sem passar pelo app.

O realm também não tem `bruteForceProtected`, `passwordPolicy` nem required action de OTP — o
arquivo versionado define apenas `realm` e `enabled` no nível de realm. O MFA que esta change
"destrava" não está configurado em lugar rastreável, e não há rate limiting versionado contra o
endpoint que fica aberto.

**Por que essa fronteira importa mais do que parece.** O `SPRINTS.md` alerta que o gateway admin usa
password grant e que um corte largo quebraria o signup do Bloco 3. Verificando o código em
2026-08-05, o risco é menor do que o registro sugeria — mas por um motivo que vale escrever, porque
ninguém tinha escrito:

```
KeycloakOrganizationGatewayImpl:129   grant_type=password
application.yml:344-345               token-realm: master   client-id: admin-cli
```

O gateway autentica com **`admin-cli` no realm `master`**, não com um client do realm `menthoros`.
São realms diferentes. O corte no `menthoros-web` não alcança o `admin-cli` nem por acidente.

Isso **não dispensa** a verificação do CA3. A proteção contra regressão é a evidência, não o
raciocínio — e raciocínio sobre configuração de IdP é justamente o que falha calado.

## Decisão 2 — O PKCE vira exigência do servidor

Cortar o ROPC sem exigir `S256` deixa o trabalho pela metade. Hoje o PKCE acontece porque o frontend
o implementa; o provedor não pede. Qualquer cliente registrado no `menthoros-web` pode autorizar sem
`code_challenge`, e a garantia continua sendo do código da aplicação — que é o que a migração
inteira existia para deixar de ser.

As duas linhas andam juntas: uma fecha o grant velho, a outra impede que o novo seja usado pela
metade.

## Decisão 3 — Dois alvos, não três

Produção **não existe** (`SPRINTS.md:291`). O levantamento no Railway em 2026-08-05 confirma um único
projeto com ambiente `develop`.

| Alvo | Keycloak | Como se aplica |
|---|---|---|
| HomeLab `192.168.15.24:8080` | 26.7.0 | `sync-realm.sh` com `.env.sync` apontando local |
| Railway `develop` | 26.7.0 | `sync-realm.sh` com `.env.sync` apontando o Railway |
| Produção | não existe | nada a fazer — nasce com o realm já correto |

O desfecho em produção é o mais barato possível e vale registrar: **não haverá corte a fazer lá.**
Quando a infra nascer, ela aplica o realm versionado, que já terá o corte. A pendência se resolve por
não existir.

## Ordem de execução

```
1. sync do realm SEM o corte   →  reconcilia drift e cria o menthoros-test no alvo
2. valida o teste manual com menthoros-test  →  a saída de emergência antes de fechar a porta
3. corte no arquivo + PR       →  revisão antes de qualquer servidor mudar
4. sync no HomeLab + validação completa
5. sync no Railway + validação completa
```

**O passo 1 é separado de propósito.** O sync de 2026-08-04 revelou drift real entre o arquivo e o
servidor (`redirectUris`/`webOrigins`). Rodar o sync junto com o corte misturaria "o realm mudou" com
"a segurança mudou" — e se algo quebrar, não se sabe qual dos dois foi.

**E o passo 1 não é seguro só por não conter o corte.** Corrigido em 2026-08-05, após o passe
adversarial: `no-delete` impede **apagar entidades** que só existam no alvo; não impede **sobrescrever
o conteúdo** de entidades que existem nos dois lados. Um `redirectUri`, um `webOrigin`, um scope ou um
protocol mapper presente no servidor e ausente do arquivo **é substituído**. O `menthoros-web`
versionado tem três origins — se um alvo tiver mais, o sync os remove e o login quebra **sem que o
corte tenha sido aplicado**. Por isso cada sync, inclusive o pré-corte, é seguido de validação do
login do app, não só do `menthoros-test`.

**O passo 2 vem antes do 4** porque é a saída de emergência. Validar o `menthoros-test` *depois* do
corte é descobrir que a alternativa não funciona quando a original já morreu.

## Rollback

| Falha | Reversão |
|---|---|
| Login quebrou após o corte | `directAccessGrantsEnabled: true` no arquivo + `sync-realm.sh` no alvo afetado. Requer acesso admin — garantir **antes** de começar. |
| PKCE `S256` recusando cliente legítimo | Remover `pkce.code.challenge.method` do `attributes` + sync. Independente do corte do grant; dá para reverter só um dos dois. |
| Signup parou de criar organização | Não deve ser causado por esta change (realms diferentes). Se acontecer, investigar o `admin-cli` no `master` — e a hipótese de causa aqui está errada. |

**Depois do passo 4 o rollback deixa de ser barato.** Até ele, reverter era mexer no frontend. Daqui
em diante é reverter configuração de provedor de identidade, com acesso admin, sob pressão de login
caído. É o "ponto sem retorno barato" que a change original nomeou e não chegou a atravessar.

## Fora de escopo, registrado para não se perder

- **`menthoros-api` sem `pkce.code.challenge.method`** — mesma lacuna, client vizinho. Ver Q2 do
  proposal.
- **Telemetria de login** — despriorizada pelo founder em 2026-08-04; a métrica primária segue não
  falsificável, e o CA1 não depende dela.
- **MFA** — destravado por esta change, ligado por outra.
