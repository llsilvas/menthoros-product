# add-descanso-explicito-por-fadiga — reduzir a frequência da semana vira prescrição explícita, não omissão

**Tamanho:** L · **Trilha:** Full
**Status:** proposta
**Criado:** 2026-09-22
**Seguida por:** change de front (exibir o descanso com motivo no plano do treinador) — o backend
não vai para `main` antes dela.

> Origem: plano do Leandro (`d83c4c31`, 4 dias disponíveis: SEG/TER/QUI/SAB). Em 22/09, 5 de 7
> gerações para a semana cheia vieram com **3 treinos**, sempre sem a quinta — o dia da sessão de
> intensidade. Em uma delas o `objetivoSemanal` dizia "incluir fartlek leve" e nenhum fartlek veio.
> O mesmo já acontecia antes (16/09 20:57: a terça sumiu).

## Why

Ter dias disponíveis não obriga a treinar em todos — a literatura trata frequência como variável de
prescrição. Mas diz também **como** cortá-la:

- **Autorregulação** ajusta intensidade, volume e frequência pela prontidão do dia. Nos protocolos
  guiados por VFC, prontidão baixa prescreve **baixa intensidade ou descanso**, como decisão
  explícita do dia (Kiviniemi 2007; Javaloyes/Vesterinen, revisões de 2020-2021).
- **Hierarquia do corte:** primeiro volume; intensidade mantida; frequência só moderadamente. No
  taper, manter a frequência rende mais do que reduzi-la (Bosquet 2007); em endurance, ~20% de corte
  de frequência é citado como limite antes de perder desempenho (Mujika & Padilla 2000).
- **Pular pontualmente não custa condicionamento:** VO2max mantido por 15 semanas com frequência
  reduzida, desde que a intensidade se mantenha (Hickson 1981).
- **Overreaching funcional** se resolve com um corte breve e deliberado de volume/intensidade;
  o que produz sobretreino é sobrecarga sem recuperação (Meeusen 2013, consenso ECSS/ACSM).

O sistema viola as duas condições. **O corte é silencioso**: o schema não tem descanso, então um dia
omitido é indistinguível de um esquecimento — o treinador não sabe se foi decisão. **O corte não tem
gatilho nem limite**: acontece em 5 de 7 gerações com o mesmo estado do atleta, e nada confere se os
dias disponíveis foram cobertos (`PlanQualityChecker` só mede `DIAS_PERMITIDOS`, depois do retry).

Para o treinador: hoje ele precisa perceber sozinho que falta um dia e adivinhar o porquê. Depois
desta change, cada dia disponível chega ao plano como treino ou como **descanso com motivo** —
"Quinta: descanso — TSB −18, abaixo do limiar de −15" — e ele aprova, edita ou rejeita. Para a
assessoria, plano que "some dia" sem explicação é o tipo de falha percebida como o produto não
funcionando — e pesa na renovação.

**Coach-in-the-loop.** O descanso é uma proposta da IA como qualquer treino: entra no mesmo fluxo de
revisão do plano, e o treinador pode discordar — criar um treino no dia de descanso substitui o
descanso (nesta change, no backend). A tela para isso é pré-requisito da change de front seguinte,
não follow-up opcional.

## What Changes

Backend. Contrato da LLM (schema v1 e v2), validação do plano, persistência e DTO de saída.

- **Campo `descansos` no plano da LLM** — `[{diaSemana, motivo}]`, fora de `treinosPlanejados`.
  Descanso não é treino: colocá-lo na lista de treinos o faria ser marcado PERDIDO no encerramento
  da semana, contar no denominador de aderência, ocupar slot na redistribuição e cair na conformidade
  do skeleton (ver `design.md`, Decisão 1).
- **Regra de cobertura (determinística, no validador do plano):** os dias dos treinos + os dias de
  descanso cobrem os dias disponíveis efetivos da semana — sem sobra, sem repetição, sem dia fora.
  Violação vai para o turno de reparo do `PlanoResilienceService` ("faltou quinta: prescreva um treino
  ou, se houver sinal de fadiga, um descanso com motivo").
- **Descanso exige sinal de fadiga** — cinco sinais, calculados por completo (não só o primeiro
  portão que dispara): TSB abaixo do limiar do nível; RPE médio de 7 dias ≥ 7,5; recuperação
  insuficiente desde o último intensivo; limite de dias consecutivos atingido; check-in do dia
  DESCANSAR (quando houver). Os dois últimos já mandam descansar no prompt de hoje — sem eles, a regra
  rejeitaria o que o próprio prompt pede (achado do Codex). CTL baixo **não** libera descanso — base
  baixa pede frequência com treino leve.
- **O motivo cita o sinal com número e limiar** ("TSB −18, abaixo do limiar de −15 para
  Intermediário"), para o treinador confiar sem abrir outra tela.
- **Limite:** `max(1, floor(dias × 0,25))` descansos por semana.
- **Prompt:** instrução explícita — cobrir todo dia disponível; sem sinal, dia de intensidade que não
  cabe vira treino leve; com sinal, até N dias podem virar descanso, cada um com motivo.
- **Persistência:** `tb_plano_semanal.descansos` (JSONB) + campo aditivo `descansos` no
  `PlanoSemanalOutputDto`.
- **Integrações que o descanso atravessa** (achados do Codex): caminho v2 (`SessionResolver`
  propaga `descansos`); redistribuição trata dias de descanso como bloqueados e a cobertura é
  revalidada depois dela; PROXIMA_SEMANA materializa os dias efetivos (hoje `null`); treino criado
  pelo treinador num dia de descanso remove o descanso daquele dia.
- **`treinosPlanejados`: minItems 3 → 1, maxItems 5 → 7** — todo dia disponível é coberto, inclusive
  para quem treina 6-7 dias (decisão de 2026-09-22); o limite de dias consecutivos segue valendo.

## Fora de escopo

- **Front** — exibir o descanso e o motivo no plano do treinador e na home do atleta: change própria,
  em sequência (decisão de 2026-09-22).
- Check-in de prontidão como gatilho — o motor opera muitas vezes sem check-in; entra quando houver
  cobertura de dados.
- **Planner determinístico** (`planner-engine.enabled`, hoje `false`): com skeleton, o skeleton é
  dono da frequência ("gere exatamente estas sessões") e a regra de cobertura não roda. Integrar
  descanso ao skeleton é trabalho de `planner-engine-enforcement`.
- Treino realizado em dia de descanso, edição do descanso pelo treinador (a edição já existente de
  treino não cobre descanso) — follow-up se o front pedir.

## Critérios de aceite

- **CA1** — Given dias efetivos {SEG, TER, QUI, SAB}, sem sinal de fadiga, e a LLM devolve treinos em
  SEG/TER/SAB e nenhum descanso, then o plano é rejeitado com violação `COBERTURA_DIAS` que nomeia
  QUINTA, e o turno de reparo a recebe.
- **CA2** — Given o mesmo plano com `descansos: [{QUINTA, "TSB −18 abaixo do limiar −15"}]` e sinal
  de TSB ativo, then o plano passa e é persistido com o descanso.
- **CA3** — Given descanso sem nenhum sinal de fadiga (só CTL baixo, ou nenhum), then violação
  `DESCANSO_SEM_SINAL`.
- **CA4** — Given 4 dias e 2 descansos, then violação `DESCANSO_ACIMA_DO_LIMITE` (limite 1); BVA do
  limite: 3→1, 4→1, 7→1, 8→2.
- **CA5** — Given dia repetido entre treino e descanso, dois treinos no mesmo dia, ou dia fora dos
  efetivos, then violação `COBERTURA_DIAS` específica.
- **CA6** — Given SEMANA_ATUAL com dias já passados, then a cobertura considera só os dias efetivos
  restantes; PROXIMA_SEMANA considera os dias disponíveis do atleta.
- **CA7** — Given descanso com motivo vazio/branco ou acima de 200 caracteres, then violação.
- **CA7b** — Given descanso liberado por RPE_ALTO, then a instrução ao LLM e o motivo esperado citam
  o valor (RPE médio 7d) e o limiar (7,5), não só o nome do sinal.
- **CA8** — Given plano com descanso persistido, then `GET` do plano devolve `descansos` com dia e
  motivo; plano antigo (coluna nula) devolve lista vazia.
- **CA9** — O descanso nunca aparece como treino planejado: não é marcado PERDIDO, não entra na
  aderência, não é redistribuído, não é exportado ao intervals.icu.
- **CA10** — v1 e v2 do schema aceitam `descansos`; o golden do prompt reflete a instrução nova.
- **CA11** — Given plano v2 com descanso, then `SessionResolver` o preserva até a persistência.
- **CA12** — Given redistribuição (SEMANA_ATUAL), then nenhum treino é movido para um dia de
  descanso, e a cobertura é revalidada depois.
- **CA13** — Given skeleton do planner presente, then a regra de cobertura não roda.
- **CA14** — Given o treinador cria um treino num dia de descanso, then o descanso daquele dia é
  removido do plano (auditável em log).
- **CA15** — Given 6 ou 7 dias disponíveis, then o schema aceita até 7 treinos e a cobertura exige
  todos os dias.

## Métrica de sucesso

- **Aceitação do descanso pelo treinador** (métrica-alvo do North Star, habilitada com o front): %
  de descansos mantidos sem edição vs. convertidos em treino — calibra os sinais de fadiga, como a
  taxa de aceitação das sugestões semanais.

- **Dias omitidos em silêncio:** 0 — todo plano persistido cobre os dias efetivos (hoje 5 de 7
  gerações do Leandro em 22/09 omitiam um dia).
- **Descanso com sinal:** 100% dos descansos persistidos têm motivo e sinal ativo.
- **Taxa de reprovação por cobertura** (`plano_violacao_estrutural{tipo=COBERTURA_DIAS}`) e de
  planos que esgotam o reparo — acompanhar nas duas primeiras semanas; alvo < 5% de falha final.

## Riscos e mitigações

- **Plano falhando por cobertura.** Com 1 turno de reparo, uma LLM que insiste em omitir um dia
  derruba a geração (422). Mitigação: a instrução no prompt ataca a causa; a mensagem de reparo diz
  o dia exato e as duas saídas válidas; métrica de reprovação acompanhada.
- **`minItems 3` de treinos:** com 3 dias e 1 descanso sobram 2 treinos, que o schema proíbe.
  `minItems` passa a 1; a cobertura é quem garante o número certo (já hoje, SEMANA_ATUAL com 2 dias
  restantes é incompatível com `minItems 3`).
- **`maxItems` 5 → 7:** atletas com 6-7 dias passam a receber 6-7 treinos quando não há sinal —
  mais volume de sessões. O limite de dias consecutivos e a progressão de carga continuam
  restringindo; acompanhar o volume semanal desses atletas nas primeiras gerações.
- **Janela cega do treinador.** Entre o merge do backend e o do front, `descansos` existe no banco e
  na API mas não aparece na UI: o corte deixa de ser silencioso no sistema e continua silencioso para
  o treinador. Mitigação: **o backend não vai para `main` antes da change de front** (gate da
  promoção `develop → main`).
- **Sinal fisiológico mal classificado / 422 em loop** (Codex): o prompt de hoje manda descansar em
  dois casos que não estavam entre os sinais. Mitigação: os cinco sinais, calculados completos.
- **Contrato de API aditivo** (`descansos` no DTO): front antigo ignora o campo.

## Open Questions & Assumptions

- **Decidido (2026-09-22):** sinais = TSB abaixo do limiar, RPE médio 7d alto, recuperação
  insuficiente; limite ~25% com mínimo 1; dia faltando sem sinal → turno de reparo pela LLM; front em
  change separada.
- **Assumido:** os limiares dos três sinais são os mesmos que já degradam o intervalado
  (`IntervaladoElegibilidadeService`) — um sinal, uma régua.
- **Decidido (2026-09-22, após o Codex):** limite de dias consecutivos e check-in DESCANSAR também
  são sinais; `maxItems` sobe para 7.
- **Em aberto (front):** converter treino em descanso pela UI (o inverso — criar treino no dia de
  descanso — já é coberto aqui). A edição do descanso pelo treinador deve gerar o mesmo sinal de
  edição que os treinos geram hoje, para o loop de aprendizado não ter ponto cego.
