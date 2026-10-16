# Levantamento: expansão da integração de relógios via intervals.icu

> Resumo: hoje o Menthoros entrega treino planejado e recebe treino realizado através do
> intervals.icu, e só o canal Garmin foi validado de ponta a ponta. Este documento levanta,
> por marca (Apple Watch, Samsung/Wear OS, Amazfit, COROS, Suunto, Polar, Huawei, Wahoo), o
> que o intervals.icu já cobre, o que depende de app de terceiro, o que não existe, e o esforço
> para o Menthoros declarar suporte oficial a cada uma. Fecha com a proposta de changes
> OpenSpec e os gates de validação manual.

**Data:** 2026-10-15
**Status:** C1 + C2 viraram a change **`add-watch-brand-connection-guide`** (M · Full, 2026-10-15,
`openspec/changes/add-watch-brand-connection-guide/`), fundidas como walking skeleton. C3–C7
continuam como entrada de `/change` futuros. **Correção ao texto abaixo:** a marca do relógio
**já é persistida** pelo onboarding (`DispositivoMarca` em `tb_perfil_onboarding_atleta`, V67) e
usada como prior do `ConfidenceScorer`; o que a seção 1 chama de "`WatchBrand` só na waitlist" é
um segundo enum para o mesmo conceito. O C1 não precisa de migration.
**Fontes:** pesquisa web de 2026-10-15 (lista no final) + código do backend/front + changes
arquivadas de intervals.icu. Afirmações sobre marcas vêm de fórum oficial do intervals.icu, páginas
dos fabricantes e guias de terceiros; o que depende de **modelo/firmware** precisa de gate manual.

---

## 1. A premissa que muda o tamanho do problema

O Menthoros **não integra com relógio**. Integra com o **intervals.icu** (app OAuth `663`,
escopos `ACTIVITY:READ,CALENDAR:WRITE`), e o intervals.icu é quem fala com o relógio. O código
que existe hoje é todo agnóstico de marca:

| Camada | O que existe | Onde |
|---|---|---|
| Push de treino planejado | `WorkoutChannel` → `IntervalsIcuAdapter` cria evento com `workout_doc` estruturado na aprovação do plano; retry, reconciliação de órfãos, nudge anti-debounce | `services/WorkoutChannel.java`, `services/impl/IntervalsIcuAdapter.java`, `IntervalsIcuPushListener`, `IntervalsIcuPushProcessor`, `helper/IntervalsIcuWorkoutConverter` |
| Ingestão de treino realizado | scheduler de pull (cursor próprio, overlap de 7 dias, backfill de laps até 50 fetches/execução) | `IntervalsIcuActivitySyncScheduler`, `IntervalsIcuLapsBackfillServiceImpl`, spec `activity-sync` |
| Webhook | change `intervals-icu-webhook-ingestion` **proposta, 1/32 tasks** — não implementada | `openspec/changes/intervals-icu-webhook-ingestion` |
| Conexão do atleta | OAuth2 self-service, status `conectado / externalAthleteId / ultimoPush / ultimoErro` | `IntervalsIcuConnectionController`, `IntervalsIcuConnectionCard.tsx` |
| Marca do relógio | `WatchBrand { GARMIN, COROS, POLAR, APPLE, OTHER, UNKNOWN }` — só na waitlist/onboarding, **para medir demanda**; nada lê isso em runtime | `enums/WatchBrand.java`, `WaitlistSegment` (Garmin = `QUALIFIED`, resto = `OTHER_BRAND`) |

Consequência: **"suportar uma marca nova" quase nunca é código de integração.** É (a) saber se o
intervals.icu fecha o circuito com aquela marca, (b) adaptar o treino que enviamos às limitações
daquele canal, (c) tratar a atividade que volta sem os dados que assumimos (laps, FC), e (d)
onboarding, documentação e suporte. O custo está em (b), (c) e (d), não em (a).

O único cenário que vira código de integração de verdade é **canal nativo** (Garmin Training API,
app iOS com HealthKit/WorkoutKit) — e esses são os caminhos mais caros e, no caso Garmin, hoje
bloqueados (seção 4).

---

## 2. Matriz por marca

Legenda de **circuito**: ingestão = treino realizado chega ao intervals.icu; push = treino
planejado do intervals.icu chega ao relógio. "Nativo" = conexão oficial em Settings → Connections
do intervals.icu. "Bridge" = app de terceiro no celular.

| Marca | Ingestão | Push de treino planejado | Laps / etapas na atividade | Wellness (sono, HRV, FC repouso) | Veredito para o Menthoros |
|---|---|---|---|---|---|
| **Garmin** | Nativo, imediato (webhook do Garmin no intervals.icu) | Nativo, imediato na criação do evento (validado 2026-07-14/15) | Sim | Sim | **Suportado hoje.** Único canal validado |
| **COROS** | Nativo | Nativo, janela rolante de 7 dias; atleta precisa adicionar "Intervals.icu Training Plan" ao calendário COROS | Sim | Sim | **Pronto para validar.** Limitação: um único tipo de alvo por treino (pace OU FC) |
| **Suunto** | Nativo | Nativo via SuuntoPlus Guides; alvo por potência, FC, pace ou cadência; sem etapa por distância | Sim | Sim | **Pronto para validar.** Modelos antigos (3/5/9) exigem firmware mínimo |
| **Wahoo** | Nativo | Nativo, próximos 7 dias para o Wahoo Cloud | Sim | Não | Pronto para validar, mas **público é ciclismo** (ELEMNT) — baixa relevância para corrida |
| **Huawei** | Nativo (desde 2026-03; histórico limitado a 1 ano) | Nativo, **só corrida/caminhada/trilha**, **um treino por vez** (o próximo dentro de 7 dias); relato de erro 500 com rampas | A confirmar | Sim | Viável para corrida; **gate manual obrigatório** (rampas, um treino por vez) |
| **Amazfit / Zepp** | Nativo (Zepp OS 5+), via webhook em minutos | **Só T-Rex 3 Pro e Balance 2** empurram os próximos 7 treinos automaticamente; demais modelos exigem importar `.fit` manualmente no Zepp | **Zepp não entrega laps de intervalado** (entrega para o Strava, não para o intervals.icu) | Sim | **Parcial e dependente de modelo.** Ingestão boa; push só em 2 modelos; laps ausentes quebram a análise por etapa |
| **Polar** | Nativo | **Não existe** — limitação da API da Polar; a Polar só recebe treino estruturado do TrainingPeaks (desde 2025-03) | Sim | Sim | **Só ingestão.** Push ao relógio não é possível pelo intervals.icu. Alternativa: atleta monta o alvo no Polar Flow à mão |
| **Apple Watch** | Bridge: *Intervals.icu Companion* (Apple Health ↔ intervals.icu, duas vias) ou *Watchletic*; sem app oficial | Bridge: *Intervals Companion* converte o treino para o app Workouts nativo (relato de envio manual, não automático); *Watchletic* importa e guia o treino no pulso. Intervals.icu não empurra direto ao Watch | Companion: toggle separado, autor diz que "foi difícil fazer funcionar"; natação sem estrutura | Via Companion / Watchletic | **Viável só com app de terceiro no iPhone.** Fluxo de 3 partes (Menthoros → intervals.icu → app → Watch). Experiência inferior ao Garmin |
| **Samsung Galaxy Watch (Wear OS)** | Bridge: *Health Sync* (Android) lê Samsung Health → intervals.icu; Samsung Health **não** expõe HRV a parceiros; sem Health Connect nativo no intervals.icu ainda | Bridge: *Watchletic for Wear OS* (testado pelo autor em Galaxy Watch Ultra 2) importa treino do intervals.icu. Samsung Health não recebe treino estruturado | Depende do app que grava (Watchletic grava com estrutura) | Parcial (sono sim, HRV não) | **Viável só com app de terceiro.** Mesmo caráter do Apple Watch |

### O que a tabela diz em uma frase

Sem escrever código de integração, o intervals.icu já fecha o circuito completo para **Garmin,
COROS, Suunto, Wahoo e Huawei**; fecha só a ingestão para **Polar**; fecha parcialmente para
**Amazfit** (depende do modelo); e para **Apple Watch e Samsung** o circuito só fecha com um app
pago/terceiro que o atleta instala e mantém.

---

## 3. Onde o Menthoros quebra hoje por marca

Problemas concretos que aparecem no código atual quando a atividade não vem de um Garmin.

1. **Um alvo por treino (COROS).** O `IntervalsIcuWorkoutConverter` resolve pace e FC e pode
   gerar treinos que misturam os dois tipos de alvo entre etapas. No COROS isso aparece
   incompleto no relógio. Precisa de regra "um tipo de alvo por treino" quando o canal exige.
2. **Rampas e tipos de atividade (Huawei).** Só corrida/caminhada/trilha chegam ao relógio e há
   relato de erro 500 com rampas. O push precisa saber que o atleta é Huawei para (a) não
   gerar rampa e (b) não contar como sucesso um treino que o intervals.icu aceitou mas não
   subiu ao relógio.
3. **Um treino por vez (Huawei) e janela de 7 dias (COROS, Wahoo, Amazfit).** O push do
   Menthoros é na aprovação do plano, semanas à frente. O intervals.icu só sobe a janela
   rolante; isso já funciona para Garmin? Não é problema — o Garmin aceita tudo. Para os demais,
   a reconciliação de órfãos assume que deletar o evento no intervals.icu remove do relógio;
   **no COROS não remove** (o intervals.icu não enxerga o que já foi para o calendário COROS).
   O chip de status "sincronizado" passa a mentir.
4. **Atividade sem laps (Amazfit, Apple via Companion).** O backfill de laps assume que o
   provedor entrega `intervals`; sem eles, a comparação etapa planejada × realizada e a
   análise por IA do `WorkoutAnalysisListener` degradam. Precisa de fallback: usar os steps do
   treino planejado como laps (o intervals.icu tem a opção "Use Laps"/workout steps), ou
   detecção automática do próprio intervals.icu.
5. **Status de conexão cego.** `IntervalsIcuConnectionStatusDto` diz se o intervals.icu está
   conectado, não se o **relógio** está conectado ao intervals.icu nem se "Upload planned
   workouts" está ligado. Para Garmin isso é lido (`icu_garmin_training`,
   `icu_garmin_upload_workouts`) só na sondagem manual de 2026-07-14, nunca em runtime. É a
   causa número 1 de ticket de suporte previsível ("conectei e o treino não chegou").
6. **`WatchBrand` não participa de nada.** Marca é capturada no onboarding e na waitlist e
   descartada. Sem ela, nenhum dos ajustes acima tem como ser condicional.
7. **`FonteDados` só conhece `GARMIN` e `STRAVA`** como origem nominal. A atividade que volta
   do intervals.icu traz o `device`/fonte original; hoje não é usado para rotular.

---

## 4. Alternativas nativas (fora do intervals.icu) e por que ainda não

| Canal | Estado em 2026-10 | Esforço | Decisão |
|---|---|---|---|
| **Garmin Training API** (push direto ao Garmin Connect) | Programa de desenvolvedores **pausado desde a primavera de 2026**: Garmin não processa pedidos novos, sem data; exige pessoa jurídica | L–XL (OAuth 1.0a, modelo de workout próprio, aprovação) | **Bloqueado.** Manter no roadmap, não planejar |
| **App iOS Menthoros com HealthKit/WorkoutKit** (Apple Watch nativo) | Possível tecnicamente (WorkoutKit desde iOS 17) | XL (app iOS novo, App Store, manutenção) | Não antes de validar demanda; o *Intervals Companion* já faz isso |
| **App Wear OS / Health Connect** (Samsung nativo) | Health Connect expõe Samsung Health; intervals.icu ainda não lê Health Connect | XL (app Android novo) | Mesmo raciocínio do iOS |
| **Strava como ponte** (Zepp/Samsung → Strava → intervals.icu) | Funciona, mas os termos do Strava (nov/2024) proíbem mostrar dado ao coach e usar em IA; e o intervals.icu deduplica mal Strava + outra fonte | S de código, risco legal alto | **Descartado** (ver `integrations.md`) |

---

## 5. Changes propostas (OpenSpec)

Ordenadas por valor/custo. Tamanho na escala do playbook (XS→XL) e trilha (Fast p/ XS·S, Full
p/ M·L·XL). Esforço em dias de desenvolvimento de uma pessoa, incluindo testes, sem contar o
gate manual com relógio físico.

| # | Change (id sugerido) | Escopo | Tamanho · Trilha | Esforço | Dependência |
|---|---|---|---|---|---|
| C1 | ~~`watch-brand-no-perfil-atleta`~~ → `add-watch-brand-connection-guide` | Persistir `WatchBrand` no atleta (hoje só na waitlist/onboarding), expandir o enum (`SUUNTO`, `WAHOO`, `AMAZFIT`, `HUAWEI`, `SAMSUNG`), expor no perfil do coach e no `IntervalsIcuConnectionStatusDto`. Migration aditiva. | S · Fast | 1–2 dias | nenhuma |
| C2 | ~~`guia-conexao-por-marca`~~ → `add-watch-brand-connection-guide` | Front: `IntervalsIcuConnectionCard` passa a mostrar o passo a passo da marca do atleta (Garmin/COROS/Suunto/Huawei/Amazfit: ligar em Connections e marcar "Upload planned workouts"; Apple/Samsung: instalar Companion ou Watchletic; Polar: aviso de que só a ingestão funciona). Conteúdo em PT-BR, sem backend novo. | S · Fast | 2–3 dias | C1 |
| C3 | `status-conexao-relogio` | Backend lê do `GET /athlete/0` os campos de conexão do relógio (`icu_garmin_*` confirmados; equivalentes COROS/Suunto/Wahoo/Huawei/Zepp **a sondar**) e expõe `relogioConectado` + `uploadPlanejadosAtivo`. Chip no coach e alerta no atleta quando o push está desligado. **Gate 0:** sondar a resposta real da API para cada marca — a documentação pública não lista esses campos. | M · Full | 3–5 dias + gate | C1 |
| C4 | `push-compat-por-canal` | `IntervalsIcuWorkoutConverter`/`IntervalsIcuAdapter` passam a receber a marca e aplicar perfil de compatibilidade: um tipo de alvo por treino (COROS), sem rampas e só corrida (Huawei), descrição textual de fallback para Polar/Amazfit sem push. Resultado do push distingue "aceito pelo intervals.icu" de "subiu ao relógio". | M · Full | 4–6 dias | C1, C3 |
| C5 | `ingestao-sem-laps-fallback` | Quando a atividade chega sem `intervals`, derivar etapas do treino planejado casado (steps-as-laps) ou marcar `semEtapas` para a análise por IA degradar com aviso em vez de silenciosamente. Cobre Amazfit, Apple via Companion, Samsung via Health Sync. | M · Full | 3–5 dias | nenhuma (mas valida com C2) |
| C6 | `reconciliacao-orfaos-por-canal` | Para canais de janela rolante (COROS, Wahoo, Amazfit, Huawei), registrar que deletar no intervals.icu não remove do relógio; orientar o atleta e não marcar o chip como sincronizado. | S · Fast | 1–2 dias | C3 |
| C7 | `intervals-icu-webhook-ingestion` (já proposta) | Latência de minutos para quem alimenta o intervals.icu direto do relógio (Garmin, COROS, Suunto, Huawei, Amazfit). Não é específica de marca, mas é o que faz a experiência das marcas novas parecer "ao vivo". 1/32 tasks. | M · Full | já estimada na change | scheduler validado em produção |

**Total para "suporte oficial" a COROS, Suunto, Huawei, Amazfit (modelos com push) e
Polar (ingestão):** C1–C4 + C6 ≈ **11–18 dias** de desenvolvimento, mais um gate manual por
marca.

**Apple Watch e Samsung:** C1 + C2 + C5 ≈ **6–10 dias**. Não há código de integração a
escrever; o custo é documentação, fallback de laps e o gate manual com o app de terceiro. O
risco é de produto: o atleta depende de um app pago (Watchletic) ou de um app comunitário
(Intervals Companion, autor único) e o Menthoros não controla nenhum dos dois.

Fora da estimativa: C7 (já tem change própria) e qualquer canal nativo da seção 4.

---

## 6. Gates de validação manual (bloqueantes por marca)

O mesmo padrão do gate de 2026-07-14 com o Garmin: um treino com aquecimento, bloco `4x` com
alvo de pace e FC, e desaquecimento, aprovado no Menthoros, precisa aparecer **estruturado no
relógio**, e a atividade executada precisa voltar **com laps** ao Menthoros.

| Marca | Precisa de | Verifica |
|---|---|---|
| COROS | relógio COROS + app | plano no calendário COROS; alvo único por treino; deleção não remove |
| Suunto | relógio Suunto (firmware mínimo) | SuuntoPlus Guide gerado; etapa por tempo apenas |
| Huawei | relógio Huawei + HUAWEI ID | só o próximo treino sobe; rampa dá 500? |
| Amazfit | **T-Rex 3 Pro ou Balance 2** (push) e um modelo sem push | push automático vs `.fit` manual; atividade volta **sem laps** |
| Polar | relógio Polar | ingestão com laps; confirmar ausência de push |
| Apple Watch | iPhone + Watch + Intervals Companion **e** Watchletic | treino aparece no Workouts; envio manual vs automático; laps de volta |
| Samsung | Android + Galaxy Watch + Health Sync + Watchletic Wear OS | treino importado no Watchletic; atividade volta; HRV ausente |

Sem relógio físico de cada marca, o gate pode ser feito com **atletas beta** por marca, o que
muda o cronograma (depende de disponibilidade deles) e exige o C2 pronto antes para que o
beta consiga conectar sozinho.

---

## 7. Riscos e decisões em aberto

- **Campos de conexão não documentados (C3).** O intervals.icu expõe `icu_garmin_*` no athlete,
  mas não há documentação pública para COROS/Suunto/Wahoo/Huawei/Zepp. Se não existirem, o
  C3 cai para "o atleta confirma manualmente que ligou o upload", e o alerta automático sai.
- **Dependência de terceiros para Apple/Samsung.** Watchletic é pago e Intervals Companion é
  mantido por uma pessoa. Declarar "suporte oficial" a essas marcas sem controlar o app é
  prometer o que não se garante. Recomendação: chamar de **"compatível via app parceiro"** na
  documentação, não de suporte.
- **Amazfit por modelo.** Comunicar "suporta Amazfit" vai gerar ticket dos modelos sem push.
  Precisa de lista de modelos explícita no C2.
- **Polar sem push** é definitivo enquanto a Polar não abrir a API; o canal TrainingPeaks que
  a Polar liberou não serve ao intervals.icu.
- **Garmin Training API pausada** reforça que o intervals.icu continua sendo a aposta certa
  de canal; a dependência de um serviço mantido por uma pessoa (já registrada) permanece.
- **Demanda real.** `WaitlistSegment` já segmenta por marca; antes de abrir C3–C6, vale
  puxar a distribuição da waitlist e do onboarding para ordenar as marcas por volume real
  em vez da ordem desta tabela.

---

## 8. Recomendação

> **Atualização 2026-10-15 (decisão do founder):** a ordem de validação passa a seguir a
> **estimativa de uso no Brasil**, não a facilidade técnica: Garmin (validado) → Apple Watch →
> Amazfit → COROS → Samsung → Polar → Huawei → Suunto → Wahoo. O item 2 abaixo (COROS e Suunto
> primeiro) fica superado; Apple e Amazfit, de circuito parcial, entram antes. Fonte da ordem:
> `artifacts/decision-memo-add-watch-brand-connection-guide.md`, seção 8.

1. Fazer **C1 + C2 agora** (≈ 3–5 dias): custo baixo, destrava beta de qualquer marca e
   começa a medir demanda real.
2. Validar **COROS e Suunto** com beta (circuito completo nativo, maior chance de "funciona
   igual ao Garmin").
3. Abrir **C3 e C4** só após o gate das duas marcas acima mostrar quais limitações de fato
   aparecem.
4. Tratar **Apple Watch e Samsung** como "compatível via app parceiro" com C5, sem prometer
   paridade com Garmin.
5. **Polar** entra como ingestão apenas, com aviso claro no onboarding.

---

## Fontes

- [Intervals.icu — página inicial (lista de integrações)](https://www.intervals.icu/)
- [Intervals.icu News 2026-03-08 (Huawei)](https://forum.intervals.icu/t/intervals-icu-news-2026-03-08/123942)
- [Huawei support available — fórum](https://forum.intervals.icu/t/huawei-support-available/120529)
- [Train smarter with your HUAWEI watch and Intervals.icu](https://www.intervals.icu/integrations/huawei/)
- [Amazfit (Zepp) support available — fórum](https://forum.intervals.icu/t/amazfit-zepp-support-available/107652?page=10)
- [Zepp OS: Train Smarter with TrainingPeaks and Intervals.icu](https://os.zepp.com/news/train-smarter-with-trainingpeaks-and-intervalsicu)
- [Amazfit Intervals.icu Sync — Setup, Models, Fixes (stas.run)](https://stas.run/en/guides/connect-amazfit-to-intervals-icu)
- [Amazfit Interval Workouts: Zepp Templates + Intervals.icu (stas.run)](https://stas.run/en/guides/amazfit-interval-workouts)
- [Which Sports Watches Work with Intervals.icu (stas.run)](https://stas.run/en/guides/intervals-icu-watch-compatibility)
- [Complete guide to Intervals.icu for cyclists (jscyclingtraining)](https://jscyclingtraining.com/en/complete-guide-intervals-icu-cyclists/)
- [Upload planned workouts to Wahoo — fórum](https://forum.intervals.icu/t/upload-planned-workouts-to-wahoo/65949)
- [Upload workouts to Suunto watches — fórum](https://forum.intervals.icu/t/upload-workouts-to-suunto-watches/9560)
- [Coros support added — fórum](https://forum.intervals.icu/t/coros-support-added/37006)
- [Coros and structured workouts — fórum](https://forum.intervals.icu/t/coros-and-structured-workouts/16859?page=4)
- [Coros training plan is created but planned workouts are not syncing — fórum](https://forum.intervals.icu/t/coros-training-plan-is-created-but-planed-workouts-are-not-syncing/131097)
- [Load the programmed training in Polar Flow — fórum](https://forum.intervals.icu/t/load-the-programmed-training-in-polar-flow/6064)
- [Polar's TrainingPeaks structured workout integration (DC Rainmaker, 2025-03)](https://dcrainmaker.com/2025/03/polars-trainingpeaks-structured-workout-integration-goes-live-heres-how-it-works.html)
- [Intervals.icu Companion — App Store](https://apps.apple.com/us/app/intervals-icu-companion/id6739638454)
- [Intervals Companion v3 updates for Apple Health and workout syncing — fórum](https://forum.intervals.icu/t/intervals-companion-v3-updates-for-apple-health-and-workout-syncing/124208)
- [Apple watch workouts — feature request no fórum](https://forum.intervals.icu/t/apple-watch-workouts/42870)
- [Intervals.icu on Apple Watch with Watchletic — fórum](https://forum.intervals.icu/t/intervals-icu-on-apple-watch-with-watchletic/52551)
- [Intervals.icu on Wear OS with Watchletic — fórum](https://forum.intervals.icu/t/intervals-icu-on-wear-os-with-watchletic/130881)
- [Watchletic for Wear OS](https://www.watchletic.com/wear-os)
- [Watchletic — Intervals.icu](https://www.watchletic.com/intervalsicu)
- [Health Sync now supports Intervals.icu — fórum](https://forum.intervals.icu/t/health-sync-now-supports-intervals-icu/92287)
- [Not getting HRV and sleep data from Samsung Health — fórum](https://forum.intervals.icu/t/not-getting-hrv-and-sleepdata-from-samsung-health/109911)
- [Samsung Health via Health Connect — Samsung Developers](https://developer.samsung.com/health/blog/en/accessing-samsung-health-data-through-health-connect)
- [Garmin Training API — Garmin Developers](https://developer.garmin.com/gc-developer-program/training-api)
- [Garmin Freezes Developer API Months After Strava Lawsuit (the5krunner, 2026-09)](https://the5krunner.com/2026/09/14/garmin-developer-api-access-paused/)
- [Garmin's Connect Developer Program is paused (Terra)](https://tryterra.co/blog/garmin-connect-developer-program-pause)
- [Uploading planned workouts to Intervals.icu — fórum (API, CALENDAR:WRITE)](https://forum.intervals.icu/t/uploading-planned-workouts-to-intervals-icu/63624)
