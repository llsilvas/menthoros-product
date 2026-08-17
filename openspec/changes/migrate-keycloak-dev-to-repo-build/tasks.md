# Tasks — migrate-keycloak-dev-to-repo-build (S · **Full** · infra)

> Escopo: o **serviço** `menthoros-keycloak` no Railway (projeto `robust-expression` `4f4f3290-…`,
> env `develop` `76759ba8-…`) e o realm de dev. **Provavelmente zero diff no repositório** — a
> mudança é de configuração de serviço, não de código; o `Dockerfile.keycloak` e o tema já estão em
> `main` desde `customize-keycloak-login-theme`.
>
> Este serviço autentica **todo** o ambiente de desenvolvimento: uma imagem que não sobe deixa
> backend e front sem login, e aqui não há acesso ao host para consertar à mão. **Fazer em janela de
> baixo uso.**
>
> A ordem por ambiente continua a mesma e continua não sendo negociável:
> `1. versão alinhada → 2. imagem com o tema no ar → 3. preflight → 4. loginTheme`

## 0. Pré-condições

- [ ] 0.1 **Confirmar que o Railway enxerga o repositório** (Q1). Ele é privado; a troca de origem
      exige que o GitHub App do Railway inclua `llsilvas/menthoros-infra`. Se não incluir, autorizar
      é o primeiro passo e acontece no painel.
      *verify:* o repo aparece na lista de fontes ao editar o serviço.
- [ ] 0.2 **Registrar o estado atual do serviço antes de tocar em nada** — origem, `startCommand`,
      variáveis de ambiente e domínio. É o que torna o rollback uma operação e não uma investigação.
      *verify:* saída salva em algum lugar fora do painel (a própria change serve).
- [ ] 0.3 **Registrar o `redirect_uri` e o comportamento do login de dev ANTES da mudança.** O CA6
      exige "funciona igual"; sem o antes, não há como afirmar isso depois.

## 1. Troca de origem

- [ ] 1.1 **Trocar `source.image` por `source.repo`** (`llsilvas/menthoros-infra`), com
      `dockerfilePath = docker/Dockerfile.keycloak` e **contexto na raiz do repositório**.
      ⚠️ **Não estreitar o contexto** para `docker/`: o Dockerfile copia de `keycloak/themes/`, que
      ficaria fora dele e o build quebraria. É por isso que a restrição do gatilho é por watch
      pattern, não por `rootDirectory` (decisão de `customize-keycloak-login-theme`).
      *verify:* deploy `SUCCESS` e `/realms/menthoros` respondendo `200` (CA1).
- [ ] 1.2 **Conferir que o tema está na imagem que subiu** — não que está no repositório.
      *verify:* `menthoros` presente em `themes.login[].name` de `/admin/serverinfo` (CA2).
- [ ] 1.3 **Conferir a versão efetiva.** A partir daqui é o Dockerfile que define a versão do
      Keycloak em dev; o serviço sai da tag móvel `26.6` para `26.7.0`.
      *verify:* `systemInfo.version == 26.7.0` (CA7).
- [ ] 1.4 **Conferir que o `startCommand` do serviço sobreviveu** e continua sendo o comando efetivo
      (`/opt/keycloak/bin/kc.sh start-dev`). Ele sobrescreve o `CMD ["start"]` do nosso Dockerfile —
      é conveniente (o comportamento não muda) e perigoso (é fácil "corrigir" o Dockerfile achando
      que ele manda, e nada acontecer).
      *verify:* o serviço em modo dev, como antes (CA3).
- [ ] 1.5 **Conferir que as variáveis de ambiente sobreviveram** à troca de origem (premissa 2).
      Perdê-las derruba a conexão com o banco, e o sintoma seria confundido com falha do build.

## 2. Gatilho de build

- [ ] 2.1 **Restringir por watch patterns** ao que compõe a imagem — `docker/Dockerfile.keycloak` e
      `keycloak/themes/**`. Sem isso, editar um `.md` redeploya o provedor de identidade de dev.
      ⚠️ Configurar **junto** com a 1.1, não depois: entre uma e outra, todo push no repo dispara
      deploy.
- [ ] 2.2 *verify (CA4):* um commit que toca só `docs/` ou `workspace/` **não** dispara deploy novo.
      Exige um commit real dessas pastas e a conferência do histórico de deploys.

## 3. Realm e validação

- [ ] 3.1 **Preflight contra o Railway e sync.** Rodar `sync-realm.sh` com o alvo apontando para dev.
      ⚠️ **Conferir a linha `>> Alvo:`** antes de deixar seguir — o `.env.sync` real aponta para o
      HomeLab, e ele sobrescreve variáveis passadas na linha de comando (`menthoros-infra#12`).
      *verify:* `>> Preflight OK` seguido de `>> Sincronização concluída` (CA5).
- [ ] 3.2 **Provar que a guarda funciona neste alvo também**, se houver oportunidade segura de fazê-lo
      — o valor dela é justamente aqui. Se não houver, registrar que não foi exercitado em dev, em vez
      de assumir.
- [ ] 3.3 **Refazer a validação da seção 3 de `customize-keycloak-login-theme` no fluxo real de dev:**
      login completo com `redirect_uri` idêntico ao da 0.3, credencial inválida em `200` com mensagem
      em PT-BR, logout, viewport de celular (CA6).
- [ ] 3.4 **Conferir que backend e front de dev continuam autenticando.** É o teste que importa: o
      tema é aparência, mas a troca de origem mexeu no serviço que os dois usam.

## 4. Fechamento

- [ ] 4.1 Atualizar a tabela de ambientes do `design.md` de `customize-keycloak-login-theme` — ela
      registra o estado por ambiente e passa a ter dev como ✅.
- [ ] 4.2 Registrar no `SPRINTS.md`.
- [ ] 4.3 Se o `start-dev` ou as variáveis `KEYCLOAK_ADMIN_*` incomodarem durante a execução,
      **abrir change própria** em vez de consertar aqui. Estão nos não-objetivos por decisão.

## Rollback

Trocar `source` de volta para `image: quay.io/keycloak/keycloak:26.7.0` — **não `26.6`**: o tema é
validado contra a 26.7.0, e voltar para a tag móvel restaura outro Keycloak, não o baseline testado.
Operação de painel; as variáveis do serviço são preservadas.

Se o problema for o tema e não a imagem, o rollback barato é remover `loginTheme` do
`menthoros-realm.json` e rodar o `sync-realm.sh` — volta ao tema padrão sem tocar no deploy.
