# Proposal: landing-oferta-fundadora-v2

**Tamanho:** S · **Trilha:** Fast (um repositório, só texto e uma lista no bloco da oferta; sem
contrato de API, sem schema, sem área autenticada. A superfície é pública, então o risco é de
promessa errada, tratado em "Open Questions & Assumptions")

## Why

A landing ainda vende a oferta antiga: "60 dias grátis, sem cartão", e diz que o Menthoros "só lê
Garmin". Duas coisas mudaram em 2026-10-31:

1. O pack `founder` (`founder/offer.md`, `founder/pitch.md`) fechou a oferta v2, "Teste Fundador":
   roda em paralelo com a ferramenta atual, sem migrar nem cancelar; o fundador cadastra de 5 a 10
   atletas do treinador; a primeira semana é acompanhada; se pagar e não gostar, devolução do
   primeiro mês em até 30 dias. No painel simulado a taxa de compra não mudou (2 de 20 antes e
   depois), mas o motivo "hábito" caiu de 8 para 5 e o painel pede exatamente essas respostas à
   objeção "dá trabalho migrar".
2. O founder confirmou o estado das integrações: Garmin direto funciona; Apple Watch e outras
   marcas entram via intervals.icu, integração feita e **em teste**, ainda sem usuário real.

A copy atual contradiz as duas coisas, e o plano de marketing (`founder/marketing.md`) depende da
landing coerente antes de 2026-11-02 (primeira tarefa: conferir categoria, vagas, oferta e preço,
integração ativa e texto do botão).

## What Changes

Só `apps/menthoros-front/src/landing/**` (texto em `content.ts`, uma lista no
`FounderOfferCard` de `sections.tsx` e os testes que citam a copy antiga).

- **Hero** (`hero.scarcity`): acrescenta "em paralelo, sem migrar" à linha das vagas.
- **Bloco da oferta fundadora** (`founderOffer`): além da linha do teste e da condição pós-teste,
  três itens curtos (roda em paralelo; você convida de 5 a 10 atletas pelo link e acompanhamos a primeira
  semana; devolução do primeiro mês em até 30 dias se pagar e não gostar). A nota de continuidade
  atual permanece.
- **Integrações** (`garminNotice`, `how.steps[0]`, FAQ do relógio, `accessSuccess.outraMarca`):
  Garmin lido direto; Apple Watch e outras marcas "em teste via intervals.icu"; nenhum texto
  promete que a outra marca já funciona. O texto também diz que o **atleta** aceita o convite e
  autoriza a conexão com o Garmin (OAuth do próprio atleta, `garmin-connection`): o fundador
  cadastra o registro, mas não conecta o relógio de ninguém (achado de `founder/ops.md`, seção 1).
- **FAQ**: "Quanto custa?" inclui a devolução; nova pergunta "Preciso largar a ferramenta que uso
  hoje?" (não; roda em paralelo).
- **Proposta de valor de `/waitlist`** (`valueProposition.offerPre/offerPost`): mesma condição em
  forma curta, com o paralelo.

## Non-Goals

- Planos PRO, ENTERPRISE e SCALE: seguem como "previstos", sem mudança.
- Qualquer promessa de horas economizadas, depoimento ou caso de outra assessoria (não existem
  dados; ver `founder/offer.md`, seção 3).
- Prometer Strava ou outra integração além de intervals.icu.
- Data de encerramento da turma (proposta 30/11 pendente de confirmação); as vagas continuam lidas
  do endpoint `/api/v1/founders/slots` onde já são.
- Mudar o formulário, seus campos, consentimentos ou o backend (o segmento `OTHER_BRAND` continua
  sendo derivado como hoje).
- Processo operacional de devolução e de cadastro dos atletas pelo fundador (fora do código).

## Critérios de aceite

- **CA-01** Dado a home, quando o bloco da oferta fundadora é renderizado, então ele mostra as três
  condições (paralelo sem migrar; convite de 5 a 10 atletas por link, com primeira semana acompanhada;
  devolução do primeiro mês em até 30 dias) e mantém a ordem programa, teste, pós-teste, aviso de
  contratação e botão.
- **CA-02** Dado qualquer superfície com `garminNotice` (home e `/waitlist`), então o texto diz que
  o Garmin é lido direto e que Apple Watch e outras marcas estão em teste via intervals.icu, e não
  contém "só lê" nem "ainda não".
- **CA-03** Dado o envio do formulário com segmento `OTHER_BRAND`, então a mensagem de sucesso diz
  que a marca está em teste via intervals.icu e que o treinador será avisado; não diz que o
  Menthoros "só lê Garmin".
- **CA-04** Dado o FAQ, então "Quanto custa?" cita a devolução de 30 dias e existe a pergunta sobre
  rodar em paralelo.
- **CA-07** Dado o item de convite dos atletas no bloco da oferta e no FAQ, então o texto diz que o
  treinador convida e que cada atleta aceita e autoriza a conexão com o Garmin; nenhum texto diz que
  o Menthoros cadastra atleta ou conecta o relógio em nome do treinador.
- **CA-05** Dado o texto visível da landing, então não há "ilimitado" para atletas, "gratuito"
  permanente, horas economizadas, depoimento, Strava, nem "restam N" fixo no texto corrido.
- **CA-06** `npm run lint && npm run build` e os testes de `src/landing` e `src/pages/waitlist`
  passam, com os testes atualizados para a copy nova.

## Métrica de sucesso

Ligada à rotina do treinador pela porta de entrada: dos treinadores que solicitam acesso, a parcela
que revisa a primeira proposta em até 7 dias (meta do plano de marketing: 60% ou mais; revisar a
oferta se ficar abaixo de 40%). Também a conversão landing para solicitação (hipótese do vault:
acima de 5%, não medida). Nenhuma das duas está medida hoje.

## Open Questions & Assumptions

Premissas assumidas, a confirmar antes do merge:

1. **A1** Garmin direto está funcionando em produção para as fundadoras (dito pelo founder em
   2026-10-31, não verificado por mim).
2. **A2** intervals.icu cobre Apple Watch e outras marcas, "em teste", sem usuário real. A copy diz
   "em teste" e não promete prazo.
3. **A3** A devolução de 30 dias é compromisso do founder. Falta o processo (estorno no processador
   de cobrança) e a revisão de um contador ou advogado do texto, que não é aconselhamento jurídico.
   O direito de arrependimento de 7 dias da compra online vale de qualquer forma.
4. **A4** O fundador consegue acompanhar a primeira semana de cada vaga (custo em horas dele, sem
   caixa). **Decisão do founder em 2026-11-01: o Menthoros não cadastra atletas pelo treinador**; o
   treinador convida pelo link do produto.
5. **A5** A oferta v2 ainda não foi testada com compradores reais; o painel simulado não mostrou
   aumento de compra. A landing é o primeiro teste real.

Em aberto: data de encerramento da turma; se o texto fala em primeira pessoa (o rodapé "Quem
constrói" já usa "Leandro") ou em "nós". A proposta usa "cadastramos", neutro.
