# lgpd-trajeto-cards-compartilhamento — trajeto GPS completo nos cards de compartilhamento

**Tamanho:** M · **Trilha:** Full (risco legal/LGPD sobre dado sensível; dois repos; schema e
endpoint novos para o registro da confirmação)
**Status:** proposta — decisões Q1–Q4 tomadas em 2026-11-08; aguardando DoR
**Criado:** 2026-11-08
**Repos afetados:** `apps/menthoros-front`, `apps/menthoros-backend` (config)

> Nasce da exploração de design dos cards de compartilhamento de treino (canvas "Compartilhar
> treino — cards sociais", 2026-11-08). Decisão de produto tomada ali: **o card mostra o trajeto
> inteiro, sem ocultar início e fim**. Em vez de cortar o traçado, a transparência vai para o
> documento de aceite. Esta change existe para que essa decisão não chegue em produção sem o texto
> legal que a sustenta.

## Why

Os cards de compartilhamento (Story/Feed estilo Strava e Garmin) desenham o traçado GPS da corrida a
partir dos registros `position_lat`/`position_long` do `.fit` (ingestão Garmin `activityFiles` e
upload manual). Com o trajeto completo, **início e fim costumam ser a casa ou o trabalho do atleta**.

A Política de Privacidade vigente (`src/pages/waitlist/politicaPrivacidadeConteudo.ts`) já:

- declara GPS e trajeto como **dado sensível** (§ 2.1, "conforme entendimento da ANPD");
- lista as integrações que trazem GPS (§ 2.2).

Ela **não** prevê nenhuma finalidade em que a plataforma gere uma imagem com o trajeto para o próprio
atleta publicar fora da plataforma. O § 6 (Compartilhamento) cobre só treinador/assessoria e
subprocessadores, e o § 6.3 afirma que não há compartilhamento com terceiros. Lançar os cards sem
ajustar o texto deixa uma finalidade sem cobertura sobre um dado que a própria Política chama de
sensível.

## Escopo

1. **Política de Privacidade:**
   - nova finalidade no § 3: gerar, a pedido do atleta, imagens do treino para ele compartilhar;
   - nova subseção **§ 6.4 "Compartilhamento feito pelo próprio atleta"**, dizendo que:
     - a imagem é gerada só quando o atleta pede;
     - pode conter o **trajeto completo, incluindo os pontos de início e fim**;
     - a publicação é ato do atleta, fora do controle da Menthoros;
     - o atleta pode escolher um modelo sem mapa.
2. **Aviso no momento do compartilhamento:** na primeira vez que o atleta gerar um card com mapa,
   mostrar um aviso curto em linguagem simples. Exemplo: "Esta imagem mostra seu trajeto completo,
   incluindo onde você começou e terminou". O aviso traz um link para a § 6.4, um botão de confirmar
   e a opção de trocar por um modelo sem mapa.
3. **Bump de `app.lgpd.policy-version`** para a data de vigência do novo texto, mantendo a data
   exibida na página pública igual à configurada.

## Fora do escopo

- Os cards de compartilhamento em si: `athlete-share-cards` (sem mapa) e
  `athlete-share-cards-mapa` (com mapa). Esta change é **pré-requisito do lançamento** da segunda.
- Ocultar ou cortar início e fim do trajeto. A decisão foi não ocultar.
- Extrair e armazenar o traçado do `.fit`, que fica na change dos cards.
- Revogação de outros consentimentos do atleta além deste (a seção "Privacidade" nasce só com esta
  chave).
- Um fluxo genérico de consentimento LGPD do atleta (modal bloqueante equivalente ao
  `CoachConsentDialog`). Aqui o aviso vale só para a ação de compartilhar.

## Critérios de aceite

**CA1 — Política cobre a finalidade**
> **Dado** a página pública da Política de Privacidade
> **Quando** o atleta lê as seções 3 e 6
> **Então** existe a finalidade de geração de imagem a pedido do atleta e a § 6.4 diz explicitamente
> que a imagem pode conter o trajeto completo, inclusive início e fim.

**CA2 — Versão vigente bate com a página**
> **Dado** o novo texto publicado
> **Quando** o backend sobe com a configuração da change
> **Então** `app.lgpd.policy-version` é igual à data de vigência exibida na página pública.

**CA3 — Aviso aparece antes do primeiro card com mapa**
> **Dado** um atleta que nunca confirmou o aviso
> **Quando** ele escolhe um modelo de card com mapa e toca em um destino (Stories, WhatsApp,
> Salvar, Mais)
> **Então** o aviso aparece antes de gerar a imagem; a imagem só é gerada depois de "Entendi,
> compartilhar".

**CA4 — Saída sem mapa**
> **Dado** o aviso aberto
> **Quando** o atleta escolhe "Usar modelo sem mapa"
> **Então** a tela troca para um modelo sem trajeto e nenhuma imagem com GPS é gerada.

**CA5 — Aviso não se repete**
> **Dado** um atleta que já confirmou o aviso
> **Quando** ele compartilha outro card com mapa
> **Então** o aviso não aparece de novo.

**CA6 — Versão apresentada é a gravada**
> **Dado** a Política vigente no servidor mudou depois que o atleta abriu o aviso
> **Quando** ele confirma
> **Então** o servidor responde `409 CONSENT_VERSION_STALE`, nada é gravado e o aviso pede para
> recarregar.

**CA7 — Revogação**
> **Dado** um atleta que concedeu
> **Quando** ele desliga "Mostrar meu trajeto nos cards" no perfil
> **Então** um evento `REVOGADO` é gravado, o histórico anterior é preservado e o próximo card com
> mapa mostra o aviso de novo.

**CA8 — Endpoint restrito ao atleta e ao tenant**
> **Dado** um usuário `TECNICO`, ou um atleta de outro tenant
> **Quando** ele chama o endpoint
> **Então** o técnico recebe `403` e o atleta só vê e altera o próprio estado no próprio tenant.

**CA9 — Idempotência**
> **Dado** um atleta já concedido na versão vigente
> **Quando** o `POST` chega de novo
> **Então** a resposta é o estado atual, sem erro.

**CA2 — verificação:** o `application.yml` (default) e `POLITICA_VERSAO` são conferidos por teste no
backend que compara o default com a data registrada no `design.md` (D5); o valor efetivo no Railway
(`LGPD_POLICY_VERSION`) é checagem manual do deploy, registrada no `tasks.md`.

## Métrica de sucesso

- Zero card com trajeto gerado sem aviso confirmado. O servidor não vê a geração, que é local. O
  sinal é **estrutural**: o E2E de `athlete-share-cards-mapa` prova que nenhum PNG com mapa é gerado
  antes do `POST`, e o registro de eventos mostra concessões e revogações por atleta.
- Do lado do treinador, a assessoria divulga a marca nos cards (assinatura assessoria/treinador)
  **sem herdar risco de LGPD**. Nenhuma reclamação ou pedido de titular sobre exposição de
  localização via card nos primeiros 90 dias após o lançamento.

## Decisões (founder, 2026-11-08)

- **Achado que mudou o escopo:** o atleta **nunca aceita a Política no app**. O aceite
  (`CoachConsentDialog` + `LgpdConsentInterceptor`, guarda 3 "só TECNICO") é exclusivo do treinador.
  Só atualizar o texto e subir a versão faria os treinadores re-aceitarem, enquanto o titular do GPS
  (o atleta) não passaria por aceite nenhum. Por isso o aviso no compartilhamento é o
  **consentimento específico** do atleta, não um extra de UX.
- **Q1 — Onde guardar a confirmação:** **backend**, append-only, com versão da Política e data, no
  padrão de `tb_usuario_lgpd_consent` (V73). Vale como prova e acompanha o atleta entre aparelhos.
  Tamanho sobe para M.
- **Q2 — Base legal:** consentimento específico e destacado do titular (Art. 11, I), colhido pelo
  aviso. **Validação do DPO/jurídico pendente — bloqueia a promoção `develop → main`** dos cards com
  mapa, não a implementação.
- **Q3 — Re-aceite dos coaches:** aceito. Subir `app.lgpd.policy-version` reabre o
  `CoachConsentDialog` para todos os treinadores, e eles aceitam o texto novo.
- **Q4 — Controladora:** sem opção de desligar por tenant nesta change; a funcionalidade entra como
  recurso da plataforma.
- **Critério de parada de `athlete-share-cards-mapa`** (≥ 10% de adoção): dispensado pelo founder.
- **Premissa mantida:** a imagem é gerada no dispositivo do atleta; a Menthoros não publica nada em
  rede social em nome dele.
- **Divergência pré-existente a corrigir aqui:** o front exibe `POLITICA_VERSAO = '2026-10-26'` e o
  default do backend é `LGPD_POLICY_VERSION:2026-08-03` (`application.yml:242`). Conferir o valor da
  variável no Railway antes do bump; a change termina com os dois iguais (CA2).

## Riscos e mitigações

- **Texto legal vago demais.** Mitigação: o CA1 exige a frase "incluindo início e fim" literalmente
  equivalente, sem eufemismo.
- **Lançar os cards antes desta change.** Mitigação: a change dos cards deve declarar esta como
  dependência bloqueante no `proposal.md`.
- **Pendências do Full track:** `product-reviewer` e o pre-mortem (`/codex:adversarial-review`)
  ainda não rodaram. A change foi registrada para não perder a decisão e deve passar pelas revisões
  antes do `/implement init`.
