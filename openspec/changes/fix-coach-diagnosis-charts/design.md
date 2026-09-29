# Design — fix-coach-diagnosis-charts

## D1. Lacuna de registro

**Regra:** ≥ `GAP_MIN_DAYS = 10` dias corridos sem ponto PMC com `tss > 0`, entre dois treinos ou do último treino até hoje (lacuna aberta).

- Descanso planejado raramente passa de 10 dias; taper longo fica abaixo disso. Valor único, exportado, fácil de ajustar.
- Dias antes do primeiro treino da série não são lacuna (é início de histórico).
- **Datas por dia civil.** `hoje` e os limites de lacuna são normalizados para o início do dia local antes de comparar; datas ISO (`yyyy-MM-dd`) são parseadas como data local, nunca via `new Date(iso)` (UTC). Sem isso a semana atual muda de estado conforme o horário do acesso.
- Funciona com série densa (backend envia dias com `tss = 0`) e esparsa (backend omite dias).
- Rótulo: **"Sem treinos registrados"**. Não afirma causa (ver Proposta nova).

`detectDataGaps(pmc, hoje) → DataGap[]` em `features/coach/adapters/diagnosisChartsAdapters.ts`.

## D2. Carga semanal em TSS

O perfil (`AtletaPerfilCoachDto`) não traz km por semana: só `roster.weeklyVolume` (7d) e `realizadosRecentes` (7d). A série PMC tem `tss` diário, então a carga semanal é `Σ tss` por semana (segunda a domingo, `startOfWeek(..., { weekStartsOn: 1 })`, mesmo corte de `semanaInicio`).

- Semana inteira dentro de uma lacuna → `tss = null`, `noData = true` (sem barra, área hachurada).
- Semana anterior ao início do histórico → `tss = null`, `noData = false`.
- Semana atual marcada `current = true` (barra em tom mais claro; parcial).
- **8 semanas**, não 12: o perfil busca `getAderenciaSemanal(atletaId, 8)` (`CoachAthleteProfileServiceImpl`). Mostrar 12 transformaria "não consultado" em "sem plano". Ampliar para 12 é follow-up de backend.
- O tooltip conta **dias com treino** (pontos com `tss > 0`), não treinos: o PMC é agregado diário.

## D3. Aderência — uma fonte

`buildAdherenceWindow(aderenciaSemanal, hoje)` soma `totalRealizado / totalPlanejado` das semanas com `semanaInicio` das **4 últimas semanas completas** — da segunda-feira de 4 semanas atrás até a semana passada. A semana em curso fica de fora: o backend (`AtletaProgressServiceImpl.getAderenciaSemanal`) conta como planejado todo treino a partir do início da janela, inclusive os que ainda vão acontecer nesta semana, então na segunda-feira um atleta perfeito aparece com 0 de 4. O front só recebe o agregado semanal e não consegue separar os dias. Semanas futuras já planejadas também ficam de fora. No gráfico, a barra da semana atual fica em tom neutro, marcada como "semana em curso". Contar só treinos até hoje no backend (o que corrige também o roster) é follow-up (reusa `buildAderenciaResumo`). O tile usa esse valor; `roster.aderenciaPercentual` vira fallback quando o perfil ainda não carregou.

As barras mostram `percentual` por semana das mesmas entradas. KPI e barras usam o mesmo `adherenceTone()`: ≥ 85 success, ≥ 70 neutro, < 70 warning (limiares já usados no tile).

**Indisponível ≠ vazio.** O perfil devolve lista vazia e o nome do campo em `avisos` quando uma consulta
falha (`CoachAthleteProfileServiceImpl.buscarLista`). O adapter expõe `adherenceAvailable` e
`pmcAvailable` (`false` quando o campo está em `avisos`); a UI mostra "Dado indisponível" e não
deriva "sem plano", zero nem lacuna. A disponibilidade da aderência é **separada** de
`quickStats.hasWindowData` (que continua sendo do PMC): hoje o tile de aderência some quando o PMC está
vazio, e o fallback `roster.aderenciaPercentual` nunca aparece.

## D4. Delta de carga

`calculateLoadDelta7d(pmc, hoje)` = `(Σ tss últimos 7 dias − Σ tss 7 dias anteriores) / Σ anteriores`. `null` quando a base anterior é 0 — tile mostra "Sem base de comparação". Por data, não por posição no array.

`calcularLoadDelta` (variação de CTL) continua exportada mas não é mais exibida como carga.

## D5. ACWR com confiança

`assessAcwrConfidence(pmc, gaps, hoje)` → `BAIXA` quando o histórico tem < 28 dias ou uma lacuna toca os últimos 28 dias. **Início do histórico = primeiro dia com `tss > 0`**, não o primeiro ponto: numa série densa, uma pausa maior que o recorte chega como zeros no início, e contar esses zeros como base daria confiança `ALTA` ao retorno. Com `BAIXA`, o tile mostra o valor em tom neutro e o delta "Baixa confiança". O cálculo do ACWR não muda.

## D6. PMCChart

Modelo puro em `features/athlete/adapters/pmcChartModel.ts`:

- **Densifica** a série por dia no intervalo do período (dias ausentes viram linha `missing`). Eixo X categórico diário fica proporcional ao tempo e `ReferenceArea` sempre encontra `x1/x2`.
- **Períodos disponíveis = dados buscados.** Todos os consumidores atuais recebem a série padrão do backend (90 dias, `DIAS_PADRAO`) e nenhum refaz a consulta ao trocar o período. Então `ranges` padrão = `4w`, `8w`, `12w`; `6m`/`1a` só voltam quando uma tela buscar por período.
- **Período filtra de fato**: últimos N dias terminando em **hoje** (`4w`=28 … `1y`=365), não no último ponto. Com série esparsa, os dias entre o último ponto e hoje entram como `missing`, e a lacuna aberta aparece no gráfico. Idempotente quando o pai já busca por período.
- **Ticks**: 1 por semana contando do último dia (6m/1a: a cada 4 semanas).
- **Lacuna**: `ReferenceArea` hachurada com rótulo, até hoje na lacuna aberta. Cada série tem `xSolid` (fora da lacuna) e `xEst` (dentro + vizinhos), desenhada tracejada **só onde o backend enviou valor** (decaimento persistido). Dia `missing` fica `null` e a linha não é desenhada ali: o front não inventa decaimento.

Componente:

- Props novas, todas opcionais: `gaps`, `embedded` (sem vidro/título, para viver dentro de `SectionCard`), `simpleMetric: 'tss' | 'forma'`, `ranges`.
- Avançado: legenda no topo com valor atual de cada série (substitui `Legend` do rodapé).
- Simples `forma`: barras de TSB coloridas por `FAIXA_APRESENTACAO[statusForma].tone` — classificação vem do backend por ponto, nenhum limiar no front.
- Forma em `surface[50]`; Condicionamento `success`, Cansaço `danger`.

`pmcAdapter` passa a copiar `statusForma`.

## D7. Layout da aba Diagnóstico

Ordem mantida (situação → evidência → ação → detalhe):

1. Sinais de atenção
2. Métricas (Carga aguda, Monotonia, Strain, Recuperação)
3. **Adesão e carga por semana** (novo, substitui 2 cards)
4. **Forma (PMC)** (renomeado de "Tendência de forma (PMC)")
5. Próximo treino
6. Limiares

Cabeçalho do atleta: remove "Aderência geral / Carga semanal" (RC7). A faixa de KPIs (D8) é a única fonte desses números.

## D8. Cabeçalho e faixa de KPIs (layout da Proposta, handoff 2)

Referência visual: `artifacts/handoff 3/fix-coach-diagnosis-charts/design/proposta.png` (versão final da Proposta; `PATCH-v2.md` no mesmo pacote).

- Cabeçalho: identidade à esquerda; **próxima prova** (`AthleteNextRace`) + ação primária à direita.
- Faixa: 4 células largas (`AthleteKpiStrip`) no lugar dos 5 `MetricTile compact`. A linha de apoio tinha `noWrap` e cortava a base do número; agora quebra em até 2 linhas.
- Células: rótulo + qualificador ("Aderência · 4 sem", "Carga · 7 dias", "Forma · TSB", "ACWR"), valor na cor do tom com o marcador de `toneMarker`, linha de apoio.
- ACWR com baixa confiança: selo "Baixa confiança" ao lado do valor e o motivo (`acwrConfidence.reason`) na linha de apoio.
- Números em pt-BR (vírgula decimal).
- Regras de texto/tom em `athleteKpiAdapters.ts` — a página só monta.
- Divergências do adapter do handoff, mantidas de propósito: (a) "Sem dado na janela" (PMC vazio) atinge só Carga, Forma e ACWR — a aderência tem disponibilidade própria (bloco 4); (b) "Dado indisponível" quando `avisos` traz `aderenciaSemanal`; (c) o roster só entra antes de o perfil carregar.
- Carga: a imagem da Proposta compara km com km ("3,7 km"); o perfil não traz km dos 7 dias anteriores, então a comparação é em TSS e o texto diz isso.

## Rollback

Sem migração nem contrato novo: reverter o PR restaura o comportamento anterior por completo.

## D9. Km por semana vindo do backend

O perfil passa a trazer `distanceSummary` (novo campo, identificadores em inglês — ADR-0007):
`weekly` com as mesmas 8 semanas ISO da aderência, contínuas (0 onde não houve treino), e
`last7DaysKm`/`previous7DaysKm`. Não vai dentro de `AderenciasSemanalDto` porque ela só tem semanas
com plano e é o contrato do `/me/aderencia` do atleta. Treinos cancelados (`contaNaCarga`) ficam de
fora, como nos insights do coach. Front: painel de carga em km quando o campo existe; TSS continua no
tooltip. A célula Carga passa a comparar km com km, como na Proposta.

## Riscos

- **Unidade de `totalPlanejado`** — confirmado "treinos" em `AderenciasSemanalDto` (28/09).
- **Limiar de 10 dias** pode marcar como lacuna um atleta lesionado em repouso — o rótulo neutro cobre esse caso.
- **Telas do atleta** mudam levemente (período filtra, cor da Forma, legenda). Revisar `StrongerBlock` e `CoachAthleteProfilePage` visualmente.

## Pré-mortem (Codex, 28/09) — incorporado

Revisão adversarial sobre o design e o código do handoff; veredito inicial NO-GO. Os seis achados
foram reproduzidos pelo revisor e viraram decisão acima e teste nas tasks:

| Achado | Severidade | Onde ficou |
|---|---|---|
| Plano futuro entra no KPI de 4 semanas | alta | D3 (limite superior) · spec "Plano futuro não entra na janela" · task 1.2 |
| Zeros iniciais contam como base do ACWR | alta | D5 (início = primeiro TSS > 0) · spec "Retorno com a pausa fora da janela" · task 1.2 |
| PMC esparso esconde a lacuna aberta | alta | D6 (período termina em hoje) · spec "Lacuna em aberto" · task 2.1 |
| 12 semanas no gráfico, 8 no payload | média | D2 (8 semanas) · spec do eixo semanal |
| Lacuna depende do horário do acesso | média | D1 (dia civil) · spec "Lacuna independe do horário" · task 1.2 |
| "Treinos" conta dias com treino | média | D2 (rótulo) · spec do tooltip |

Segunda rodada (Codex, DoR do `/implement init`, NOT READY) — 4 achados, todos conferidos no código:

| Achado | Severidade | Onde ficou |
|---|---|---|
| Falha de consulta vira "sem plano"/zero | alta | D3 "Indisponível ≠ vazio" · spec "Consulta de … falhou" · tasks 1.2, 3.1, 4.2 |
| Fallback de aderência bloqueado pelo PMC | alta | D3 · spec "Aderência independe do PMC" · task 4.2 |
| 6m/1a pedem dados nunca buscados | média | D6 "Períodos disponíveis" · spec "Períodos limitados" · task 2.2 |
| Tracejado sem valores na lacuna aberta | média | D6 "Lacuna" · spec "Lacuna aberta sem valores" · task 2.1 |

O revisor confirmou que os blocos do `PATCHES.md` casam com o código atual e que o type-check da
sobreposição passou sem erros. O código do handoff **não** tem essas correções: o TDD da
implementação parte dos testes novos e ajusta os adapters.
