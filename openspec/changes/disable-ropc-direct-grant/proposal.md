# disable-ropc-direct-grant — Corte do ROPC no client `menthoros-web`

**Tamanho:** S · **Trilha:** Full
**Status:** proposta
**Criado:** 2026-08-05

> Herdada de `migrate-login-to-authorization-code-pkce`, arquivada **incompleta** em 2026-08-05 por
> decisão do founder. O `SPRINTS.md` registra a orientação: quando retomar, **abrir change nova** —
> reabrir a arquivada é pior que uma pequena e específica. Esta é ela.

## Why

**O `menthoros-web` ainda aceita `grant_type=password`.** Quem tiver credenciais obtém token direto
do Keycloak, sem passar pelo app, em todos os ambientes.

A migração para Authorization Code + PKCE está **completa no código** (PRs front #54 e #55): o
`AuthService.ts` foi removido e o caminho do ROPC não existe mais na aplicação. Mas o #55 tirou o
caminho **do código**, não **do provedor**. O ganho real dele foi impedir reintrodução por descuido;
o controle de segurança em si continua não existindo.

Duas razões para fechar isso, e a segunda é comercial:

1. **ROPC foi removido do OAuth 2.1.** É grant legado, e enquanto ele estiver de pé a migração
   inteira não vale como controle — vale como refatoração.
2. **ROPC impede MFA.** Essa é objeção de venda concreta para assessoria que trata dado de saúde, e
   MFA é justamente o que a migração destravou. Sem o corte, o destravamento é teórico.

Enquanto a change não fecha, o Menthoros carrega o custo de ter feito a migração sem colher o
benefício dela.

## What Changes

- **Sync do realm nos alvos que existem**, aplicando `menthoros-realm.json` com o `sync-realm.sh`.
  Isso leva junto o client `menthoros-test`, que hoje existe só no HomeLab mas **já está no arquivo
  versionado** — então o sync o cria no destino sem trabalho extra.
- **`directAccessGrantsEnabled: false`** no client `menthoros-web`, **e só nele**.
- **`pkce.code.challenge.method: S256`** no mesmo client, tornando o PKCE exigência do provedor e não
  cortesia do cliente.
- **Verificação de não-regressão do gateway admin**, que cria organização no Keycloak durante o
  signup do Bloco 3.

## Correção de escopo — produção não existe

As tasks herdadas falam em "dev e produção" como se os dois existissem. **Não existem.** O
`SPRINTS.md:291` registra *"Infra Keycloak de produção pendente"*, e o levantamento de 2026-08-05
confirma: há um único projeto Railway com ambiente `develop`.

Os alvos reais desta change são **dois**:

| Ambiente | Keycloak | Estado do `menthoros-web` |
|---|---|---|
| HomeLab (`192.168.15.24:8080`) | 26.7.0 | `directAccessGrants: true` — a cortar |
| Railway `develop` | 26.7.0 | `directAccessGrants: true` — a cortar |
| Produção | **não existe** | — |

Produção fica **deferida por inexistência**, não por decisão: quando a infra nascer, ela nasce já com
o realm versionado, que a esta altura já terá o corte. É o desfecho mais barato possível — não
haverá corte a fazer, só um realm correto a aplicar.

## Fora de escopo

- **Aplicar o corte de forma ampla.** Ver Riscos: só o `menthoros-web`.
- **Telemetria de login.** A métrica (0.6 da change original) foi despriorizada pelo founder em
  2026-08-04 e continua fora. Ver Métrica de sucesso.
- **MFA.** Esta change o destrava; ligá-lo é change própria.
- **Infra Keycloak de produção.** Pré-requisito de outra coisa, não desta.

## Critérios de aceite

- **CA1** — Dado o client `menthoros-web`, quando alguém tenta `grant_type=password` com credenciais
  válidas, então o Keycloak **recusa**.
  *Evidência exigida:* resposta de erro do endpoint de token em **cada** ambiente ativo, com
  credenciais que funcionavam antes. Configuração lida no console não serve — o que importa é o
  provedor recusando.
- **CA2** — Dado o corte aplicado, quando o login normal é feito pelo app, então **funciona igual**:
  mesmo redirect, mesma sessão, mesmo destino.
- **CA3** — Dado o corte aplicado, quando o backend cria organização no Keycloak durante o signup,
  então **continua funcionando**. Regressão aqui quebraria o Bloco 3 inteiro.
  *Evidência exigida:* `KeycloakOrganizationGatewayImplTest` verde **e** uma criação real de
  organização exercitada contra o Keycloak, porque o teste é unitário e não prova o provedor.
- **CA4** — Dado o `pkce.code.challenge.method: S256`, quando um cliente tenta autorizar **sem**
  `code_challenge`, então o Keycloak recusa. Sem isso o PKCE segue opcional do lado do servidor e a
  garantia continua sendo do frontend, não do provedor.
- **CA5** — Dado o teste manual de API (Apidog), quando o corte é aplicado, então ele **continua
  funcionando** trocando apenas o `client_id` para `menthoros-test`. Não é aceitável fechar esta
  change deixando o teste manual quebrado.

## Métrica de sucesso

**Não há métrica de rotina do treinador aqui, e inventar uma seria pior que admitir isso.** O
`config.yaml` pede métrica ligada à rotina do coach; esta change não toca a rotina de ninguém — ela
fecha um grant.

O critério é binário e verificável, e é o CA1: **`grant_type=password` recusado para o
`menthoros-web` em todos os ambientes ativos, com o login e o signup intactos.** Ou o provedor
recusa, ou não recusa.

A métrica que a change original previa (telemetria de login, task 0.6) segue despriorizada. A
consequência aceita continua valendo e vale repetir: sem linha de base, "não piorou" é julgamento,
não medição — mas o CA1 não depende dela.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| 🔴 **Aplicar o corte de forma ampla derruba o signup.** O gateway admin (`KeycloakOrganizationGatewayImpl:129`) autentica por password grant para criar organização. Um corte largo, ou aplicado no client errado, quebra o Bloco 3 inteiro. | **Verificado em 2026-08-05 e o risco é menor do que o registrado:** o gateway usa `admin-cli` no realm **`master`** (`application.yml:344-345`), não um client do realm `menthoros`. O corte no `menthoros-web` **não tem como alcançá-lo**. Ainda assim, CA3 exige a verificação — a proteção é a evidência, não o raciocínio. |
| 🔴 **Depois do corte, o rollback deixa de ser barato.** Até aqui bastava reverter o frontend. A partir daqui o rollback é reverter configuração de provedor de identidade, com acesso admin necessário. | Aplicar com janela e acesso admin garantidos aos dois alvos **antes** de começar. O rollback é `directAccessGrantsEnabled: true` no client e novo sync — anotar o comando na própria change, não descobrir sob pressão. |
| **O `sync-realm.sh` aplica o JSON cegamente.** A política `no-delete` protege clients, groups, roles e users — não impede que um atributo errado no arquivo vire configuração errada no servidor. | O corte entra no arquivo versionado e é revisado em PR antes de qualquer sync. Sync contra HomeLab primeiro, validação completa, e só então o Railway. |
| **O teste manual de API quebra silenciosamente.** Quem usa o Apidog com `menthoros-web` perde o acesso no instante do corte, sem aviso. | O client `menthoros-test` já resolve isso e **já está no arquivo versionado**, então o sync o cria nos dois alvos. Resta comunicar a troca de `client_id` (CA5). |
| **Drift entre o realm versionado e o servidor.** Já aconteceu: em 2026-08-04 o sync revelou que `redirectUris`/`webOrigins` do servidor divergiam do arquivo. | O sync é justamente o que reconcilia. Rodar o sync **antes** do corte, como task separada, para que qualquer surpresa apareça sem estar misturada à mudança de segurança. |

## Open Questions & Assumptions

**Premissas:**

1. **O client `menthoros-test` cobre o teste manual de API.** Criado em 2026-08-04 (infra `c919d31`)
   com `directAccessGrants` e `standardFlow` desabilitado, e `organization` como scope DEFAULT — o
   token já nasce com `tenant_id`. Verificado no HomeLab pela Admin API; nos demais alvos depende do
   sync.
2. **Cortar o direct grant não afeta o fluxo PKCE.** São grants independentes no mesmo client.
   Padrão do Keycloak, a confirmar pelo CA2.
3. **O acesso admin aos dois Keycloaks está disponível.** Foi o gargalo que travou a change original.
   Em 2026-08-05 o acesso ao Railway foi exercitado (upgrade para 26.7.0), então a premissa hoje se
   sustenta melhor que na época.

**Em aberto:**

- **Q1 — Alguém depende hoje do password grant no `menthoros-web` fora do Apidog?** Script, job,
  integração antiga. O corte é o momento em que isso aparece, e aparece quebrando. Vale um
  levantamento antes, ainda que informal.
- **Q2 — O `menthoros-api` precisa do mesmo tratamento?** Ele já está com
  `directAccessGrantsEnabled: false`, mas **também não tem `pkce.code.challenge.method`**. Não é
  regressão nem urgência — é a mesma lacuna, no client vizinho. Decidir se entra aqui ou vira nota.
