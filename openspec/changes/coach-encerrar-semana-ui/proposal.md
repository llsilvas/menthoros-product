**Tamanho:** S · **Trilha:** Fast

## Why

A change de backend `coach-encerrar-semana` entrega os endpoints de encerramento (individual, lote e
preview), mas o valor central para o treinador — "fechar a semana em 1 clique" — só existe quando há
**botão**. Sem a UI, o único benefício em produção é o fechamento automático (scheduler); o "ritual de
domingo" on-demand fica inacessível e a métrica de adoção não pode ser medida. Esta change é o
**fast-follow bloqueante** que materializa o valor no painel do treinador.

Depende de `coach-encerrar-semana` (contratos de API prontos). Deve entrar logo após o merge do backend.

## What Changes

- **Ação "Encerrar semana" (individual)** no contexto do plano/semana do atleta: chama
  `POST /coach/planos/{planoId}/encerrar-semana` e exibe o resumo (treinos marcados perdidos, plano concluído,
  `prontoParaProximaSemana`, e o `aviso` quando a semana ainda não terminou).
- **Ação "Encerrar semana de todos" (lote da assessoria)** no painel do treinador: dispara o preview,
  mostra uma **tela de confirmação** ("vou marcar 23 treinos como perdidos para 8 atletas — confirmar?") e,
  só após o aceite, chama `POST /coach/semanas/encerrar-lote`, exibindo o resumo consolidado (por atleta +
  totais + falhas).
- **Preview obrigatório antes do lote** — nunca disparar o lote sem passar pela confirmação. É a salvaguarda
  de confiança que sustenta a adoção.
- **Estado pós-ação**: refletir semanas encerradas e treinos `PERDIDO` nas telas já existentes (fila de
  atenção / dashboard) sem regressão; distinguir visualmente encerramento `AUTOMATICO` de `ON_DEMAND`
  quando a origem estiver disponível.
- Regenerar o cliente TypeScript da API (openapi) a partir do contrato atualizado do backend.

### Non-Goals

- Não altera regra de negócio de encerramento (vive no backend).
- Não implementa notificação/digest do fallback automático (é de `add-weekly-athlete-review`).
- Não implementa "desfazer em massa" (a reversão é por atleta, via registro retroativo já existente).

## Capabilities

Nenhuma capability nova de backend — consome `encerramento-semana`. (Change de UI; sem spec delta de capability.)

## Critérios de aceite

1. **Encerrar semana individual mostra resumo**
   **GIVEN** um plano com treinos `PENDENTE` passados
   **WHEN** o treinador clica em "Encerrar semana"
   **THEN** a UI chama o endpoint individual e exibe o resumo (nº perdidos, status do plano, aviso se houver).

2. **Lote exige confirmação via preview**
   **GIVEN** o treinador aciona "Encerrar semana de todos"
   **WHEN** a UI carrega o preview
   **THEN** mostra o impacto projetado (treinos/atletas) e **só** dispara o encerramento real após confirmação explícita; cancelar não altera nada.

3. **Resumo do lote com falhas**
   **GIVEN** um lote com um atleta que falhou no backend
   **WHEN** o encerramento retorna
   **THEN** a UI mostra os totais e lista os atletas com falha sem travar a exibição dos que deram certo.

4. **Aviso de meio-de-semana é exibido**
   **GIVEN** um encerramento individual cujo retorno traz `aviso` (semana não terminou)
   **WHEN** a resposta chega
   **THEN** a UI exibe o aviso de forma clara (não como erro).

5. **Sem regressão e responsivo**
   **GIVEN** as telas de plano/fila de atenção
   **WHEN** a feature é integrada
   **THEN** `npm run lint && npm run build` passam, os dialogs são responsivos (telas menores e maiores) e nenhum fluxo existente quebra.

## Métrica de sucesso

- Habilita a medição de **adoção on-demand vs automático** definida em `coach-encerrar-semana` (a UI é o
  pré-requisito para o coach disparar on-demand).
- **Cliques para o "ritual de domingo"**: fechar a assessoria inteira em **1 confirmação** (preview → confirmar).

## Open Questions & Assumptions

- **Ponto de entrada do lote**: botão no dashboard do treinador vs página de planos — a definir com o design.
- **Distinção visual `AUTOMATICO`/`ON_DEMAND`**: na **resposta da ação** o `origem` vem no
  `EncerramentoSemanaOutputDto` (disponível). Distinguir em **leituras posteriores** (plano já fechado na
  fila/dashboard) depende de persistir `origem` no `PlanoSemanal` — follow-up fora do MVP do backend. Portanto,
  no MVP a UI mostra a origem no momento da ação; a marcação persistente em telas de leitura fica adiada.
- Assumido que a lib de geração de cliente (`openapi-typescript-codegen`) cobre os novos endpoints sem ajuste manual.

## Impact

**Frontend (`apps/menthoros-front`):**
- Novos componentes de ação + dialog de confirmação (preview) + card de resumo do lote.
- Serviço/hook de encerramento consumindo os 3 endpoints; regeneração do cliente da API.

**Dependências:**
- **Bloqueada por** `coach-encerrar-semana` (backend) — contratos precisam estar mergeados.
