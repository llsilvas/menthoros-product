**Tamanho:** M · **Trilha:** Full · **Status:** 🏃 **EM IMPLEMENTAÇÃO** — `apps/menthoros-front`
(branch `refactor/planos-dialog-padrao-inbox`) e `apps/menthoros-backend` (mesma branch, em worktree).

> **Reclassificação (2026-10-04).** Nasceu como S · Fast, só front. Subiu para M · Full quando se
> descobriu que o histórico **não existe no backend**: o endpoint que o dialog usa devolve um único plano
> e nunca um `CONCLUIDO`. Isso exige endpoint novo (toca dois repos e muda contrato de API — critério de
> escalada do `config.yaml`). Ver `design.md`.

> **Nota de processo (2026-10-04).** A primeira parte (dialog, toolbar, abas) foi implementada **antes** de
> esta change existir — o fluxo OpenSpec-first foi pulado. Esta change regulariza o que já foi feito
> (Seção 1 do `tasks.md`, marcada como feita retroativamente) e governa o que falta (cards de treino).

## Why

O inbox do coach foi reestilizado (`CoachDialog`, `KpiStrip`/`KpiCell`, `SectionCard`, disciplina do
lime, números em mono). O dialog que mostra os planos semanais do atleta (`planosDialog.tsx`, aberto
pela tela Atletas e pela Home legada) ficou para trás e destoa do resto:

1. **Quatro botões de peso parecido no cabeçalho** (toggle, recalcular, excluir, gerar) disputam o
   espaço do título — não está claro qual é a ação principal. O toggle selecionado e a borda do plano
   selecionado usam lime fora de CTA primário.
2. **Pilha de cards, um por semana:** o dialog cresce a cada plano gerado e o histórico (a semana
   anterior, que o coach precisa consultar) fica enterrado.
3. **Excluir plano apaga no clique**, sem confirmação.
4. **Os cards de treino** (`TreinoCard`) usam o vidro (`glass`) com tinta de estado de 2px, ícones e
   texto em tamanhos soltos, número fora de mono, nome do tipo cru (`CONTINUO`) e sem cor de categoria.
5. Bugs de acabamento encontrados no caminho: fechar o modal de "marcar realizado" zerava a semana
   selecionada (e desabilitava "Excluir"); datas via `new Date('YYYY-MM-DD')` recuam um dia em
   America/Sao_Paulo; `console.log` de debug em produção.

## What Changes

Front e backend. Contrato de API **novo** (endpoint de lista); o existente não muda.

- **Backend:** `GET /api/v1/planos/atletas/{atletaId}/semanas` (TECNICO/ADMIN) devolve, numa chamada, os
  planos em andamento do atleta e **as 4 últimas semanas concluídas**, da mais recente para a mais
  antiga; lista vazia (não 404) quando não há plano. O limite de 4 é aplicado na query, não no front.
- **Front:** `usePlanoSemanal` passa a consumir esse endpoint (wrapper não gerado
  `PlanoSemanasService`); o dialog continua carregando tudo na abertura.
- **Dialog:** barra de ações própria (só "Gerar plano" em lime), **sem aba de "Concluídos": as abas de semana
  já são os planos** — o atual e as 4 semanas concluídas anteriores —, mais recente primeiro, com status em
  cada aba, um plano por vez com faixa de KPIs,
  progresso, objetivo, observações e TSB. Confirmação antes de excluir. Seleção derivada da lista (sobrevive a exclusão e
  recarga).
- **`TreinoCard`:** novo layout no padrão do inbox — chip `DIA · dd/MM` e estado por ícone **e** texto,
  tipo com rótulo em PT-BR e cor de categoria, métricas em 3 colunas mono, estado do card por borda 1px
  e tinta suave (não mais 2px), ações neutras + "Realizado" em verde. Insight de IA, edição de RPE e
  "Perdido" mantêm o comportamento atual.
- Desenho de referência: artboard "Dialog · planos semanais" do canvas Design desta sessão.

## Non-Goals

- Não altera `GET /api/v1/planos/{id}` (usado pela Home do atleta e pelo coach) nem o que ele devolve.
- Sem paginação nem "ver mais": o histórico no dialog é fixo em 4 semanas concluídas.
- Não redesenha `DetalheTreinoDialog` nem `TreinoRealizadoDialog`.
- Não exibe `restDays` (descanso prescrito) — hoje o dialog também não exibe; fica como follow-up.
- Não altera a Home do atleta nem o `PlanoDetalhePanel` da revisão de planos.

## Critérios de aceite

1. Given o dialog aberto para um atleta com plano atual e semanas concluídas, When renderiza, Then há uma
   única fileira de abas de semana (período + status), da mais recente para a mais antiga, sem aba
   "Concluídos"; abre no plano `ATIVO` (ou na semana mais recente); só um plano é exibido por vez.
1b. Given uma aba de semana concluída, When selecionada, Then mostra os KPIs, os treinos (realizados,
   perdidos) e o TSB daquela semana, sem "Encerrar semana".
1c. Given um atleta com um único plano, When o dialog abre, Then não há fileira de abas, só o plano.
2. Given um plano `ATIVO` existente, When o dialog renderiza, Then "Gerar plano" e o seletor de modo
   ficam desabilitados com a explicação visível; lime só aparece em "Gerar plano".
3. Given "Excluir plano", When clicado, Then abre confirmação; só `deletePlano` após confirmar.
4. Given o coach marca um treino como realizado e fecha o modal, When volta ao dialog, Then a semana
   selecionada continua a mesma e "Excluir plano" segue habilitado.
5. Given `semanaInicio = '2026-09-28'`, When o período é exibido, Then mostra `28/09/2026` (não 27/09).
6. Given um treino `REALIZADO`/`PERDIDO`/pendente, When o card renderiza, Then o estado aparece por
   ícone **e** texto, o tipo em PT-BR com a cor da categoria e distância/duração/esforço em mono.
7. Given um treino realizado com análise de IA, When o card renderiza, Then insight, RPE e "ver mais"
   funcionam como antes (`TreinoCard.test.tsx` segue verde).
8. Given um atleta com 6 semanas concluídas, When o dialog abre, Then as abas mostram o plano atual e
   exatamente as 4 concluídas mais recentes (limite vindo do backend).
9. Given um atleta sem nenhum plano, When o endpoint é chamado, Then responde 200 com lista vazia.
10. Given um usuário `ATLETA`, When chama o endpoint novo, Then recebe 403.
11. `npm run lint && npm run build` e `npm run test:run` (front) e `./mvnw clean verify` (backend) passam.

## Métrica de sucesso

O coach acha o plano da semana anterior sem rolar uma pilha: de "rolar N cards" para **1 clique na aba
da semana anterior**; e nenhuma exclusão de plano sem confirmação.

## Open Questions & Assumptions

- **Corrigido:** a versão anterior desta change assumia que `listarPlanosPorAtleta` devolvia o histórico
  completo. **Falso:** `GET /api/v1/planos/{id}` devolve um único plano e exclui `CONCLUIDO`
  (`findAtivosPorAtleta`). O hook embrulhava o objeto único num array, e por isso nunca houve histórico.
- **Assumido:** a ordem final (mais recente primeiro) é garantida pelo backend; o front ainda reordena por
  `semanaInicio` (ISO, comparável como string) como defesa.
- **Assumido:** "concluído" é `status = CONCLUIDO` (resultado do "Encerrar semana"); os demais status
  são o plano atual. "Gerar plano" continua bloqueado por qualquer plano `ATIVO`.
- **Aberto:** só 4 semanas concluídas ficam visíveis; consultar semanas mais antigas exigiria paginação
  ("ver mais") — fora desta change.
- **Aberto:** `duracaoMin` chega como `string | number` (ex.: `PT50M` vs `50`); o card exibe o valor
  como já fazia. Normalizar o formato é follow-up.
