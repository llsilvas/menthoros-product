# lgpd-trajeto-cards-compartilhamento — trajeto GPS completo nos cards de compartilhamento

**Tamanho:** S · **Trilha:** Full (risco legal/LGPD sobre dado sensível + toca dois repos: texto da
Política no front, versão vigente em `app.lgpd.policy-version` no backend)
**Status:** proposta — estacionada até existir a change dos cards de compartilhamento
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

## Métrica de sucesso

- Zero card com trajeto gerado sem aviso confirmado. Verificável pelo registro da confirmação (ver
  Q1).
- Do lado do treinador, a assessoria divulga a marca nos cards (assinatura assessoria/treinador)
  **sem herdar risco de LGPD**. Nenhuma reclamação ou pedido de titular sobre exposição de
  localização via card nos primeiros 90 dias após o lançamento.

## Open Questions & Assumptions

- **Q1 — Onde guardar a confirmação do aviso?** Pode ficar só no `localStorage` (mais simples, mas
  some ao trocar de aparelho e não vale como prova) ou ser registrada no backend com versão e
  timestamp, no mesmo padrão append-only de `tb_usuario_lgpd_consent`. Como GPS é sensível pela
  própria Política, a recomendação é **backend**. Isso muda o tamanho para M (schema + endpoint).
- **Q2 — Base legal.** Premissa: consentimento específico e destacado do titular (Art. 11, I),
  porque a ação é do próprio atleta e o dado é sensível. A tabela de bases legais do § 4 precisa de
  uma linha nova. Validar com o DPO/jurídico.
- **Q3 — Re-aceite dos coaches.** Mudar `app.lgpd.policy-version` reabre o `CoachConsentDialog`
  para **todos os treinadores** (o enforcement compara a versão aceita com a vigente). Opções:
  aceitar o re-aceite (a mudança também afeta a visibilidade da assessoria nos cards) ou separar a
  versão da Política exibida ao coach. Decidir antes de implementar.
- **Q4 — Controladora.** A assessoria é a controladora primária dos dados do atleta (§ 1). Premissa:
  a funcionalidade de compartilhar entra como recurso da plataforma, coberta pelo contrato com a
  assessoria. Confirmar se é preciso aviso à assessoria ou opção de desligar por tenant.
- **Premissa:** a imagem é gerada no dispositivo do atleta ou retornada só a ele. A Menthoros não
  publica nada em rede social em nome do atleta. Se isso mudar (postagem direta via API), o escopo
  muda.

## Riscos e mitigações

- **Texto legal vago demais.** Mitigação: o CA1 exige a frase "incluindo início e fim" literalmente
  equivalente, sem eufemismo.
- **Lançar os cards antes desta change.** Mitigação: a change dos cards deve declarar esta como
  dependência bloqueante no `proposal.md`.
- **Pendências do Full track:** `product-reviewer` e o pre-mortem (`/codex:adversarial-review`)
  ainda não rodaram. A change foi registrada para não perder a decisão e deve passar pelas revisões
  antes do `/implement init`.
