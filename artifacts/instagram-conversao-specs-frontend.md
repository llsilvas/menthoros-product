# Menthoros — Specs de Frontend (conversão do Instagram)

Origem: análise do Instagram, da landing e de `/waitlist` em 07/10/2026.
Objetivo: fazer a página de destino do link da bio explicar a oferta e converter treinadores.
Escrito sem acesso ao código. Cada spec tem um bloco "Verificar no código" para o Claude Code resolver antes de implementar.

Decisões de produto que as specs assumem (ajustar se mudarem):

- Categoria: "assessorias de corrida" (não "endurance").
- CTA único: "Solicitar acesso".
- Destino do link da bio: `/waitlist` enriquecida.
- Vagas: número vem do backend (BE-04), nunca de texto fixo.

Ordem sugerida: FE-01 → FE-02 → FE-03 → FE-04 → FE-05 → FE-06 → FE-07.

## Checklist de entrega

Atualizado em 2026-10-09. Ver também o checklist irmão em
`instagram-conversao-specs-backend.md` (BE-01..BE-07).

A change `add-waitlist-value-proposition` (frontend PR #152, mergeado em
`develop`) nasceu escopada só em FE-01, mas uma rodada de iteração visual direto com o founder
(canvas `/waitlist` aprovado) puxou parte de FE-02/03/04/05/06 para dentro dela antes do merge —
ver `changes/archive/2026-10/2026-10-08-add-waitlist-value-proposition/tasks.md` para o detalhe
task a task.

- [x] **FE-01** — Página `/waitlist` com proposta de valor e oferta. Entregue: título, slogan,
      bullets, oferta, aviso Garmin, `AttentionQueue` ilustrativo e logo acima do formulário.
- [x] **FE-02** — Formulário único de solicitação de acesso. Entregue: `AccessRequestForm.tsx`
      substitui os dois formulários divergentes (home e `/waitlist`), mesmos campos/validação/botão.
      **Pendente dentro de FE-02:** campo "dono de assessoria" no "Você é" e campo "relógio
      predominante dos atletas" — mudam o contrato do DTO do backend, adiados para coordenar com o
      repo que mexer na entidade (ver `CLAUDE.md` do backend, "Campo de DTO em português").
- [x] **FE-03** — Captura e persistência de UTMs. Entregue: `utmPersistence.ts` lê path e fragmento
      de hash, persiste em `sessionStorage` na primeira carga da sessão.
- [x] **FE-04** — Contador de vagas com fonte única. Entregue —
      `add-founders-slots-display`, frontend PR #154, consumindo `GET /api/v1/founders/slots`
      (`add-founders-slots-endpoint`, backend PR #173). Badge da home e cabeçalho do formulário em
      `/waitlist` leem o dado ao vivo: "Restam N de T vagas" quando aberto, "Lista de espera —
      próxima turma" quando esgotado, nunca um número durante carregamento/falha. **Não dinâmicas,
      de propósito (Non-Goal):** as menções em prosa corrida (`hero.scarcity`, `finalCta.sub`, FAQ
      "Quanto custa?", rodapé do `AccessRequestForm`) continuam lendo a constante estática — são
      menções incidentais dentro de frases maiores, não o "contador" que a spec original tinha em
      mente.
- [ ] **FE-05** — Tela de sucesso com próximo passo. **Parcial:** mensagem varia por perfil
      (treinador vs. atleta) — entregue. Variante "dono/treinador com outra marca de relógio" **não**
      implementada: depende do campo "relógio predominante" de FE-02, que ficou pendente.
- [ ] **FE-06** — Ajustes de conteúdo na home. **Parcial:** "assessorias de endurance" →
      "assessorias de corrida" na copy de marketing; dado mock do `AttentionQueue` ganhou rótulo
      "Exemplo ilustrativo". **Não verificado/pendente:** foto real + nome completo na seção "Quem
      constrói" (ainda com inicial "L"?), seção de depoimentos condicionada a ter ao menos um
      depoimento real, botões de conversão com texto uniforme em toda a home.
- [ ] **FE-07** — SEO, prévia de link e eventos de analytics. **Não iniciado.** Nenhuma ferramenta
      de analytics instalada hoje — escolher uma é decisão de produto, não técnica. Open Graph/Twitter
      Card e pré-renderização também não endereçados.

---

## FE-01 — Página /waitlist com proposta de valor e oferta

**Problema:** `/waitlist` mostra só título, 4 campos e botão. Quem vem do Instagram não vê o que é o produto, quanto custa nem o requisito Garmin. A home já tem tudo isso.

**Proposta:**

- Acima do formulário:
  - Título: "IA para assessorias de corrida".
  - Slogan: "A IA propõe. O treinador decide."
  - Uma frase: "O Menthoros lê os treinos dos seus atletas, mostra quem precisa de atenção e propõe o ajuste. Você revisa e decide."
- Três bullets (fatos já publicados na home):
  - Fila de atenção: quem precisa de você hoje, e por quê.
  - Cada sugestão vem com o motivo, sem caixa-preta.
  - Nada chega ao atleta sem o seu aval.
- Linha de oferta: "60 dias grátis, sem cartão. Depois, Basic a R$ 99/mês (1 técnico, até 20 atletas)."
- Aviso de requisito visível antes do envio: "Hoje o Menthoros lê dados do Garmin. Usa outra marca? Conta pra gente no formulário."
- Uma captura real do painel (fila de atenção) ao lado do formulário no desktop e abaixo dele no celular.
- Contador de vagas (FE-04).
- Layout mobile-first: formulário visível sem rolar mais de uma tela em 390 px de largura.

**Verificar no código:**

- Se `/waitlist` e a home compartilham componentes (hero, oferta) que possam ser reutilizados.
- De onde vêm os textos de preço da home, para não duplicar valores fixos.

**Critérios de aceite:**

- A página responde, sem rolar no desktop: o que é, para quem, quanto custa, requisito Garmin.
- Preço e condições idênticos aos da home.
- Nenhuma menção a integração além do Garmin.

---

## FE-02 — Formulário único de solicitação de acesso

**Problema:** existem dois formulários com campos diferentes. `/waitlist` pede nome, e-mail, telefone e "Você é"; a home pede nome, e-mail e número de atletas. Os botões também diferem ("Reservar minha vaga" × "Solicitar acesso").

**Proposta:**

- Um componente de formulário único, usado na home e em `/waitlist`.
- Campos:
  - Nome (obrigatório).
  - E-mail (obrigatório).
  - WhatsApp (opcional, com máscara BR).
  - Você é (obrigatório): dono de assessoria, treinador, atleta.
  - Número de atletas (obrigatório para dono e treinador; oculto para atleta).
  - Relógio predominante dos atletas (obrigatório para dono e treinador): Garmin, Coros, Polar, Apple Watch, outro, não sei.
  - Consentimento LGPD (obrigatório), com link para a Política de Privacidade.
- Botão: "Solicitar acesso" nos dois lugares.
- Envio para o endpoint único (BE-01), incluindo UTMs (FE-03) e a página de origem.
- Estados: carregando, erro de validação por campo, erro de rede com nova tentativa, e-mail já cadastrado (tratado como sucesso).

**Verificar no código:**

- Opções atuais do campo "Você é" e o contrato de cada formulário hoje.
- Biblioteca de formulário e validação em uso.

**Critérios de aceite:**

- Home e `/waitlist` enviam o mesmo payload.
- Reenvio com o mesmo e-mail não mostra erro ao usuário.
- Formulário utilizável só com teclado e com rótulos associados aos campos.

---

## FE-03 — Captura e persistência de UTMs

**Problema:** não há como saber qual canal ou post gerou cada solicitação.

**Proposta:**

- Na primeira carga, ler `utm_source`, `utm_medium`, `utm_campaign` e `utm_content` da URL.
- Guardar em `sessionStorage`, para sobreviver à navegação entre home e `/waitlist`.
- Enviar os quatro valores no payload do formulário, junto com `landing_path` e `referrer`.
- Sem UTM na URL: enviar os campos vazios, sem valores inventados.

**Verificar no código:**

- A rota usa hash (`/#/waitlist`). Confirmar se a query string chega antes ou depois do `#` após o redirect de `menthoros.com/waitlist` e ler dos dois lugares.
- Se o redirect 302 de `menthoros.com` para `app.menthoros.com` preserva a query string.

**Critérios de aceite:**

- Abrir `menthoros.com/waitlist?utm_source=instagram&utm_medium=bio&utm_content=teste` e enviar o formulário grava os três valores no lead.

---

## FE-04 — Contador de vagas com fonte única

**Problema:** "10 vagas" está escrito à mão na home e em `/waitlist`, e a bio do Instagram diz "Restam 4".

**Proposta:**

- Consumir o endpoint de vagas (BE-04) na home e em `/waitlist`.
- Exibir "Restam N de 10 vagas na turma fundadora".
- Sem vagas: trocar título e botão para "Entrar na lista da próxima turma" e manter o formulário ativo.
- Falha do endpoint: exibir "Turma fundadora" sem número. Nunca um número fixo de reserva.
- Substituir todas as ocorrências de "10 vagas" em texto fixo.

**Verificar no código:**

- Todas as ocorrências de "10 vagas" e "programa fundador" no repositório.

**Critérios de aceite:**

- Alterar o número no backend muda home e `/waitlist` sem novo deploy do frontend.

---

## FE-05 — Tela de sucesso com próximo passo

**Problema:** depois do envio, o lead não sabe o que acontece nem quando.

**Proposta:**

- Mensagem por perfil:
  - Dono ou treinador com Garmin: "Recebemos sua solicitação. Você recebe um e-mail agora e uma resposta minha em até 24 horas."
  - Dono ou treinador com outra marca: "Hoje o Menthoros lê dados do Garmin. Anotei a marca dos seus atletas e aviso quando a integração entrar."
  - Atleta: "O Menthoros é para assessorias. Indique para o seu treinador." com botão de compartilhar o link.
- Link para o Instagram @menthoros.
- Disparar o evento de conversão (FE-07) só nesta tela.

**Verificar no código:**

- Se o prazo de 24 horas é viável hoje. Ajustar o texto ao prazo real.

**Critérios de aceite:**

- As três variações aparecem conforme as respostas do formulário.

---

## FE-06 — Ajustes de conteúdo na home

**Problema:** pontos da home contradizem o posicionamento ou reduzem a confiança.

**Proposta:**

- Trocar "assessorias de endurance" por "assessorias de corrida" no hero, na meta description e nas seções.
- Seção "Quem constrói": foto real e nome completo no lugar da inicial "L".
- Dados de demonstração (Lucas Ferreira, Hugo Silva e demais): adicionar o rótulo "exemplo ilustrativo".
- Seção de depoimentos preparada, mas renderizada só quando houver ao menos um depoimento cadastrado. Sem conteúdo fictício.
- Botões de conversão com o mesmo texto: "Solicitar acesso".

**Verificar no código:**

- Se os textos estão em arquivo de i18n ou espalhados em componentes.

**Critérios de aceite:**

- Busca por "endurance" no frontend não retorna texto visível ao usuário.
- Nenhum bloco de depoimento aparece sem dado real.

---

## FE-07 — SEO, prévia de link e eventos de analytics

**Problema:** o site só entrega metadados sem JavaScript, e `/waitlist` não tem prévia própria quando o link é colado em DM ou WhatsApp. Não há eventos de funil confirmados.

**Proposta:**

- Open Graph e Twitter Card próprios para a home e para `/waitlist`: título, descrição e imagem 1200 × 630.
- Avaliar pré-renderização (ou rota sem hash) para a home e `/waitlist`, para que crawlers leiam o conteúdo.
- Eventos de analytics:
  - `waitlist_view`
  - `waitlist_form_start` (primeiro campo focado)
  - `waitlist_form_submit`
  - `waitlist_form_success`, com `utm_source` e `utm_content`
- Título da página `/waitlist`: "Solicitar acesso — Menthoros".

**Verificar no código:**

- Qual ferramenta de analytics está instalada, se houver.
- Viabilidade de pré-renderização no build atual (Vercel).
- Consentimento de cookies exigido pela ferramenta escolhida.

**Critérios de aceite:**

- Colar `menthoros.com/waitlist` no WhatsApp mostra título, descrição e imagem próprios.
- Os quatro eventos aparecem na ferramenta de analytics em um envio de teste.
