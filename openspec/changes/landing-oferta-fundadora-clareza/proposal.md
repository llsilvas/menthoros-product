# Proposal: landing-oferta-fundadora-clareza

**Tamanho:** M · **Trilha:** Full (superfície pública de marketing, critérios de acessibilidade
WCAG mensuráveis, e quatro decisões comerciais pendentes — D-01 a D-04 — que bloqueiam parte do
conteúdo; classificação também vale pelo próprio critério do `config.yaml`: mexe em comunicação
pública que pode induzir o visitante a erro sobre a oferta comercial)

## Status

- Especificação recebida do founder em 2026-09-06 (documento formal, v1.0), com origem em duas
  avaliações manuais da landing pública (`avaliacao.md` e uma reavaliação posterior).
- Parte do trabalho de UX desta mesma superfície já foi entregue fora de change formal, direto na
  branch `fix/landing-page-clareza` (PR #107, mergeado 2026-09-06): rótulos persistentes no
  formulário, scrim da nav sobre o vídeo, menção a "assessorias de endurance" no hero, redução de
  travessões usados como vício de escrita de IA, espaçamento entre Hero e a seção seguinte, e uma
  primeira tentativa de hierarquia visual nos 5 planos (opacidade reduzida nos 4 que não são o
  fundador). Esta change **refina e substitui** esse último ponto (RF-03) e adiciona os requisitos
  novos que a avaliação seguinte encontrou (RF-01, RF-02, RF-04 a RF-06).

## Why

A página apresenta um cartão "Gratuito — R$ 0/mês" ao lado do Basic destacado, mesmo a gratuidade
sendo limitada aos primeiros 60 dias do programa fundador. A comparação de planos futuros ao lado
da única oferta real pode levar o visitante a entender que existe um plano gratuito permanente. O
formulário de acesso também não explica o que acontece depois do envio (canal de retorno, prazo,
se há seleção).

Regra confirmada pelo founder nesta conversa, que prevalece sobre a dúvida registrada nas
avaliações anteriores: **a gratuidade dura 60 dias e não é um plano permanente.**

## What Changes

Antes de solicitar acesso, o treinador deve entender: que está solicitando acesso ao **programa
fundador**; que a gratuidade dura **60 dias** e não é plano permanente; quais são as **condições de
continuidade paga**; e **como funciona o retorno** após a solicitação.

- **RF-01** Apresentação inicial (hero): mantém a descrição e a ação atuais, mas explicita
  "Programa fundador · 10 vagas · 60 dias grátis, sem cartão" e uma indicação curta de continuidade
  paga com link para a seção de preços.
- **RF-02** Novo bloco dedicado à oferta fundadora, substituindo a comparação de planos como
  elemento principal — programa, período de teste, condição pós-teste (Basic), aviso de que a
  continuidade exige contratação, e a ação "Solicitar acesso".
- **RF-03** Comparação de planos: remove o cartão "Gratuito — R$ 0/mês" definitivamente (não
  substitui por outro "Gratuito" — o teste pertence à oferta fundadora, não à tabela de planos);
  planos pagos futuros ficam sob "Planos previstos para o lançamento geral", diferenciados por
  título/posição/explicação, **sem opacidade global simulando indisponibilidade** (isso substitui a
  abordagem de opacidade reduzida entregue no PR #107); sem botões "Assinar"; Scale nunca promete
  "ilimitado" (só "100+" está publicado).
- **RF-04** FAQ: atualiza "Quanto custa?" com as condições do bloco fundador; adiciona "Existe um
  plano gratuito permanente? Não."; prevê (sem publicar ainda) a pergunta sobre >20 atletas,
  bloqueada por D-01.
- **RF-05** Formulário: explica o próximo passo antes do envio (canal, prazo, seleção) — texto
  final bloqueado por D-03; repete a condição "60 dias grátis, sem cartão. Continuidade mediante
  contratação" de forma legível junto à ação.
- **RF-06** Estados do formulário: audita o que já existe (vazio/foco/preenchido, inválido,
  enviando, sucesso, falha, resultado incerto por interrupção) e corrige só as lacunas reais —
  sem alterar termos de consentimento nem adicionar campos.
- Acessibilidade: contraste medido (não só avaliado por captura) — mínimo 4.5:1 texto comum, 3:1
  texto grande e elementos não textuais de estado; foco visível e ordem de tab; validação em
  360/390/768/1440px e zoom 200%.

## Non-Goals (fora de escopo, textual do documento)

Criar checkout, alterar cobrança, implementar encerramento de acesso, definir retenção de dados,
modificar a área autenticada, ou reconstruir a página. Nenhuma inconsistência entre o texto proposto
e a operação real pode ser publicada antes de resolvida.

## Decisões pendentes (bloqueiam parte do conteúdo — CA-11)

Responsável: produto/comercial do Menthoros. Ver `design.md` para o texto exato de cada uma.

| ID | Decisão | Bloqueia |
|---|---|---|
| D-01 | Fundadores podem escolher Pro/Enterprise/Scale ao fim do teste? Caminho para >20 atletas? | RF-04 (pergunta nova do FAQ), parte de RF-02 |
| D-02 | Capacidade (atletas/técnicos) durante os 60 dias de teste | RF-02 (texto sobre o teste) |
| D-03 | Canal e prazo de retorno; existe seleção/conversa inicial? | RF-05 (frase final), estado de sucesso de RF-06 |
| D-04 | Os 60 dias começam na aprovação, na ativação da conta, ou em outro evento? | RF-02, RF-05 |

**O que NÃO está bloqueado e pode ser implementado agora:** remover o cartão Gratuito (RF-03),
reorganizar oferta fundadora e planos pagos com o texto já publicado hoje (RF-01, RF-02 na parte não
dependente de D-01/D-02/D-04), FAQ "gratuito permanente? não" (RF-04, primeira metade), e todo o
trabalho de acessibilidade/contraste/estados de formulário (seção 5, RF-06).

## Impact

- Repositório: `apps/menthoros-front` apenas (`src/landing/**`). Sem mudança de contrato de API,
  sem migration, sem alteração de área autenticada.
- Métrica de sucesso: os 11 critérios de aceite (`CA-01` a `CA-11`) em `design.md`.
