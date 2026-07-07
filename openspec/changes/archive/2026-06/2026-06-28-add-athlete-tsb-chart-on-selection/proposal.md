**Tamanho:** M · **Trilha:** Full

**Status: Concluída** — versão final (gráfico PMC na aba Diagnóstico, após 2 pivots revertidos: drawer → expansão inline no roster → aba Diagnóstico) integrada ao `develop` em 2026-06-28. Loop OpenSpec fechado em 2026-07-07 (sem PR formal sob a branch — integrada via commits de dashboard; estado do develop verificado consistente com a spec).

> Full por **incerteza de design** (qual superfície expõe o gráfico de tendência ao selecionar um atleta). Escopo **frontend-only**: reusa o perfil agregado coach-scoped já carregado pela dashboard (`useAthleteProfile`) e o componente `PMCChart` existente — **sem** novo hook/serviço, **sem** mudança de contrato de API nem de schema. A exposição de **readiness por atleta ao coach** (que exigiria backend) é deliberadamente **fora de escopo** (ver Open Questions).

## Why

Na dashboard principal do coach (`features/coach/pages/CoachInboxPage.tsx`), ao selecionar um atleta o treinador abre um painel de drill-down com abas (Diagnóstico, Plano, Provas & sugestões). A aba **Diagnóstico** já mostra a **tendência de carga** (`TrendCard` em "Tendência de carga"), além de carga aguda, monotonia, strain e adesão.

Falta, ali, a leitura que decide intensidade e ajuste de plano: a **tendência de forma/carga PMC (CTL/ATL/TSB)**. Hoje, para vê-la, o coach precisa **sair da dashboard** e abrir o perfil completo (`/coach/athletes/:id`), perdendo o contexto de triagem (filtros, atleta selecionado, fila de atenção).

A correção é mostrar o **gráfico de tendência PMC junto da tendência de carga**, na mesma aba Diagnóstico, **sem sair da dashboard**. Os dados **já estão em mãos**: a dashboard carrega o perfil agregado do atleta selecionado via `useAthleteProfile`, cujo `pmc[]` é exatamente a série CTL/ATL/TSB. O componente de chart (`PMCChart`, recharts) **já existe** — falta apenas renderizá-lo na aba com a série já disponível.

## What Changes

- **Gráfico PMC na aba Diagnóstico do drill-down do atleta** (`CoachInboxPage` → `DiagnosisTabPanel`) — uma nova seção **"Tendência de forma (PMC)"** renderizada **logo após** o card "Tendência de carga", exibindo o `PMCChart` (CTL/ATL/TSB no modo avançado, TSS no simples) para o atleta selecionado. Estados de **vazio** (atleta sem PMC) tratados; sem readiness coach-scoped (fora de escopo).
- **Reuso do perfil já carregado** — a série vem de `selectedProfile.pmc` (`useAthleteProfile`, já consumido pela dashboard). **Nenhum fetch novo**: a dashboard já busca o perfil agregado do selecionado.
- **Adapter compartilhado `buildPmcDataPoints`** (`features/athlete/adapters/pmcAdapter.ts`) — converte `PmcPontoRaw` (`data: string`) → `PMCDataPoint` (`date: Date`). Extraído como fonte única e **também adotado pela página de perfil** (`CoachAthleteProfilePage`), removendo o mapeamento inline duplicado.
- **Sem mudança de backend, contrato, schema, hook ou serviço novo.** Sem alteração no roster (`CoachAthletesPage`).

## Capabilities

### New Capabilities

- `coach-athlete-quickview`: ao selecionar um atleta na dashboard, o coach visualiza, **sem navegar para fora**, a tendência de forma/carga (PMC: CTL/ATL/TSB) ao lado da tendência de carga já existente, no mesmo painel de diagnóstico.

### Modified Capabilities

<!-- Nenhuma capability canônica tem requisitos alterados. A composição da aba Diagnóstico é comportamento de UI desta change, não de uma spec canônica. -->

## Critérios de aceite

- **AC1 — gráfico PMC junto da tendência de carga** · Given o coach com um atleta selecionado na dashboard, When abre a aba Diagnóstico, Then a seção "Tendência de forma (PMC)" aparece **logo após** "Tendência de carga", na mesma aba, sem mudança de rota.
- **AC2 — gráfico de tendência renderiza** · Given um atleta com série PMC disponível (`selectedProfile.pmc`), When a aba Diagnóstico é exibida, Then o `PMCChart` exibe CTL/ATL/TSB (modo avançado) e/ou TSS (modo simples) para o range padrão.
- **AC3 — perfil completo continua acessível** · O caminho para `/coach/athletes/:id` permanece inalterado (clique na linha do roster e demais CTAs já existentes); esta change não altera navegação.
- **AC4 — estado vazio** · Given um atleta sem série PMC, When a aba Diagnóstico é exibida, Then a seção mostra mensagem de vazio explicativa e **não** monta o chart — sem quebrar a dashboard.
- **AC5 — escopo de dados coach-scoped** · A série vem do perfil agregado coach-scoped já carregado (`useAthleteProfile`, por `atletaId`) — **nunca** um endpoint `/me/*`; isolamento de tenant é o já garantido no backend.

## Métrica de sucesso

**Cliques/navegações para inspecionar a tendência de forma de um atleta caem de ≥2 (ir ao perfil + voltar) para 0** — o coach lê CTL/ATL/TSB no mesmo painel onde já vê carga, monotonia e adesão, sem perder o contexto de triagem.

## Open Questions & Assumptions

- **(Premissa)** O perfil agregado coach-scoped (`useAthleteProfile`) já traz `pmc[]` para o atleta selecionado na dashboard — confirmado (mesmo dado que alimenta o `PMCChart` da página de perfil). Não há fetch adicional.
- **(Fora de escopo — follow-up backend)** **Readiness por atleta para o coach não existe** (só `/api/v1/atletas/me/readiness`, self-scoped). Exibir readiness exigiria endpoint coach-scoped novo → change separada. Aqui, **forma (TSB)** é o proxy de prontidão exibido.
- **(Fora de escopo)** **Carga semanal como série** por atleta coach-scoped não existe; a aba Diagnóstico já mostra a tendência de carga existente (`loadTrend`) — não alterada por esta change.

## Riscos e mitigações

- **Recharts sem altura explícita colapsa** → `PMCChart` usa `ResponsiveContainer`; renderizar dentro de `SectionCard` com altura/lazy como nas demais superfícies; chart só monta quando há série (estado vazio caso contrário).
- **Vazamento de escopo de dados** → consumir **só** o perfil coach-scoped já carregado (AC5); nunca `/me/*`.
- **Duplicação de mapeamento PMC** → adapter único `buildPmcDataPoints` adotado pela dashboard e pela página de perfil.

## Histórico de design (pivots)

1. Proposta inicial: **drawer lateral** ao clicar na linha do roster.
2. Pivot 1: **expansão inline na `DataGrid`** do roster, acionada por ícone dedicado (`onRowClick` preservado).
3. Pivot 2 (atual): **gráfico na aba Diagnóstico da dashboard**, junto da tendência de carga, reusando `selectedProfile.pmc`. Motivo: o drill-down da dashboard já é a superfície "ao selecionar um atleta", já carrega o perfil (zero fetch extra) e coloca forma e carga lado a lado. O roster fica **inalterado**.
