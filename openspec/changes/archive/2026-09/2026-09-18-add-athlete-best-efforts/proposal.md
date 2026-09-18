# add-athlete-best-efforts — melhor tempo por distância (400m→10k), janela rolante de 42 dias

**Tamanho:** M · **Trilha:** Full
**Status:** proposta
**Criado:** 2026-09-18

> Reescrito em 2026-09-18 após review de produto (veredito: **Reconsider** — a v1 era 100%
> atleta-facing sem elo com a rotina do coach, e não constava no `SPRINTS.md`). Esta versão amarra
> a feature ao coach (perfil do atleta que ele já usa) e à trilha existente de projeção de
> prova/limiar. A parte de alimentar `RiegelCalculator`/inferência de limiar com o melhor esforço
> atual foi **destacada para a change `use-best-effort-for-threshold-inference`** (D5 abaixo) — o
> risco de mudar o insumo de uma inferência que afeta zonas/prescrição merece sequenciamento e DoR
> próprios, não ir junto com "mostrar uma tabela".

## Why

O Menthoros já tem **`recordes`** (`AtletaPerfilCoachOutputDto.recordes`, calculado por
`AtletaProgressServiceImpl.getRecordes`) — PR do atleta por `5k`/`10k`/`21k`, já visível no perfil
que o coach abre. Mas isso mede **o treino inteiro**: casa a distância total do `TreinoRealizado`
contra uma banda de tolerância. Não cobre distâncias curtas (`400m` a `3k`) porque essas acontecem
**dentro** de um treino mais longo (ex.: o melhor 1km de uma corrida de 10km), não como o treino
inteiro — o `getRecordes` atual estruturalmente não enxerga isso.

"Melhores Esforços" é esse conceito diferente: melhor tempo contínuo por distância de referência,
numa janela rolante (42 dias, como o próprio intervals.icu mostra por padrão), incluindo as
distâncias curtas. Investigação técnica confirmou que o Menthoros não tem como calcular isso
localmente com precisão — não guarda stream de GPS, só resumo (`TreinoRealizado`) e laps de ~1km
(`EtapaRealizada`), insuficientes pra achar o trecho contínuo exato de 400m/800m/1.5k dentro de um
treino maior. O intervals.icu já calcula isso certo, com o stream real deles, e expõe via API:
`GET /api/v1/athlete/{id}/pace-curves{ext}?type=Run&curves={janela}` (schema confirmado no OpenAPI
spec público, `GET https://intervals.icu/api/v1/docs` — `DataCurveSetPaceCurve` →
`list[0].distance[]`/`list[0].values[]`, pares distância-metros/tempo-segundos).

**D5 — por que o coach:** hoje o coach só vê PR de corrida inteira. As distâncias curtas (400m-3k)
são exatamente o que alimenta `RaceProjectionSkill`/`RiegelCalculator` (projeção de prova) e a
inferência de limiar (`infer-threshold-from-race-result`, arquivada 2026-07-17) — ambas hoje
dependem de o atleta ter cadastrado uma prova ou de médias de treino, sem olhar pro melhor esforço
recente do atleta. Expor isso no perfil do coach é o primeiro passo pra essa trilha (fechada na
change de sequência, D5 abaixo) — e já ajuda a rotina de hoje: o coach calibra ritmo/prova olhando
o dado mais atual do atleta, não só a última prova cadastrada ou a média genérica de treinos.

## What Changes

- **Backend — busca:** novo método `IntervalsIcuClient.buscarPaceCurves(token, externalAthleteId,
  janela)` — `GET /api/v1/athlete/{id}/pace-curves{ext}?type=Run&curves={janela}`. Extrai do
  `DataCurve` os pontos mais próximos de `400, 800, 1500, 1609.34, 3000, 5000, 10000` metros (ver
  design.md pro algoritmo de tolerância).
- **Backend — coach:** `AtletaPerfilCoachOutputDto` ganha um campo novo `melhoresEsforcos` (lista
  de `{distanciaLabel, distanciaMetros, tempoSegundos, paceLabel}`), populado no mesmo padrão
  partial-failure do endpoint (`buscarLista`/`buscarNullable`, `CoachAthleteProfileServiceImpl`) —
  atleta sem integração ou sem dados suficientes: lista vazia, sem quebrar o resto do perfil.
- **Backend — atleta:** novo endpoint `GET /api/v1/atletas/me/melhores-esforcos?janela={42d|1y|all}`
  reaproveitando o mesmo client/algoritmo, pro atleta ver a própria tabela na tela de Progresso.
- **Frontend:**
  - Perfil do atleta visto pelo coach (`CoachAthleteProfilePage`): nova seção "Melhores Esforços".
    `recordes` (PRs) existe no DTO mas não tem UI própria hoje (só fixture de teste) — sem
    precedente visual a copiar; a task de implementação escolhe o painel certo (ver design.md §8).
  - Tela de Progresso do atleta: nova aba/seção "Esforços", com seletor de janela (42 dias / 1 ano
    / histórico) e tabela distância × tempo × pace. Sem integração conectada: CTA "Conectar
    intervals.icu" (reaproveita o fluxo já existente).

### Non-goals

- Não calcula localmente a partir de `EtapaRealizada`/laps — nem como fallback do intervals.icu.
- Não sincroniza nem persiste as marcas no banco do Menthoros — leitura direta a cada requisição
  (com cache em memória, ver design.md). Sem migration.
- Não altera `getRecordes`/`ALVOS_RECORDE` (o PR de corrida inteira 5k/10k/21k) — convivem como dois
  conceitos complementares, sem fundir os cálculos.
- **Não** alimenta `RiegelCalculator`/`RaceProjectionSkill`/inferência de limiar com o melhor
  esforço — isso é a change de sequência `use-best-effort-for-threshold-inference` (D5), que só
  parte depois desta estar em produção e o dado já existir de verdade pro coach conferir.
- Não cobre outras modalidades (bike, natação) nem `power-curves`/`hr-curves` — só `pace-curves`
  tipo `Run`.
- Não expõe o `activities` map do `DataCurveSetPaceCurve` (metadado de qual atividade gerou cada
  marca) — v2, se o coach pedir "ver o treino da marca".

## Critérios de aceite

**CA1 — coach vê melhores esforços no perfil do atleta**
Given um atleta com integração intervals.icu ativa e atividades de corrida na janela
When o coach abre o perfil do atleta (`GET /coach/atletas/{id}/perfil`)
Then `melhoresEsforcos` traz tempo e pace pra cada distância que o intervals.icu tiver no curve
(algumas podem faltar se nada cobriu aquela distância).

**CA2 — atleta sem integração conectada, nos dois lugares**
Given um atleta sem `IntegracaoExterna` ativa
When o coach abre o perfil dele, ou o atleta abre a própria tela de Progresso
Then ambos veem lista vazia/CTA de conexão — sem erro genérico, sem quebrar o resto da tela.

**CA3 — atleta conectado sem dados suficientes na janela**
Given um atleta conectado mas sem corridas cobrindo alguma distância na janela pedida
Then essa distância não aparece na lista — sem inventar dado, sem 500.

**CA4 — troca de janela atualiza a tabela (tela do atleta)**
Given a tela de Progresso carregada com janela `42d`
When o atleta troca pra `1y`
Then a tabela recarrega com os valores da nova janela.

**CA5 — falha do intervals.icu não quebra a página**
Given a chamada ao intervals.icu falha (timeout, 5xx)
When o coach abre o perfil ou o atleta abre Progresso
Then o resto da tela carrega normalmente — o padrão partial-failure já cobre isso no perfil do
coach (`avisos`); a tela do atleta mostra erro localizado à seção, com tentar de novo.

## Métrica de sucesso

Ligada à rotina do coach (`config.yaml`): % de perfis de atleta abertos pelo coach em que
`melhoresEsforcos` tem pelo menos 1 distância preenchida, nas primeiras 4 semanas — mede se o dado
está realmente disponível pra calibração, pré-condição pra D5 fazer sentido. Métrica secundária
(atleta): % de atletas conectados que abrem a aba Esforços pelo menos uma vez.

**Instrumentação:** contador Micrometer `melhores_esforcos.perfil.exibido` (tags `preenchido=true|
false`), incrementado em `CoachAthleteProfileServiceImpl.buscarPerfil` toda vez que o campo
`melhoresEsforcos` é montado — mesmo padrão de métrica já usado no módulo (ver `CLAUDE.md` do
backend, "External Call Resilience" → "Expose metrics"). Task dedicada em `tasks.md` (2.5).

## Rollback & Risco

- **Reverter é trivial:** sem migration, sem dado persistido pelo Menthoros — reverter o PR (back e
  front) volta ao estado anterior sem qualquer limpeza de banco. O campo novo em
  `AtletaPerfilCoachOutputDto` é `@JsonInclude(NON_NULL)`; um cliente front mais antigo (durante um
  deploy backend-primeiro) simplesmente não lê o campo — sem quebra de contrato.
- **Rate limit do intervals.icu:** mitigado pelo cache em memória de 5 min por (atleta, janela)
  (design.md §6). Se mesmo assim o rate limit for atingido em produção, o efeito é degradado (a
  seção some/mostra erro localizado — CA5), nunca quebra o resto da tela.
- **Risco do escopo OAuth:** se a task 1.1 descobrir que `ACTIVITY:READ` **não** cobre
  `pace-curves` (403 na chamada real), o plano B é: (a) verificar se existe escopo adicional
  documentado na API do intervals.icu e, se sim, avaliar se pedir esse escopo novo exige
  reconsentimento do atleta (afeta quem já conectou); (b) se não houver escopo viável, a change para
  aqui — reportar ao founder antes de prosseguir para as tasks 1.2+. Não é um risco que aborta em
  silêncio: task 1.1 é a primeira do plano exatamente para decidir isso antes de qualquer código.

## Impact

- **Repositórios:** `apps/menthoros-backend` (client novo, campo novo no DTO do perfil, endpoint
  novo pro atleta) e `apps/menthoros-front` (seção no perfil visto pelo coach + aba na tela do
  atleta).
- **API:** `AtletaPerfilCoachOutputDto` ganha campo novo (compatível — `@JsonInclude(NON_NULL)`,
  não quebra clientes existentes); endpoint novo pro atleta.
- **Banco:** nenhuma migration.
- **Externo:** nova chamada ao intervals.icu, usa o token já armazenado — `ACTIVITY:READ` (escopo
  já concedido na conexão) **confirmado suficiente** contra a API real (task 1.1, 2026-09-18).

**Dívida técnica conhecida, aceita conscientemente (2026-09-18):** `CoachAthleteProfileServiceImpl
.buscarPerfil` é `@Transactional(readOnly = true)`; `melhorEsforcoService.buscar` roda **dentro**
dessa transação e faz uma chamada HTTP externa real (intervals.icu, timeout 5s/10s configurado em
`IntervalsIcuWebClientConfig`) — diferente dos demais campos do perfil, que são só leitura de
banco. Isso segura uma conexão do pool pelo tempo da chamada externa, a mesma classe de risco já
documentada no `CLAUDE.md` (ADR-0008, "External Call Resilience"). Mitigado por: timeout limitado
(nunca indefinido), cache compartilhado (`melhores-esforcos`, TTL 30min — repete pouco), e o
padrão partial-failure (`buscarLista`) já isola a falha sem quebrar o resto do perfil. **Não
corrigido agora** porque a correção correta (tirar a chamada de dentro da transação) exige extrair
boa parte da lógica de `buscarPerfil` pra uma classe própria — self-invocation não respeita
`@Transactional` no Spring, então não dá pra só "chamar antes" dentro da mesma classe. Se isso
virar problema real em produção (esgotamento de pool sob carga), a extração vira change própria.

## Open Questions & Assumptions

**Resolvido (task 1.1, 2026-09-18):**
- `ACTIVITY:READ` cobre `pace-curves` — confirmado com chamada real contra a conta de teste
  (Leandro).
- O `DataCurve` tem pontos **exatos** (desvio 0,00%) nas 7 distâncias-alvo — não é amostra esparsa;
  tolerância de 1% no design.md é folga de arredondamento, não compensação de amostragem.

**Em aberto:**
- D5 (`use-best-effort-for-threshold-inference`) fica registrada como change de sequência —
  proposta separada, só depois desta em produção. Não bloqueia esta change.

**Em aberto:**
- D5 (`use-best-effort-for-threshold-inference`) fica registrada como change de sequência —
  proposta separada, só depois desta em produção. Não bloqueia esta change.
- Tolerância exata de "distância mais próxima" e TTL do cache: definidos em design.md, sujeitos a
  ajuste pela task 1.1.
