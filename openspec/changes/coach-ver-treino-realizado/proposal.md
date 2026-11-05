**Tamanho:** L · **Trilha:** Full

# Proposal — coach-ver-treino-realizado

O treinador passa a abrir a **execução do treino realizado** a partir do card do treino no plano do
atleta: um dialog que começa pela comparação **planejado × realizado**, traz a leitura da análise
da IA, a distribuição do tempo em zonas de FC contra a zona alvo e a tabela de etapas, com os demais
dados do relógio num acordeão.

- Protótipo aprovado (2026-11-04): canvas https://claude.ai/artifact/VP1ansprK91AS7fBTwWocH,
  artboard **B · Planejado × realizado**.
- Protótipo em código: `menthoros-front`, branch `prototype/execucao-treino`, commit `d02e770`
  (`ExecucaoTreinoPrototypeDialog.tsx`, variante B). Referência, não mergear.
- Protótipo anterior (abas, superado): https://claude.ai/artifact/Hb9C4RZ4ruMnfMHoPeKWHY

## Status

- draft (2026-11-03): aberta a partir do protótipo de abas (Estatísticas / Intervalos).
- Revisão de produto (2026-11-03, `product-reviewer`): **Refine**. Incorporados: posicionamento como
  paridade, alternativa "deep link" registrada, métrica ancorada em tempo de revisão, Q2.
- Pre-mortem (2026-11-03, Codex): **incompleto** — caiu por limite de uso. Achados parciais
  incorporados: `.fit` sem ritmo/velocidade média da sessão, `elapsedTimeSeg` fora do DTO,
  semântica de `duracaoMin` por origem. Reexecutar no `/implement init`.
- **Redesenho (2026-11-04):** protótipo com 3 variantes; o treinador escolheu a B, com a faixa de
  zonas e a tabela de etapas da C. Mudanças nesta revisão:
  - layout de abas trocado por planejado × realizado;
  - drawer trocado por dialog (Q1 fechada);
  - banner da análise da IA incluído;
  - **tempo em zonas entra no escopo**: calculado no import do `.fit`;
  - tamanho de M para L.
  Os campos extras do Garmin (efeito de treino, stamina, respiração, Body Battery) continuam fora,
  como follow-up.
- Revisão de produto do redesenho (2026-11-04, `product-reviewer`): **Refine** leve. Tempo em zonas
  dentro da change foi considerado justificado (sustenta o "% no alvo", núcleo do desenho).
  Incorporados: medir cobertura de zonas nos pilotos antes de implementar (task 0.8), métrica de
  cobertura e telemetria obrigatória, não-objetivo explícito do banner, CA9 reescrito, tolerâncias
  validadas com treinador antes do merge (task 0.9). **Não acatado:** cortar o botão do card legado
  (Planos) — foi lá que o treinador aprovou o botão.

## Why

O card do treino no plano do atleta mostra só o estado "Realizado", sem ação. Para saber **como** o
treino foi feito — se ficou na zona prescrita, se as voltas saíram no ritmo — o treinador sai do
Menthoros e abre o Garmin Connect, o Strava ou o intervals.icu do atleta. Isso custa uma troca de
ferramenta por treino revisado e nem sempre é possível: o treinador nem sempre tem acesso à conta do
atleta.

A pergunta do treinador ao revisar não é "quais são todos os números", é **"o atleta fez o que eu
prescrevi?"**. Por isso a tela abre pela diferença entre planejado e realizado e pela zona, e não
por uma grade de estatísticas: a grade continua disponível, recolhida.

O dado de sessão e de voltas já está no Menthoros (`GET /api/v1/treinos/realizados/{id}`, papel
`TECNICO`/`ADMIN`). A análise da IA também (`GET /api/v1/analises/treino/{treinoRealizadoId}`).
Faltam a tela e o tempo em zonas, que nenhuma fonte grava hoje.

É **paridade** (table-stakes) com um diferencial: a comparação com o prescrito, que o Garmin Connect
não faz. Não alimenta o loop de aprendizado — neutro para o moat, declarado como não-objetivo.

**Alternativa considerada — deep link para a atividade externa:** depende de o treinador ter acesso
à conta do atleta, que é o bloqueio do Why, e não existe para `.fit` enviado à mão. Descartada.

## What Changes

- **Front — botão no card:** ação "Ver realizado" quando o treino tem `treinoRealizadoId`, no
  `TreinoCard` da tela Planos (`components/features/planos`, onde o protótipo foi aprovado) e no
  `TreinoPlanejadoCard` do shell do coach (`CurrentWeekPlan`, `PlanoDetalhePanel`).
- **Front — dialog de execução** (`CoachDialog`, largura `lg`), de cima para baixo:
  1. **Cabeçalho:** tipo, data, estado "Realizado", fonte.
  2. **Banner da análise da IA**, quando houver análise `COMPLETED`: rótulo "Análise da IA",
     chip da causa (`primaryCause`), nota de execução (`executionScore`), `summary` e
     `recommendation`. Visual `aiHighlight`; o chip usa cor de estado (verde em `NORMAL`, âmbar nas
     demais). Sem análise: ver CA6–CA7.
  3. **Tabela planejado × realizado × diferença:** distância, duração, ritmo, zona, FC média,
     esforço (RPE). Diferença colorida só quando há critério (tolerâncias no `design.md`).
  4. **Distribuição de zonas:** faixa empilhada Z1–Z5 com a zona alvo destacada e "X% no alvo";
     legenda com faixa de bpm e tempo por zona.
  5. **Etapas:** tabela em largura total, cabeçalho fixo, rolagem a partir de 360 px, linha Total
     com os valores da sessão.
  6. **Acordeão "Todos os dados do relógio"**, fechado por padrão: distância e tempo, ritmo, FC,
     dinâmica de corrida, elevação, potência, temperatura, carga (TSS, IF, decoupling), calorias e
     percepção do atleta (só RPE e comentário — Q2).
- **Front — contrato:** tipo de leitura do realizado alinhado ao `TreinoRealizadoOutputDto` (hoje
  faltam `id`, `runningDynamics`, `tssCalculado`, `intensidadeReal`, `elapsedTimeSeg`, os campos
  novos abaixo e os das etapas).
- **Backend — ritmo e velocidade média da sessão no `.fit`:** hoje só os laps têm.
- **Backend — `elapsedTimeSeg` no DTO**; **elevação por volta** no `EtapaRealizadaOutputDto` (a
  entidade tem, o DTO não expõe).
- **Backend — `velocidadeMaxKmh`, `temperaturaMinC`, `temperaturaMaxC`** da Session do `.fit`.
- **Backend — tempo em zonas de FC:** no import do `.fit`, somar o tempo das amostras (`record`)
  por zona de FC **do atleta** vigente no momento do import, e guardar o resultado com os limites
  usados. Exposto no detalhe como `tempoEmZonas`. Treinos de outras fontes, sem amostra ou de atleta
  sem zonas de FC ficam sem o campo (CA10).
- Campo ausente vira `--`, como no Garmin.

## Fora de escopo

- Efeito de treino, stamina, frequência respiratória, Body Battery, carga de impacto, hidratação,
  autoavaliação do relógio: nenhuma fonte ingere hoje. **Follow-up** (change própria), quando o
  treinador confirmar uso.
- Tempo em zonas para Strava e intervals.icu (ambos expõem algo, com as zonas deles, não as do
  Menthoros) e reprocessamento de treinos já importados (o `.fit` não é guardado).
- Gráficos de série temporal (FC/ritmo ao longo do treino).
- Estado "análise em andamento" vindo da API: o endpoint devolve 204 tanto para pendente quanto para
  inexistente. A tela infere pelo RPE (CA6–CA7); distinguir na API é outra change.
- Visão do atleta (já tem `WorkoutDetailDrawer`).
- Treino realizado sem planejado vinculado (não aparece no card do plano).
- Ligar a abertura do dialog ao loop de aprendizado.
- **Não-objetivo:** o banner da IA não gera ação, não tem botão e não escreve no plano. É leitura;
  a decisão continua do treinador.

## Critérios de aceite

- **CA1** — Given um treino planejado com `treinoRealizadoId`, When o treinador vê o card (Planos
  ou shell do coach), Then o card mostra o botão "Ver realizado".
- **CA2** — Given um treino sem `treinoRealizadoId`, Then o botão não aparece.
- **CA3** — Given o treinador clica "Ver realizado", When o dialog abre, Then ele chama
  `GET /api/v1/treinos/realizados/{id}` e `GET /api/v1/analises/treino/{id}` uma vez cada, mostra
  carregando enquanto o detalhe não chega e não bloqueia a tela esperando a análise.
- **CA4** — Given o detalhe carregado, Then a tabela planejado × realizado mostra distância,
  duração, ritmo, zona, FC média e RPE; o que faltar de um lado aparece `--` e a diferença fica
  neutra.
- **CA5** — Given a análise `COMPLETED`, Then o banner mostra causa, nota, `summary` e
  `recommendation`; campo ausente da análise some do banner sem deixar espaço vazio.
- **CA6** — Given a análise responde 204 e o treino **tem** RPE, Then aparece a faixa neutra
  "Análise da IA em andamento".
- **CA7** — Given a análise responde 204 e o treino **não tem** RPE, Then aparece a nota "A análise
  da IA depende do RPE do atleta". Given a análise `FAILED` ou erro na busca da análise, Then nenhum
  banner aparece e o resto do dialog funciona.
- **CA8** — Given o detalhe com `tempoEmZonas`, Then a faixa mostra as cinco zonas na ordem Z1→Z5,
  com a zona alvo do planejado destacada e o percentual do tempo nela.
- **CA9** — Given um `.fit` com amostras de FC importado para um atleta com zonas de FC definidas,
  Then o treino guarda o tempo por zona e os limites de bpm usados, e a soma das zonas é igual ao
  tempo coberto pelas amostras **com o teto de 5 s por intervalo entre amostras** (D6), ±1 s no
  total; mudar as zonas do atleta depois não altera o treino já importado.
- **CA10** — Given um treino sem `tempoEmZonas` (outra fonte, sem amostras ou atleta sem zonas),
  Then a seção de zonas mostra "Tempo em zonas indisponível para este treino" e a importação não
  falha.
- **CA11** — Given o detalhe com `etapasRealizadas`, Then a tabela lista as voltas por `ordem`, o
  cabeçalho fica fixo ao rolar e a linha Total usa os valores da sessão; sem voltas, estado vazio
  "Sem voltas registradas para este treino".
- **CA12** — Given um `.fit` com `enhanced_max_speed`, `min_temperature` e `max_temperature` na
  Session, Then o detalhe expõe `velocidadeMaxKmh`, `temperaturaMinC`, `temperaturaMaxC`; sem eles,
  ficam ausentes do JSON (`NON_NULL`) e a importação não falha.
- **CA13** — Given a busca do detalhe falha (404/403/rede), Then aparece erro com "Tentar de novo"
  e a tela por trás continua utilizável.
- **CA14** — Given um treino realizado de outro tenant, Then o detalhe responde 404.

## Métrica de sucesso

- **Principal — rotina:** o treinador piloto deixa de abrir Garmin Connect/Strava/intervals.icu do
  atleta para revisar a semana. Entrevista com os treinadores piloto 4 semanas após o deploy: "bom" =
  a maioria relata não precisar mais sair do Menthoros para revisar execução.
- **Principal — tempo:** minutos por revisão de atleta na semana, antes e depois, autorrelatado
  pelos treinadores piloto na mesma entrevista.
- **Secundária — uso:** aberturas do dialog por treinador ativo por semana (evento D7,
  **obrigatório nesta change**).
- **Secundária — cobertura:** % das aberturas em que a faixa de zonas aparece (não cai no CA10).
  Abaixo de 50 % depois de 4 semanas, o investimento em zonas não se pagou: priorizar zonas de
  Strava/intervals.icu ou rever o desenho.

## Dependências

- **Migrations:** `V108` já foi usada (`add_zonas_manuais_atleta`) e `garmin-activity-ingestion`
  reserva `V109`. Usar o próximo número livre em `develop` no momento do commit.
- **Zonas de FC do atleta:** usa a fonte vigente de zonas (`coach-athlete-zones` /
  `V108__add_zonas_manuais_atleta`). Sem zonas de FC, sem tempo em zonas (CA10).
- **`add-workout-metrics-analyzer`:** planeja `AthleteZoneProfile` e tempo em zona a partir de
  amostras, mas depende de `first-party-ingestion-architecture`. Esta change entrega um cálculo
  mínimo no import do `.fit` e o contrato `tempoEmZonas`; quando aquela chegar, passa a ser a dona do
  cálculo, mantendo o contrato (ver D6).
- **`garmin-activity-ingestion`:** o FIT do Garmin entra pelo mesmo pipeline do `.fit`, então
  herda o tempo em zonas sem trabalho extra.

## Open Questions & Assumptions

- **A1 — Melhor ritmo = velocidade máxima da sessão** (`enhanced_max_speed`). Ruído de GPS pode
  gerar pico irreal (R1).
- **A2 — `min_temperature` existe no SDK em uso** — confirmado no FIT SDK 21.205.0.
- **A3 — Só o `.fit` preenche os campos novos** (velocidade máxima, temperaturas, tempo em zonas).
- **A4 — Visibilidade tenant-wide:** qualquer técnico do tenant vê qualquer atleta (modelo atual).
- **A5 — `duracaoMin` muda de significado por origem** (elapsed vs. movimento); conferir na task 0.2.
- **A6 — Zonas do momento do import.** O tempo em zonas usa as zonas de FC vigentes quando o
  treino é importado e guarda os limites usados; a faixa mostra esses limites, não os atuais.
- **A7 — Amostras do `.fit`.** Assumido que o parse consegue ler as mensagens `record` (FC +
  timestamp) sem custo relevante; conferir na task 0.1 com um `.fit` de 2 h.
- **A8 — Tolerâncias da diferença** (distância ±10 %, duração ±10 min, ≥ 60 % do tempo na zona
  alvo, RPE ±1) são as do protótipo; ajustar com o treinador piloto, sem mudar o desenho.
- **Q3 — Cobertura de zonas nos pilotos (aberta, task 0.8):** quantos atletas têm zonas de FC e
  que fração dos treinos entra por `.fit`. Se for baixa, a faixa de zonas sai num PR posterior ao
  do dialog (mesma change, ordem de entrega), para não segurar o resto.
- **Q4 — Card legado (aberta):** o `TreinoCard` de Planos continua no escopo porque foi onde o
  treinador aprovou o botão; se Planos sair do roteiro do piloto, entregar só o shell do coach.
- **Q1 — Drawer vs. dialog:** **fechada (2026-11-04): dialog**, conforme protótipo aprovado.
- **Q2 — Dados de bem-estar:** **decidido (2026-11-03): só RPE e comentário** até existir vínculo
  coach↔atleta.
