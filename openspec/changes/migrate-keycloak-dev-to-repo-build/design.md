# Design — migrate-keycloak-dev-to-repo-build

**Criado:** 2026-08-16 · **Trilha:** Full *(escalada pelo risco, não pelo tamanho)*

> As decisões estruturais desta change **já foram tomadas e exercitadas** em
> `customize-keycloak-login-theme`, que entregou o mesmo mecanismo em local e HomeLab. Este documento
> carrega adiante o que continua valendo — a change de origem será arquivada, e depender de um
> documento arquivado é como decisão vira folclore — e registra só o que é específico do Railway.

## O problema, em uma frase

O serviço `menthoros-keycloak` roda a imagem pública `quay.io/keycloak/keycloak:26.6`, com
`source.repo: null`: **não existe mecanismo pelo qual um arquivo do repositório chegue lá dentro**.

## Decisões herdadas, que continuam valendo

**1. Um único `docker/Dockerfile.keycloak` alimenta todos os ambientes.** Já é a realidade em local e
HomeLab. GHCR foi descartado por exigir esteira de CI e credenciais de registry que o
`menthoros-infra` não tem — construir isso para entregar um CSS é cerimônia maior que o problema. O
Dockerfile único é o **pré-requisito** dessa evolução, não o obstáculo.

**2. Restrição de gatilho por watch patterns, não por `rootDirectory`.** O `rootDirectory` estreitaria
o **contexto de build**, e o Dockerfile copia de `keycloak/themes/` — que ficaria fora dele. Watch
pattern filtra o gatilho sem mexer no contexto. Decidido em 2026-08-16.

**3. A ordem por ambiente não é negociável.**

```
1. versão alinhada  →  2. imagem com o tema no ar  →  3. preflight  →  4. loginTheme
```

Inverter 2 e 4 derruba o login: um `loginTheme` apontando para tema inexistente faz o Keycloak
responder `500` na porta de entrada. Desde 2026-08-16 isso está **coberto por código** — o
`sync-realm.sh` consulta os temas do alvo e aborta —, mas a ordem continua sendo a intenção, e a
guarda é a rede, não o plano.

## O que é específico do Railway

**O `startCommand` mora no serviço, não na imagem.** Está fixado como
`/opt/keycloak/bin/kc.sh start-dev` e **sobrevive à troca de origem**, continuando a sobrescrever o
`CMD ["start"]` do nosso Dockerfile. Isso é conveniente — o comportamento não muda — e perigoso: é
fácil "corrigir" o Dockerfile achando que ele manda, e nada acontecer.

**Não existe `KC_VERSION` no serviço.** A versão está embutida na tag da imagem pública. Ao trocar
para build de repo, o controle de versão **migra da configuração do serviço para o Dockerfile**, que
passa a ser o único lugar onde a versão do Keycloak é declarada. Consequência imediata: dev sai da
tag móvel `26.6` e vai para `26.7.0`, a mesma de local e HomeLab.

**Não há acesso ao host.** No HomeLab, uma imagem que não sobe se conserta por SSH. Aqui o conserto é
trocar a origem de volta pelo painel. Isso muda o cálculo de risco, não o procedimento: por isso o
estado atual do serviço é registrado **antes** (task 0.2) e a janela deve ser de baixo uso.

**A armadilha do nome de projeto compose não se aplica.** Ela morde local e HomeLab, onde o Postgres
é um serviço do compose e o volume deriva do nome do diretório. No Railway o banco é serviço
gerenciado, com identidade própria.

## O que o ensaio já comprou

`customize-keycloak-login-theme` rodou este mecanismo inteiro em dois ambientes antes de chegar aqui,
e a ordem `local → HomeLab → Railway` foi escolhida justamente para isso. O que já está exercitado:

- o Dockerfile constrói e o tema aparece em `/opt/keycloak/themes/menthoros`;
- o preflight do `sync-realm.sh` aborta contra alvo sem o tema e passa contra alvo com;
- a 26.7.0 roda o realm `menthoros` com clients, usuários e o tema, sem migração pendente;
- a tela de login responde `200`, em PT-BR, com contraste medido.

**O que o ensaio NÃO cobre, e é exatamente o miolo desta change:** a troca do mecanismo de origem do
serviço. No HomeLab a origem já era o compose deste repositório, então entregar o tema foi um
`--build`. Aqui a origem é imagem pública, e isso não tem ensaio.

## Rollback

| Falha | Reversão |
|---|---|
| Imagem não sobe / Keycloak não inicia | Voltar `source` para `image: quay.io/keycloak/keycloak:26.7.0` — **não `26.6`**. O tema é validado contra a 26.7.0; voltar para a tag móvel restaura outro Keycloak, não o baseline testado. Variáveis do serviço preservadas. |
| Tema quebrado ou ilegível, mas o Keycloak sobe | Remover `loginTheme` do `menthoros-realm.json` e rodar o `sync-realm.sh`. Volta ao tema padrão sem tocar no deploy. É o rollback barato e cobre quase tudo. |
| Deploy disparando a cada push de doc | Ajustar watch patterns. Não é emergência, mas cada deploy indevido reinicia a autenticação de dev. |

## Fora de escopo, registrado para não se perder

- **`start-dev` em ambiente compartilhado** — sem otimização de startup, garantias relaxadas. Dívida
  anterior a esta change. Quem mexer na origem vai esbarrar nela; abrir change própria.
- **`KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`** — variáveis do Keycloak antigo, funcionam por
  compatibilidade na 26.x, que usa `KC_BOOTSTRAP_ADMIN_*`. Pin numa ponte que um dia sai.
