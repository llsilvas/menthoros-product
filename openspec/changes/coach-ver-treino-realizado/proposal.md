**Tamanho:** M · **Trilha:** Full

# Proposal — coach-ver-treino-realizado

O treinador passa a abrir o **detalhe do treino realizado** a partir do card do treino no plano do
atleta: um painel com o resumo realizado vs. planejado e duas abas, **Estatísticas** e
**Intervalos**, no formato que ele já conhece do Garmin Connect.

Protótipo: https://claude.ai/artifact/Hb9C4RZ4ruMnfMHoPeKWHY

## Status

- draft (2026-11-03): aberta a partir do protótipo.
- Revisão de produto (2026-11-03, `product-reviewer`): **Refine**. Incorporados: posicionamento como
  paridade (table-stakes), neutro para o moat como não-objetivo, alternativa "deep link" registrada,
  métrica ancorada em tempo de revisão, visibilidade dos dados de bem-estar como decisão aberta (Q2).
  Sugestão de cortar os campos novos do backend **não** acatada: foram pedidos pelo treinador
  (2026-11-03) e o backend já precisa mudar para preencher ritmo médio do `.fit` (ver abaixo).
- Pre-mortem (2026-11-03, Codex): **incompleto** — caiu por limite de uso antes do veredito. Achados
  parciais conferidos no código e incorporados: o `.fit` não grava ritmo/velocidade média da sessão
  (`FitTreinoPersister.java:127-146` só grava nos laps), `elapsedTimeSeg` não está no DTO, e a
  semântica de `duracaoMin` (elapsed vs. timer) varia por origem. `min_temperature` confirmado no FIT
  SDK 21.205.0. Reexecutar o pre-mortem no `/implement init`.

## Why

O card do treino no plano do atleta mostra só o estado "Realizado" (`TreinoPlanejadoCard.tsx`,
`treinoPlanejadoEstado.ts`), sem ação. Para saber **como** o treino foi feito — ritmo, FC, se as
voltas do intervalado saíram no alvo — o treinador sai do Menthoros e abre o Garmin Connect, o
Strava ou o intervals.icu do atleta. Isso custa uma troca de ferramenta por treino revisado e nem
sempre é possível: o treinador nem sempre tem acesso à conta do atleta.

O dado já está no Menthoros. O backend expõe `GET /api/v1/treinos/realizados/{id}` para
`TECNICO`/`ADMIN` com métricas da sessão, running dynamics, carga (TSS, IF, decoupling) e
`etapasRealizadas` por volta. O front já tem `TreinoService.obterRealizado`, e o treino planejado
já traz `treinoRealizadoId`. Falta a tela.

É **paridade** (table-stakes): o treinador espera ver o treino executado dentro da ferramenta onde
prescreveu. Não alimenta o loop de aprendizado nem a sugestão da semana seguinte — é neutro para o
moat, e isso é declarado como não-objetivo. Hipótese, não pedido de assessoria piloto registrado.

**Alternativa considerada — deep link para a atividade externa** (Garmin Connect, Strava,
intervals.icu): barata, mas depende de o treinador ter acesso à conta do atleta, que é justamente o
bloqueio do Why, e não existe para `.fit` enviado à mão. Descartada.

## What Changes

- **Front — botão no card:** `TreinoPlanejadoCard` ganha a ação "Ver realizado" quando o treino tem
  `treinoRealizadoId`, nas telas que usam o card no shell do coach (`CurrentWeekPlan`,
  `PlanoDetalhePanel`).
- **Front — painel de detalhe:** drawer com cabeçalho (tipo, data, fonte), resumo realizado vs.
  planejado (distância, duração, FC, esforço) e duas abas:
  - **Estatísticas:** distância e tempo (distância, tempo, tempo em movimento, tempo decorrido),
    elevação, FC (média, máxima), ritmo e velocidade (médio, **melhor ritmo**, velocidade média),
    potência, dinâmica de corrida (cadência, passada, proporção vertical, oscilação, equilíbrio de
    GCT, GCT), carga (TSS, IF, decoupling, calorias), temperatura (média, **mínima**, **máxima**) e
    percepção do atleta (**só RPE e comentário** — ver Q2).
  - **Intervalos:** tabela de `etapasRealizadas` por volta (etapa, tempo, distância, ritmo, FC média
    e máxima, cadência, potência, subida, zona) com linha de total.
- **Front — contrato:** tipo `TreinoRealizado` do cliente curado alinhado ao
  `TreinoRealizadoOutputDto` (hoje faltam `id`, `runningDynamics`, `tssCalculado`,
  `intensidadeReal`, `elapsedTimeSeg`, campos de calibração e os campos novos das etapas).
- **Backend — ritmo e velocidade média da sessão no `.fit`:** hoje o `FitTreinoPersister` só grava
  pace/velocidade nos laps; a sessão fica sem ritmo médio e a tela mostraria `--` para todo treino
  importado por `.fit`. Gravar a partir de distância / tempo em movimento da Session.
- **Backend — `elapsedTimeSeg` no DTO:** a entidade tem, o `TreinoRealizadoOutputDto` não expõe;
  sem ele não há "Tempo decorrido".
- **Backend — três campos novos na sessão:** `velocidadeMaxKmh` (origem do melhor ritmo),
  `temperaturaMinC` e `temperaturaMaxC`, em `tb_treino_realizado` (migration, sem backfill),
  preenchidos pelo parse do `.fit` (`enhanced_max_speed`, `min_temperature`, `max_temperature` da
  mensagem Session) e expostos no `TreinoRealizadoOutputDto`.
- Campo ausente vira `--` na tela, como no Garmin.

## Fora de escopo

- Stamina, frequência respiratória, efeito de treino, Body Battery, carga de impacto, hidratação:
  o backend não ingere, e não há decisão do treinador que dependa deles hoje.
- Aba **Tempo em zonas**: exige série por segundo, que o backend não guarda.
- Gráficos de série temporal (FC/ritmo ao longo do treino).
- Backfill dos campos novos em treinos já importados.
- Visão do atleta: o atleta já tem `WorkoutDetailDrawer`; esta change é do shell do coach.
- Treino realizado **sem** planejado vinculado (lançamento avulso): não aparece no card do plano.
- Ligar a abertura do painel ao loop de aprendizado / sugestão da semana (neutro para o moat).

## Critérios de aceite

- **CA1** — Given um treino planejado com `treinoRealizadoId`, When o treinador vê o card, Then o
  card mostra o botão "Ver realizado".
- **CA2** — Given um treino planejado sem `treinoRealizadoId` (pendente ou perdido), When o
  treinador vê o card, Then o botão não aparece.
- **CA3** — Given o treinador clica "Ver realizado", When o painel abre, Then ele chama
  `GET /api/v1/treinos/realizados/{id}` uma vez, mostra carregando enquanto busca e abre na aba
  Estatísticas.
- **CA4** — Given o detalhe carregado, When a aba Estatísticas está aberta, Then cada métrica
  presente no DTO aparece com unidade em PT-BR (vírgula decimal) e cada métrica ausente aparece
  como `--`.
- **CA5** — Given o detalhe com `etapasRealizadas`, When o treinador abre a aba Intervalos, Then a
  tabela lista as voltas em ordem de `ordem` e a linha Total usa os valores da sessão (não a soma
  recalculada no front).
- **CA6** — Given o detalhe sem `etapasRealizadas`, When o treinador abre Intervalos, Then aparece
  um estado vazio ("Sem voltas registradas para este treino").
- **CA7** — Given a busca falha (404/403/rede), When o painel abre, Then aparece uma mensagem de
  erro com ação de tentar de novo, e o restante da tela continua utilizável.
- **CA8** — Given um `.fit` com `enhanced_max_speed`, `min_temperature` e `max_temperature` na
  Session, When ele é importado, Then o treino realizado guarda e expõe `velocidadeMaxKmh`,
  `temperaturaMinC` e `temperaturaMaxC`; a tela mostra o melhor ritmo derivado (min/km).
- **CA9** — Given um `.fit` sem esses campos, When ele é importado, Then os três ficam nulos, saem
  ausentes do JSON (`NON_NULL`) e a importação não falha.
- **CA10** — Given um treino realizado de outro tenant, When o treinador pede o detalhe, Then a API
  responde 404 (comportamento atual, coberto por teste existente ou novo).

## Métrica de sucesso

- **Principal — rotina:** o treinador piloto deixa de abrir Garmin Connect/Strava/intervals.icu do
  atleta para revisar a semana. Medida por entrevista com os treinadores piloto 4 semanas após o
  deploy: "bom" = a maioria relata não precisar mais sair do Menthoros para revisar execução.
- **Secundária — uso:** aberturas do painel por treinador ativo por semana (evento D5). Sem
  telemetria disponível, fica só a principal — registrado em `tasks.md`, sem criar sistema novo.

## Dependências

- `coach-editar-treino-aprovado` reserva a migration `V107`. Esta change usa o próximo número livre
  no momento do merge (hoje `V108`) — conferir antes de commitar.
- Nenhuma dependência de contrato: `GET /api/v1/treinos/realizados/{id}` já existe.

## Open Questions & Assumptions

- **A1 — Melhor ritmo = velocidade máxima da sessão.** Assumido que o "Melhor ritmo" do Garmin
  Connect vem de `enhanced_max_speed`. Ruído de GPS pode gerar picos irreais; ver R1 no
  `design.md`.
- **A2 — `min_temperature` existe no SDK em uso.** O campo da Session foi adicionado em versões
  recentes do FIT SDK. Confirmar na task 1.0; se não existir, a temperatura mínima vem do mínimo dos
  `avg_temperature` dos laps ou fica fora.
- **A3 — intervals.icu e Strava.** Assumido que só o `.fit` preenche os campos novos nesta change.
  Mapear `max_speed`/temperaturas do intervals.icu e o `max_speed` do Strava fica como follow-up se
  a task 1.0 mostrar que as APIs expõem.
- **A4 — Visibilidade tenant-wide.** O endpoint já permite a qualquer técnico do tenant ver
  qualquer atleta (sem vínculo coach↔atleta). A change mantém esse modelo.
- **A5 — `duracaoMin` muda de significado por origem** (elapsed vs. tempo em movimento). A tela
  rotula "Tempo" com o valor de `duracaoMin` e mostra "Tempo em movimento" e "Tempo decorrido"
  separados; conferir por origem na task 1.0.
- **Q2 — Dados de bem-estar visíveis ao tenant inteiro.** A aba mostra sono, estresse, dor, fadiga e
  comentário do atleta, que qualquer técnico do tenant já consegue ler pela API. Hoje nenhuma tela
  os expõe assim. **Decidido (2026-11-03): só RPE e comentário** até existir vínculo coach↔atleta.
  Sono, estresse, dor, fadiga e recuperação ficam fora da tela (o DTO continua expondo; restringir a
  API é outra change).
- **Q1 — Onde abrir:** drawer lateral (protótipo) vs. dialog. Assumido drawer, coerente com o
  `WorkoutDetailDrawer` do atleta.
