**Tamanho:** L · **Trilha:** Full

# add-injury-clearance-flow — atleta sinaliza a lesão, coach decide a liberação

**Design:** https://claude.ai/artifact/5Y2fzou7t87vH7V9YQAyc5#play-fad9a36280da (versão 7,
`1795863599-622a`): check-in do atleta com sinal, atleta aguardando, inbox do coach, decisão de
liberação. O que a spec corta ou muda do design está em "Divergências do design".

## Why

Lesão hoje é dado só do coach depois do onboarding: o atleta informa no passo de saúde e, concluído o
onboarding, não tem como dizer "me machuquei" nem "estou sem dor". O coach descobre a lesão nova por
mensagem fora do app (ou não descobre), e o fim da lesão depende de ele lembrar de abrir o cadastro.

A regra certa é **assimétrica**:

- **Piorar vale na hora.** O atleta reporta lesão nova e a próxima geração já sai em `RECOVERY`, sem
  esperar o coach. Atraso aqui custa lesão.
- **Melhorar é decisão do coach.** O atleta sinaliza "sem dor" ou "liberado pelo médico"; só a
  confirmação do coach destrava a carga. Atleta em retorno é o perfil mais ansioso para voltar, e
  desmarcar a lesão sobe a carga do plano — decisão de carga é do coach (coach-in-the-loop).

Estrela-guia: o coach deixa de caçar a informação. Lesão nova e pedido de liberação chegam à fila de
atenção com o que ele precisa para decidir em um clique.

Para a assessoria (quem paga): atleta que se lesiona de novo por um retorno mal conduzido some do
plano. Isso é churn. Lesão vista no dia, e retorno decidido com dados, é retenção.

## What Changes

**Atleta (`ATLETA`, resolve o atleta do token, sem id na URL):**

1. **Reportar dor ou lesão nova** — `POST /api/v1/atletas/me/lesao` com `descricao` (até 500). Um
   endpoint só para os botões vermelhos do design ("Senti dor ou lesão nova" no check-in, "A dor
   voltou" na tela de espera):
   - **sem lesão ativa:** `descricao` obrigatória; `temLesao = true`, `descricaoLesao = descricao`;
   - **com lesão ativa:** `descricao` opcional; a lesão não muda, o pedido pendente (se houver) vira
     `CANCELLED`, e `LESAO_REPORTADA` volta à fila. É o "cancela o pedido na hora e mantém o modo
     seguro" do design, sem endpoint de cancelamento à parte.

   A semana já gerada ou aprovada **não** é reaberta (decisão de 28/11): quem mexe nela é o coach.
2. **Sinalizar melhora** — `POST /api/v1/atletas/me/lesao/sinal-liberacao` com
   `tipo ∈ {SEM_DOR, LIBERADO_MEDICO}`, sem texto (o design não tem campo; menos dado sensível).
   **Não** muda `temLesao`. Sem lesão ativa → `409`; com pedido pendente → `409` (revisão de
   produto: sem estado `SUPERSEDED`; o atleta espera a decisão do coach).
3. **Telas do atleta (design: check-in e espera):** no check-in de prontidão, com lesão ativa, o
   bloco "Lesão em acompanhamento · MODO SEGURO" com o volume da semana, a pergunta "Como está a dor
   hoje?", os dois sinais e o botão vermelho. Com pedido pendente, a tela de espera (sinal → coach
   revisa → coach libera) e "Nada muda no seu plano até o coach confirmar". Depois da decisão, o
   atleta vê o resultado e a observação do coach. Sem lesão, só o botão vermelho. Texto neutro, sem
   conselho clínico.
   - **"Como está a dor hoje?" reusa `doresMusculares` (0–10) do check-in**, sem campo novo: Sem dor
     = 0, Leve = 1–3, Moderada = 4–6, Forte = 7–10. Ver Open Questions.

**Coach (`TECNICO`/`ADMIN`, `@RequireTenant`):**

4. **Fila de atenção:** dois motivos novos em `MotivoAtencao`:
   - `LESAO_REPORTADA` (peso 60, severidade `CRITICA`): lesão reportada pelo atleta ainda não vista
     pelo coach. Evidência: data e descrição.
   - `LIBERACAO_SOLICITADA` (peso 15, severidade `MEDIA`): pedido pendente. Evidência (a do design):
     tipo e data do sinal, dias seguidos sem dor, treinos feitos sem dor desde a última dor, última
     dor relatada (data e nível) e lesão registrada.
   - **Fonte da dor:** o `doresMusculares` do check-in e o `Sensacao.DOR` do feedback pós-treino, que
     já existem. "Com dor" = `doresMusculares ≥ 1` ou `DOR` no realizado.
5. **Confirmar liberação** — `POST /api/v1/atletas/{id}/lesao/liberacao`: aplica a regra da
   `add-injury-clearance-coach` (`dataUltimaLesao = hoje`, descrição para o histórico, `temLesao =
   false`), resolve o pedido pendente como `CONFIRMED` e grava quem liberou. Funciona com ou sem
   pedido do atleta. Aceita `observacao` opcional (até 500), mostrada ao atleta.
6. **Recusar pedido** ("Manter restrição" no design) —
   `POST /api/v1/atletas/{id}/lesao/sinal-liberacao/recusa` com a mesma `observacao` opcional:
   pedido vira `DECLINED`; o atleta vê "o treinador manteve a recuperação" e a observação.
7. **Ciência da lesão reportada** — `POST /api/v1/atletas/{id}/lesao/ciencia`: tira
   `LESAO_REPORTADA` da fila. Não muda a lesão. Mantido apesar da sugestão de corte da revisão de
   produto: sem ciência explícita, um item `CRITICA` só sairia da fila se o coach editasse o plano ou
   liberasse. O caso comum ("vi, a recuperação gerada está certa, não preciso mexer") ficaria preso
   no topo da fila.
8. **Front do coach (design: inbox e decisão):**
   - Inbox: rótulos "Liberação de lesão" e "Dor reportada" (`REASON_LABEL`, `MOTIVO_TEXTO`), o bloco
     "Sinal de atenção" com a evidência do item 4, e "Revisar liberação" abrindo a tela de decisão.
   - Tela "Liberação de lesão": sinal do atleta, "em modo seguro desde" (primeiro `REPORTED` do
     episódio; lesão antiga sem evento mostra "—"), histórico de dor das últimas 4 semanas (por
     semana: check-ins, com dor, maior dor) e o painel "Sua decisão".
   - "Sua decisão": o que acontece se liberar, **só leitura** ("volta aos treinos por 30 dias, até
     <data>"; "a lesão fica no histórico com a data de hoje como fim"), a observação opcional,
     "Manter restrição" / "Liberar…" e o passo de confirmação ("a decisão fica registrada no seu
     nome"). Link "Ajustar temporada" para o ajuste que já existe.
   - Texto de ajuda no `AtletaDialog`: "Desmarcar libera o retorno: 30 dias em volta aos treinos."

**Persistência:** tabela `tb_injury_event` (append-only) com os eventos `REPORTED`,
`CLEARANCE_REQUESTED`, `CLEARED`, `CLEARANCE_DECLINED`, `ACKNOWLEDGED`, autor (`ATHLETE`/`COACH`,
`user_id`), tipo do sinal, texto e `status` do pedido. O estado da lesão continua em `tb_atleta`; a
tabela é trilha e fonte da fila.

**Fechar os outros escritores da lesão** (pre-mortem Codex, conferido no código):

9. **Onboarding concluído não mexe mais na lesão.** Hoje `salvarRascunho` não bloqueia depois de
   `COMPLETO` e `concluirOnboarding` pode rodar de novo, copiando `temLesao`, data e histórico do
   rascunho (`OnboardingServiceImpl.java:225-228, 295-298`). O atleta consegue se liberar sozinho.
   Depois de `COMPLETO`, os campos de lesão do rascunho são ignorados na conclusão (o restante segue
   como hoje).
10. **Desmarcar pelo `AtletaDialog` checa o estado visto.** O diálogo aberto antes de um reporte
    mandaria o `false` antigo e liberaria uma lesão que o coach nunca avaliou (`Atleta` não tem
    `@Version`). O `PUT` passa a aceitar `lesaoVistaEm` (timestamp do último evento de lesão que o
    diálogo exibiu, vindo no `AtletaOutputDto`). Na transição `true → false`, um evento `REPORTED`
    mais novo que `lesaoVistaEm` dá `409 LESAO_REPORTADA_DEPOIS` e nada é gravado.

Fora de escopo: reabrir a semana atual; reancorar a temporada; ler o texto do atleta com LLM; inferir
região ou gravidade; notificação push; o sinal de dor recorrente do pós-treino
(`add-pain-attention-signal`).

## Divergências do design

O que o design (v7) mostra e a spec não faz, com o motivo. O design precisa ser ajustado nestes pontos
antes do front.

- **Volume e longão editáveis na liberação (cortados).** O design deixa o coach digitar a carga
  (default 20 km / longão 8 km). Não há mecanismo para isso, e ele seria novo: a carga do próximo
  plano vem da fase de volta aos treinos (`RETURN_TO_TRAINING`). Quem quer outra carga usa o ajuste
  da temporada, que já existe. O painel fica só leitura, com link.
- **Checkbox "Reancorar a temporada a partir desta semana" (cortado).** O founder decidiu em 28/11
  que liberar não mexe na temporada. O link "Ajustar temporada" cobre o caso com o recálculo que já
  existe (`add-season-recalculate-from-week`).
- **Texto "a carga sobe de 9 km para 20 km" (errado).** Liberar põe o atleta em volta aos treinos
  por 30 dias; ele não pula para a meta da temporada. O próprio design diz "sem pular para a meta da
  temporada" no painel. Trocar por "entra em volta aos treinos: carga gradual por 30 dias".
- **Escala de dor de 4 níveis.** O check-in hoje tem `doresMusculares` de 0 a 10. A spec reusa o
  campo, mapeando os 4 botões, em vez de criar outro. Ver Open Questions.
- **Sem ação de ciência para "Dor reportada".** O design só desenha o detalhe da liberação. A spec
  mantém "Ciente" (item 7); o design precisa do botão no detalhe da dor reportada.
- **Tela de lesão nova sem lesão ativa não está desenhada** (onde o atleta escreve a descrição).

## Capabilities

### New Capabilities

- `athlete-injury-clearance`: reporte de lesão pelo atleta, pedido de liberação, confirmação ou recusa
  pelo coach, e a trilha de eventos.

### Modified Capabilities

- `coach-attention-queue` (fila): motivos `LESAO_REPORTADA` e `LIBERACAO_SOLICITADA`.

## Impact

**Backend:** enum `MotivoAtencao` (+2), `CoachAttentionQueueServiceImpl.montarItem` (+2 sinais),
`CoachAttentionSignalEvaluator` (funções puras), entidade + repositório `InjuryEvent`, serviço
`InjuryClearanceService` (reusa a regra de liberação da change anterior, extraída para um método
compartilhado), controllers (endpoints `/me` no controller do atleta; `/{id}/lesao/*` no
`AtletaController`), migration **V120 ou posterior** (V120 aparece reservada em outra change ativa;
revalidar no PR), handler `409`.

**Frontend:** home do atleta (card), `coachInboxHelpers.ts`, `types/Coach.ts`, perfil do coach,
`AtletaDialog` (ajuda), `src/api` curado à mão (sem `generate:api`).

**Contrato:** endpoints novos; `primaryReason`/`motivo` ganham dois valores. `switch` exaustivo no
front quebra o build se faltar rótulo — é o aviso desejado.

**Dependências:**
- **`add-injury-clearance-coach`** precisa estar mergeada: a confirmação reusa a regra dela.
- **`add-pain-attention-signal`** (0/43 tasks) também adiciona motivo (`DOR_RECORRENTE`, peso 55) e
  toca os mesmos quatro pontos (`MotivoAtencao`, `MOTIVOS_IGNORADOS`/`MOTIVO_TIPO` do job,
  `REASON_LABEL`/`MOTIVO_TEXTO`). Quem mergear depois faz rebase. Lá, `temLesao` ficou fora de escopo
  como "decisão do coach via cadastro"; esta change muda isso só para o lado seguro (reportar).
- `add-attention-reason-sem-sincronizacao`, `add-aviso-mensalidade`, `add-retention-radar-lite`:
  mesmos pontos de rebase.
- `rag-injury-aware-prescription` lê `descricaoLesao`; a descrição escrita pelo atleta passa a ser uma
  das fontes.

## Critérios de aceite

- **CA1** — **Dado** atleta sem lesão, **quando** ele chama `POST /me/lesao` com "dor no joelho",
  **então** `temLesao = true`, `descricaoLesao = "dor no joelho"`, existe evento `REPORTED` de autor
  `ATHLETE`, e o `InjuryPolicyResolver` devolve `RECOVERY` / `INJURY_ACTIVE`.
- **CA2** — **Dado** CA1, **quando** a fila do coach roda, **então** o atleta aparece com
  `primaryReason = LESAO_REPORTADA`, severidade `CRITICA` e a descrição na evidência.
- **CA3** — **Dado** CA2, **quando** o coach chama `POST /{id}/lesao/ciencia`, **então** o motivo sai
  da fila e a lesão continua ativa.
- **CA4** — **Dado** CA1 e um plano semanal já aprovado, **quando** o atleta reporta, **então** o plano
  não muda (status, treinos e `review_status` iguais).
- **CA5** — **Dado** lesão ativa e pedido `PENDING`, **quando** o atleta chama `POST /me/lesao` ("a dor
  voltou"), **então** o pedido vira `CANCELLED`, `temLesao` e `descricaoLesao` não mudam, existe
  evento `REPORTED`, e a fila mostra `LESAO_REPORTADA`.
- **CA6** — **Dado** lesão ativa, check-ins com `doresMusculares` 3 em 19/11 e 0 de 20/11 a 28/11, e 4
  realizados sem `DOR` depois de 19/11, **quando** o atleta sinaliza `SEM_DOR` em 28/11, **então**
  `temLesao` segue `true`, existe pedido `PENDING`, e a fila mostra `LIBERACAO_SOLICITADA` com
  "9 dias seguidos sem dor", "4 treinos sem dor" e "última dor 19/11 · leve".
- **CA7** — **Dado** pedido pendente, **quando** o atleta sinaliza `LIBERADO_MEDICO`, **então** `409`
  e o pedido pendente continua o mesmo.
- **CA8** — **Dado** pedido pendente, **quando** o coach confirma em 28/11, **então** a regra da
  `add-injury-clearance-coach` é aplicada, o pedido vira `CONFIRMED`, o evento `CLEARED` tem o
  `user_id` do coach, e o motivo sai da fila.
- **CA9** — **Dado** pedido pendente, **quando** o coach recusa com a observação "mais uma semana",
  **então** o pedido vira `DECLINED`, a lesão continua ativa e o check-in do atleta mostra "o
  treinador manteve a recuperação" e "mais uma semana".
- **CA10** — **Dado** atleta sem lesão, **quando** sinaliza melhora, **então** `409`.
- **CA11** — **Dado** coach de outro tenant, **quando** chama qualquer `/{id}/lesao/*`, **então**
  `404`, sem efeito.
- **CA12** — **Dado** atleta autenticado, **quando** chama os endpoints `/me`, **então** só o próprio
  atleta é afetado (não existe parâmetro de id).
- **CA13** — **Dado** a observação do coach numa decisão, **quando** um plano é gerado, **então** o
  texto não entra no prompt (só `descricaoLesao` e `historicoLesoes`, como hoje).
- **CA14** — **Dado** onboarding `COMPLETO` e lesão ativa, **quando** o atleta salva um rascunho com
  `temLesao = false` e conclui de novo, **então** `temLesao`, `descricaoLesao`, `dataUltimaLesao` e
  `historicoLesoes` não mudam.
- **CA15** — **Dado** o coach com o `AtletaDialog` aberto e o atleta reportando lesão nova depois,
  **quando** o coach salva com `temLesao = false` e o `lesaoVistaEm` antigo, **então** `409
  LESAO_REPORTADA_DEPOIS` e a lesão continua ativa.
- **CA16** — **Dado** o coach desmarcando a lesão pelo `AtletaDialog` sem pedido pendente, **quando**
  salva, **então** existe evento `CLEARED` com o `user_id` do coach.
- **CA17** — **Dado** um pedido `PENDING` criado há 120 dias, **quando** a fila roda, **então**
  `LIBERACAO_SOLICITADA` aparece.

## Métrica de sucesso

Medidas pelos eventos de `tb_injury_event`. Com N pequeno no piloto, reportar os casos um a um, não
só a mediana.

- Tempo entre o atleta reportar a lesão e a primeira ação do coach (ciência, edição do plano ou
  liberação): < 24 h. Baseline: hoje não existe reporte, a lesão chega por fora do app.
- Tempo entre o pedido de liberação e a decisão do coach: < 48 h.
- Valor: atletas liberados sem novo `REPORTED` em 30 dias. É o sinal de que o retorno foi bem
  conduzido.
- Para o moat: a decisão do coach (confirmou, recusou, editou a carga do plano `RETURN_TO_TRAINING`
  depois) fica registrada e pode alimentar as sugestões semanais. O consumo fica fora desta change.

## Open Questions & Assumptions

- **Decidido (28/11):** reportar não reabre a semana atual; liberar não mexe na temporada. Com isso,
  depois de um reporte o coach age a partir do item `CRITICA` na fila (editar a semana, ou dar
  ciência).
- **Aberto (decisão do founder):** reusar `doresMusculares` como "dor da lesão" no check-in. Prós: sem
  campo, sem migration, o readiness já reage. Contra: mistura dor muscular com dor da lesão para o
  atleta lesionado. Alternativa: campo novo `injuryPain` só no check-in com lesão ativa. A spec segue
  com o reuso até decisão.
- **Ordem com `add-pain-attention-signal`:** as duas tocam os mesmos quatro pontos. Proposta: esta
  entra primeiro (a fatia 1 da outra ainda não começou) e a outra faz o rebase.
- **Premissa:** lesão reportada pelo atleta é sempre segura de aplicar sem o coach, porque só reduz
  carga. Abuso (reportar para treinar menos) é problema de relação, não de segurança.
- **Bloqueante (LGPD):** o texto do atleta é dado de saúde (dado sensível). O texto do reporte vira
  `descricaoLesao` e vai ao prompt da LLM, como a descrição de hoje. Arquivar no histórico estende
  essa ida a todas as gerações futuras. Antes do `/implement`:
  - confirmar que o consentimento de dados sensíveis do onboarding cobre texto livre de lesão
    enviado ao provedor de LLM;
  - definir retenção: `deleteAtleta` é soft delete, então o `ON DELETE CASCADE` de
    `tb_injury_event` nunca dispara. Os textos de `tb_injury_event` são anonimizados no
    `deleteAtleta`, no mesmo padrão do ledger de LLM (`add-plan-generation-ledger`, D7).
- **Aberto:** lesão ativa sem nenhum sinal por muitas semanas deveria gerar lembrete ao coach? Fora
  desta change; anotado para a fila.
- **Aberto:** o atleta deveria poder editar a descrição depois de reportar? Proposta: não; ele reporta
  de novo pelo coach ou pelo canal de mensagem.
