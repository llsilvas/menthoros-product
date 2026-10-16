# Decision memo — `add-watch-brand-connection-guide` pela lente do CPO

**Data:** 2026-10-15 · **Autor:** agente CPO · **Status:** rascunho para decisão do founder
**Objeto:** `openspec/changes/add-watch-brand-connection-guide/` (M · Full, proposta em 2026-10-15,
product review Refine + pré-mortem Codex incorporados)
**Origem:** `knowledge/engineering/levantamento-expansao-relogios-intervals-icu.md` (C1 + C2)

---

## 1. Resumo executivo

A change é um **Enabler** da Direção 3 da bússola (fidelidade planejado × executado via
intervals.icu) e cumpre um guardrail explícito ("o onboarding deve empurrar a conexão direta
relógio → intervals.icu"). Ela não cria diferenciação: o que ela faz é **tirar o Menthoros do
"só Garmin"** sem escrever integração, dando ao atleta o passo a passo da marca dele e ao
treinador a visibilidade do que esperar do canal. Custo baixo (3–5 dias, sem migration),
reversível, sem custo de LLM.

**ROI 0,90** (impacto 3 × confiança 60 % ÷ esforço 2) → bucket **Fazer em seguida**, com
promoção a **Fazer agora** condicionada a um único dado que ainda não temos: **existe atleta
ou assessoria do programa fundador com relógio não-Garmin?** Se a distribuição da waitlist e do
onboarding (task 0.3) mostrar zero, a change é pós-pilot disfarçado e deve esperar; se mostrar
≥ 3 leads qualificados não-Garmin, ela é pré-requisito do beta e passa na frente de
`intervals-icu-webhook-ingestion` (parada há 45 dias, 0/30).

**Duas Propostas novas** fecham o memo: medir demanda por marca no funil (XS, ROI 2,40) e um
sinal de **fidelidade de dados observada** por atleta, derivado da atividade real em vez da
marca declarada (Core, ROI 1,30) — que resolve de forma estrutural o achado 3 do Codex.

---

## 2. Compass fit

| Pergunta | Resposta |
|---|---|
| Direção servida | **3 — Planejado × executado.** Sem conexão correta do relógio, não há execução para comparar. Indiretamente 1 (triagem): "relógio não informado" / "só ingestão" vira contexto para o coach. |
| Label | **Enabler** (destrava a Direção 3 para atletas não-Garmin). Tem componente **Parity**: o runy lista Garmin, Apple Watch, Polar, Amazfit e Coros nas integrações; chegar perto disso é table stakes, não pitch. |
| Guardrail | Atende "onboarding must push direct watch → intervals.icu connection". **Não** viola o guardrail Strava: Apple/Samsung entram via Companion/Health Sync, não via Strava. |
| Anti-direção | Risco de cair em "integrações que ninguém pediu" **se a demanda for zero** — por isso o gate 0.3 é a decisão central. |
| Métrica da bússola (minutos de revisão por atleta/semana) | Efeito indireto: reduz minutos de **suporte**, não de revisão. Não mover a métrica é esperado e aceitável para um Enabler. |

## 3. North Star — qual dos quatro critérios

1. **Economizar tempo do coach:** sim — o ticket "conectei e não chegou" hoje cai no treinador
   sem ele saber qual relógio o atleta usa. A linha "Relógio" + "O que pedir ao atleta" é a
   resposta pronta.
2. Qualidade da decisão: neutro.
3. Mais atletas sem perder personalização: **sim, na margem** — hoje a assessoria só consegue
   operar atleta Garmin com segurança; o guia abre COROS/Suunto (circuito nativo) para beta.
4. Risco/progresso visível: parcial — "só treino realizado" (Polar) e "compatível via app
   parceiro" (Apple/Samsung) avisam o coach de antemão que a fidelidade será menor.

Passa no corte (atende 1 e 3).

## 4. Momento do produto

- O programa fundador já segmenta leads por relógio (`WaitlistSegment.OTHER_BRAND`) e já manda um
  e-mail **reconhecendo a limitação** (`add-waitlist-other-brand-email`, 2026-10-11). Ou seja, o
  produto já **diz "não" a lead não-Garmin**. Esta change é o que permitiria dizer "sim, com
  ressalvas" a COROS/Suunto e "sim, só realizado" a Polar.
- O que **não existe** é o número: quantos leads `OTHER_BRAND` entraram, e com qual marca. O
  endpoint de funil (`GET /api/admin/waitlist/funnel`) agrega por UTM, não por `watchBrand`.
  Sem esse dado, a decisão é por intuição — exatamente o que o operating model proíbe.
- Sprint corrente segue não declarada (10ª auditoria). A change não deve entrar em `SPRINTS.md`
  antes da declaração do sprint; posição sugerida abaixo.

## 5. ROI

Escala: impacto 1–5 · confiança 0–100 % · esforço 1–5 · ROI = impacto × confiança ÷ esforço.

| Opção | Impacto | Confiança | Esforço | ROI | Compass | Bucket |
|---|---:|---:|---:|---:|---|---|
| **A. A change como está** (C1+C2: enum + matriz + card do atleta + linha do coach) | 3 | 60 % | 2 | **0,90** | Enabler | **Fazer em seguida** (→ Fazer agora se gate 0.3 confirmar demanda) |
| B. Só C1 (enum + prior), sem guia | 1 | 80 % | 1 | 0,80 | Enabler fraco | Não fazer sozinho — fundação sem ação |
| C. Guia como página estática no site de docs, linkada do card, sem marca no perfil | 2 | 70 % | 1 | 1,40 | Parity | Alternativa barata se a demanda for zero: entrega o passo a passo sem tocar enum nem coach |
| D. A change + C3 (status da conexão em runtime) juntas | 4 | 45 % | 4 | 0,45 | Core (Dir. 1 + 3) | Não agora — C3 tem gate de sondagem de API não documentada |

**Evidência por trás da confiança de A (60 %):**
- Verificado no código (sobe): marca já persistida (`DispositivoMarca`, V67), sem migration,
  endpoint de onboarding já acessível a atleta e coach; enum forward-only após o Codex.
- Verificado em fonte secundária (neutro): a matriz vem de fórum oficial do intervals.icu e
  guias de terceiros de 2026-10; nenhuma marca além da Garmin passou por gate manual.
- **Não verificado (derruba):** demanda real por marca; se o ticket "conectei e não chegou" é
  mesmo a causa nº 1 (previsto no levantamento, nunca contado); comportamento dos apps de
  terceiro (Companion, Watchletic) na prática.

**Impacto 3, não 4:** a change não muda nenhuma decisão do coach nem o plano; remove uma classe
de ticket e abre beta. Impacto 4 exigiria o sinal de conexão em runtime (C3) ou a fidelidade
observada (Proposta nova 2).

**Por que a opção C não vence:** ROI maior, mas é Parity pura e não dá ao coach nada — e o
guia genérico não sabe que o atleta é Polar, então não evita a promessa errada. Vale como
**plano B** se o gate 0.3 der zero.

## 6. Riscos de produto (além dos já no proposal)

1. **Fidelidade menor sem aviso ao coach.** Apple via Companion e Amazfit devolvem atividade
   **sem laps**; a Direção 3 degrada silenciosamente (comparação por etapa e análise por IA).
   A change avisa o atleta, mas a linha do coach fala de **push**, não de **ingestão**. Sugiro
   que `resumoParaCoach` diga também "treino realizado volta sem etapas" quando for o caso —
   é texto, custa zero.
2. **Marca declarada ≠ marca real** (achado 3 do Codex). A change mitiga com "informada no
   onboarding, não confirmada". A solução estrutural é a Proposta nova 2.
3. **Dependência de app de terceiro** (Watchletic pago, Companion de autor único) somada à
   dependência já registrada do próprio intervals.icu (mantenedor solo). Duas camadas de
   fornecedor único para Apple/Samsung. Rótulo "compatível via app parceiro" é o mínimo; a
   decisão de **não** listar Apple/Samsung no chip do onboarding (task 0.1) merece ser
   considerada — hoje `APPLE` já está lá, então o dano já existe.
4. **Governança de conteúdo.** O produto passa a ter texto que envelhece em arquivo de código.
   O item recorrente no Kanban (task 5.2) precisa de dono nomeado — sem nome, é a 11ª auditoria
   apontando o mesmo gap, em outro assunto.

## 7. Posição sugerida no roadmap (proposta, não decisão)

- **Trilha intervals.icu**, como item 4, **antes** de `intervals-icu-webhook-ingestion` (item
  3, 0/30, parada há 45 dias). Justificativa: a change é menor, destrava beta, e o webhook
  beneficia todas as marcas só depois que elas conectam certo.
- **Não** alterar `SPRINTS.md` até o founder declarar o sprint corrente (memo de 09-30).
- Sequência recomendada do levantamento mantida: esta change → beta COROS/Suunto → C3/C4 só
  com o que o gate mostrar.

## 8. Decisões do founder (gate)

**Decidido em 2026-10-15 — ordem de prioridade por marca:** Garmin → Apple Watch → Amazfit →
COROS → Samsung → Polar → Huawei → Suunto → Wahoo (estimativa de uso entre atletas de
assessoria no Brasil, por triangulação; sem ranking público por marca no país). Aplicada à
ordem do guia, dos chips do onboarding e dos gates/beta. Ressalva registrada: as posições 2 e 3
são as de circuito parcial (app parceiro / por modelo), então o beta começa pelas marcas mais
difíceis de prometer — o rótulo "Compatível via app parceiro" / "Parcial por modelo" é o que
protege a assessoria nesse início. A ordem é provisória até a Proposta nova 1 trazer o dado real.

1. **Demanda:** aceitar a regra "≥ 3 leads qualificados ou atletas não-Garmin → Fazer agora;
   zero → esperar e fazer a opção C"? (dado vem da task 0.3; Proposta nova 1 torna o dado
   permanente).
2. **Chip do onboarding (task 0.1):** expor as quatro marcas novas já, só COROS/Suunto, ou
   todas com "Em validação" visível? Recomendação do CPO: **todas, com rótulo visível** — medir
   demanda real vale mais que esconder a opção; o rótulo protege a promessa.
3. **Dono da revisão de conteúdo e da planilha de intervenções** (tasks 0.3b e 5.2).
4. **Posição no roadmap** (seção 7) quando o sprint for declarado.

## 9. Propostas novas

### Proposta nova 1 — Funil da waitlist por marca de relógio (Enabler, XS)

Estender `GET /api/admin/waitlist/funnel` (já existe, agrega por UTM) para agregar também por
`watchBrand` × `segment`, e cruzar com `tb_perfil_onboarding_atleta.dispositivo_marca`. Vira o
dado que esta change e toda a sequência C3–C6 precisam, de forma permanente — hoje a task 0.3
faria isso à mão uma vez.

| Impacto | Confiança | Esforço | ROI | Compass | Bucket |
|---:|---:|---:|---:|---|---|
| 3 | 80 % (endpoint e campos existem; é agregação) | 1 | **2,40** | Enabler (desbloqueia a decisão desta change e a ordem das marcas no beta) | Fazer agora (XS · Fast) |

### Proposta nova 2 — Sinal de fidelidade de dados observada por atleta (Core, Direção 3)

Em vez de confiar na marca **declarada**, derivar da atividade **real** ingerida: tem laps?
tem FC? chegou por push nativo ou veio como stub (Strava → intervals.icu, que o guardrail
manda sinalizar e hoje ninguém detecta)? Um `fidelidadeDados ∈ {ALTA, PARCIAL, STUB,
DESCONHECIDA}` por atleta, calculado no pull diário sem chamada extra, exposto na linha
"Relógio" do coach e, quando `PARCIAL`/`STUB`, como motivo na fila de atenção. Resolve de
forma estrutural o achado 3 do Codex (marca errada), cumpre o guardrail dos stubs e avisa o
coach quando a análise por IA está rodando sobre dado pobre — antes que ele confie nela.

| Impacto | Confiança | Esforço | ROI | Compass | Bucket |
|---:|---:|---:|---:|---|---|
| 4 | 65 % (laps/FC já são campos do `TreinoRealizado`; detecção de stub precisa de sondagem do `device`/`source` da API) | 2 | **1,30** | **Core** — Direção 3 (fidelidade) e Direção 1 (motivo de atenção) | Fazer em seguida, depois desta change; absorve parte do C3 e do C5 sem sondar campos `icu_*` não documentados |

Ambas são rascunhos e passam pelo gate 3 como qualquer item.

---

## Fontes

- `openspec/changes/add-watch-brand-connection-guide/` (proposal, design, tasks, spec).
- `knowledge/engineering/levantamento-expansao-relogios-intervals-icu.md`.
- `knowledge/product/strategic-compass.md` (§3–§7, §9), `north-star.md`, `cpo-operating-model.md`.
- `knowledge/engineering/integrations.md`; `knowledge/marketing/runy-concorrente.md`.
- `openspec/SPRINTS.md` — Trilha intervals.icu; `menthoros-brain/90-Sprints/Mid-Sprint Pulse - 2026-10.md`.
- Changes arquivadas `add-waitlist-other-brand-email` (2026-10-11) e `add-waitlist-funnel-endpoint` (2026-10-09).
