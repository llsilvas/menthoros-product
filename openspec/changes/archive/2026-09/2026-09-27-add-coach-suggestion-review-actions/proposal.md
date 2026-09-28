# add-coach-suggestion-review-actions — O coach decide sobre uma SugestaoCoach na própria tela

**Tamanho:** S · **Trilha:** Fast

> Fast porque toca só o frontend, não muda contrato de API (endpoints `aprovar`/`rejeitar` já
> existem e já têm teste no backend) e o risco é baixo: dois botões e uma chamada de serviço já
> pronta.

## Status

Proposta. Nasceu da investigação de `add-coach-suggestion-edit-delta`: o backend
(`CoachSugestaoController`, `SugestaoCoachServiceImpl`) já implementa aprovar/rejeitar desde a
change que criou `SugestaoCoach`, e o frontend (`SugestaoService.aprovar/rejeitar`) já tem os
métodos — mas nenhuma tela chama nenhum dos dois. O único ponto de UI
(`RecentSuggestionsPanel.tsx` → `CoachDialog`) é somente leitura, com um único botão "Fechar".

## Why

`SugestaoCoach` é a peça central do coach-in-the-loop: a IA propõe, o treinador aprova, edita ou
rejeita. Hoje a IA propõe e o treinador só **lê** — não há como agir. A sugestão fica PENDING até
expirar (`expiresAt`, 7 dias) sem que o coach tenha feito nada, porque não há botão. Isso não é
uma lacuna de edição (`add-coach-suggestion-edit-delta` depende desta), é a ausência da ação mais
básica do loop.

## What Changes

### Frontend (`menthoros-front`)

- `RecentSuggestionsPanel.tsx`: o `CoachDialog` que hoje só mostra o detalhe da sugestão (tipo,
  status, confiança, atleta, datas, resumo, justificativa) ganha, quando `status === 'PENDING'`,
  dois botões — **Aprovar** e **Rejeitar** — chamando `SugestaoService.aprovar(id)` /
  `SugestaoService.rejeitar(id)`.
- Estado de carregamento por ação (desabilita os dois botões durante a chamada).
- **Tratamento de erro e resultado incerto** (achado do pre-mortem Codex: um `POST` pode comitar
  no servidor e a resposta se perder por erro de rede — nesse caso o sistema NÃO SHALL assumir
  PENDING às cegas): em caso de falha, reconsulta `SugestaoService.detalhe(id)` para saber o
  estado real antes de decidir o que mostrar; se a reconsulta também falhar, mostra "não foi
  possível confirmar — recarregue" em vez de reabilitar os botões sobre um estado desconhecido.
  Um 422 (decisão oposta já tomada por outra sessão) é tratado como sucesso informativo: mostra o
  status atual, não como falha genérica.
- **Atualização da lista** (achado do pre-mortem: `RecentSuggestionsPanel` recebe `sugestoes`
  como prop de `CoachAthleteProfilePage` — via `profile.sugestoesRecentes`, de
  `useAthleteProfile` — não busca sozinho via `useCoachSugestoes`; recarregar um hook que o
  componente não usa não atualiza nada). Ao concluir com sucesso, o componente chama o callback
  `fetchProfile()` de `useAthleteProfile` (passado como prop de `CoachAthleteProfilePage`) para
  recarregar o perfil e, com ele, `sugestoesRecentes`; o dialog atualiza o `status` exibido a
  partir do retorno do próprio `aprovar`/`rejeitar` (não espera o refetch do perfil para refletir
  a mudança na tela aberta).
- Sugestões `APPROVED`/`REJECTED` continuam somente leitura (sem os botões), como hoje.

### Backend (`menthoros-backend`)

- Nenhuma mudança. `POST /api/v1/coach/sugestoes/{id}/aprovar` e `/rejeitar` já existem,
  já testados (`CoachSugestaoControllerTest`, `SugestaoCoachServiceImplTest`).

## Capabilities

### Modified Capabilities

- Nenhuma spec canônica nova; é a ativação de uma capability de backend já especificada
  implicitamente pelo controller existente. Sem `specs/` novo — Fast track.

## Fora do escopo

- Editar o conteúdo da sugestão antes de decidir — é `add-coach-suggestion-edit-delta`, que
  depende desta.
- Qualquer mudança no backend, no job gerador ou no modelo de dados.
- Ações em massa (aprovar/rejeitar várias de uma vez).

## Riscos e mitigações

- **Decisão concorrente sobrescreve silenciosamente (achado do pre-mortem Codex, confirmado no
  código):** `SugestaoCoachServiceImpl.aprovar/rejeitar` lê o status e grava sem lock —
  `SugestaoCoach` não tem `@Version`. Duas decisões quase simultâneas na mesma sugestão (duas
  abas, ou dois coaches) podem resultar em "o último `save()` vence" em vez de um erro explícito.
  Esse gap já existe no backend hoje; esta change é a primeira a expor os endpoints a uso real, o
  que o torna alcançável pela primeira vez. **Aceito para esta change:** o risco é uma corrida de
  timing humano (duas pessoas decidindo no mesmo instante sobre a mesma sugestão), raro numa
  ferramenta de uso individual do coach, e o resultado no pior caso é uma decisão determinística
  (APPROVED ou REJECTED, sem corrupção de dado) — não um crash nem perda de outro dado.
  **Mitigação definitiva:** `add-coach-suggestion-edit-delta` (próxima change, já depende desta)
  adiciona `@Version` a `SugestaoCoach` e checagem de versão em `aprovar`/`rejeitar`/`editar`
  precisamente por esse motivo — o fechamento correto fica lá, não duplicado aqui.
- **Resposta perdida após commit:** ver "Tratamento de erro e resultado incerto" em What Changes
  — reconsulta via `detalhe(id)` em vez de assumir PENDING.

## Rollback

Revert do PR de frontend. Nenhuma migração, mudança de contrato ou coluna nova para reverter no
backend — os endpoints `aprovar`/`rejeitar` preexistem e não são alterados por esta change.

## Dependências e ordem

- Não depende de nenhuma change ativa.
- `add-coach-suggestion-edit-delta` depende desta: o botão "Editar" e o delta são adicionados ao
  mesmo dialog, ao lado de Aprovar/Rejeitar.

## Critérios de aceite

1. **Given** sugestão PENDING aberta no dialog, **when** o coach clica Aprovar, **then**
   `SugestaoService.aprovar(id)` é chamado, o status muda para APPROVED na lista e o dialog
   reflete o novo status.
2. **Given** sugestão PENDING aberta no dialog, **when** o coach clica Rejeitar, **then**
   `SugestaoService.rejeitar(id)` é chamado e o status muda para REJECTED.
3. **Given** a chamada de aprovar/rejeitar falha (erro de rede ou 4xx/5xx), **when** o coach
   tenta, **then** o sistema reconsulta `detalhe(id)` para saber o estado real antes de decidir o
   que mostrar (a resposta pode ter se perdido depois de a mutação já ter comitado — nesse caso
   mostra o status real, não PENDING às cegas); se a reconsulta também falhar, mostra "não foi
   possível confirmar — recarregue", sem re-tentativa automática.
3b. **Given** o coach tenta decidir sobre uma sugestão já decidida por outra sessão (422 da API),
   **then** o dialog mostra o status atual como informação, não como erro genérico.
4. **Given** sugestão já APPROVED ou REJECTED, **when** o coach abre o dialog, **then** não vê
   botões de ação — só o detalhe, como hoje.
5. **Given** dois cliques rápidos no mesmo botão, **then** a segunda chamada não dispara enquanto
   a primeira está em andamento (botões desabilitados durante loading).

## Métrica de sucesso

Rotina do treinador: **sugestões deixam de expirar por falta de ação**. Medição: % de
`SugestaoCoach` que chegam a `expiresAt` ainda PENDING (alvo: cair de ~100% hoje, já que não há
como agir, para próximo de 0% nas assessorias fundadoras 30 dias após o merge).

## Open Questions & Assumptions

- ✅ Sem mudança de contrato de API — só consumo dos endpoints existentes (verificado no
  controller e nos testes atuais).
- **Assunção:** o `CoachDialog` de `RecentSuggestionsPanel.tsx` é reaproveitado tal como está
  (mesmo componente, sem extrair um novo). Se a implementação achar melhor extrair um componente
  próprio de revisão, é decisão de implementação, não de escopo.
