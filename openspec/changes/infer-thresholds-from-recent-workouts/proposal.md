# Proposal: infer-thresholds-from-recent-workouts

**Tamanho:** S · **Trilha:** Full
**Status:** Proposed
**Sprint:** 9h (após `coach-edit-planned-workout`)
**Repos:** menthoros-backend + menthoros-front

---

## Problema

O coach gera planos semanais para atletas cujos dados fisiológicos de limiar (`fcLimiar`, `paceLimiar`) estão desatualizados — em geral, os atletas não fazem testes formais com frequência. O sistema já detecta essa situação (`dataUltimoTesteFc`, `dataUltimoTestePace`) e emite um aviso ao LLM, mas continua usando os valores antigos como base para calcular as zonas de FC e pace.

**Impacto no coach:**
- Planos prescrevem intensidades baseadas no que o atleta era 3–6 meses atrás.
- Se o atleta melhorou, as prescrições ficam suaves demais — estímulo insuficiente.
- Se o atleta regrediu (lesão, pausa), ficam agressivas demais — risco de sobrecarga.
- O coach precisa revisar e ajustar manualmente plano por plano para compensar o dado desatualizado.

## Solução

Quando `fcLimiar` ou `paceLimiar` estiver desatualizado (> 90 dias sem teste) ou ausente, inferir o valor atual a partir dos treinos dos últimos 30 dias e injetá-lo como um Constraint de limiar no prompt de geração de plano.

**Algoritmo de inferência:**
- **FC limiar estimado:** mediana dos 20% maiores valores de `fcMedia` em treinos com duração > 20min dos últimos 30 dias. O quintil superior captura os esforços próximos ao limiar, excluindo recuperações e dias fáceis.
- **Pace limiar estimado:** mediana dos 20% paces mais rápidos (menores em segundos) em treinos contínuos (CONTINUO, LONGO, TEMPO_RUN, FARTLEK) com duração > 20min dos últimos 30 dias. O quintil superior aproxima o pace de corrida de limiar sem exigir tiro ou prova.

**Transparência para o coach:**
- Os valores inferidos são injetados como Constraints explícitos no prompt, com indicação de fonte e confiança.
- O response da geração de plano inclui um campo `limiareisInferidos` com os valores estimados, nível de confiança e número de amostras.
- A `CoachPlanReviewPage` exibe um banner de contexto quando `limiareisInferidos` está presente: "Limiares estimados por inferência — recomende um teste formal." O coach sabe com qual calibração o plano foi gerado antes de aprovar.
- Nunca sobrescrevem os valores no banco — o `Atleta.fcLimiar` e `Atleta.paceLimiar` permanecem inalterados até o coach registrar um novo teste.
- O coach mantém controle total: um novo teste formal substitui a inferência imediatamente.

## Visão do Coach

O coach abre a geração de plano para um atleta que não faz teste de limiar há 4 meses. Em vez de receber um plano baseado em dados de março, o sistema:

1. Detecta automaticamente que os limiares estão defasados.
2. Analisa os 30 dias de treinos recentes do atleta.
3. Injeta um Constraint: `FC limiar estimado: 163 bpm (15 treinos, 30d, confiança ALTA)`.
4. Gera um plano com zonas calibradas para o atleta de hoje.
5. O coach abre a revisão do plano e vê um banner: "Limiar de FC estimado por inferência: 163 bpm (ALTA). Recomende teste formal ao atleta."

O coach decide com contexto completo: confia na estimativa e aprova, ou solicita um teste antes de prescrever. Quando quiser precisão absoluta, registra o novo valor de teste e o plano futuro usa dados oficiais.

## Critérios de Aceitação

**CA1 — Inferência de FC limiar:**
Dado um atleta com `dataUltimoTesteFc` há mais de 90 dias E pelo menos 3 treinos com `fcMedia` nos últimos 30 dias,
quando o coach gera um plano,
então o prompt contém um Constraint `[LIMIAR_FC_ESTIMADO]` com o valor inferido e o nível de confiança.

**CA2 — Inferência de pace limiar:**
Dado um atleta com `dataUltimoTestePace` há mais de 90 dias E pelo menos 3 treinos do tipo CONTINUO/LONGO/TEMPO_RUN/FARTLEK com `paceMedia` válido nos últimos 30 dias,
quando o coach gera um plano,
então o prompt contém um Constraint `[LIMIAR_PACE_ESTIMADO]` com o valor inferido e o nível de confiança.

**CA3 — Fallback por amostra insuficiente:**
Dado um atleta com menos de 3 treinos válidos nos últimos 30 dias para inferência de FC ou pace,
quando o coach gera um plano,
então nenhum Constraint de limiar estimado é injetado e o comportamento atual (aviso de limiar desatualizado) é mantido.

**CA4 — Não interferência quando limiar está atual:**
Dado um atleta com teste de limiar nos últimos 90 dias,
quando o coach gera um plano,
então nenhuma inferência é executada e os valores oficiais continuam sendo usados sem alteração.

**CA5 — Não persistência:**
O processo de inferência não altera `Atleta.fcLimiar`, `Atleta.paceLimiar`, `dataUltimoTesteFc` nem `dataUltimoTestePace` no banco de dados.

**CA6 — Confiança proporcional à amostra:**
O Constraint injetado indica o nível de confiança com base no tamanho da amostra:
- ALTA: ≥ 10 treinos válidos no período.
- MEDIA: 5–9 treinos.
- BAIXA: 3–4 treinos.

**CA7 — Visibilidade na UI de revisão:**
Dado um plano gerado com inferência de limiar (FC ou pace),
quando o coach abre a `CoachPlanReviewPage` para esse plano,
então um banner de contexto é exibido listando os limiares inferidos com valor, confiança e recomendação de teste formal.

**CA8 — Ausência de banner quando limiares estão atuais:**
Dado um plano gerado sem inferência (limiares dentro de 90 dias),
quando o coach abre a `CoachPlanReviewPage`,
então nenhum banner de inferência é exibido.

## Não Faz Parte Desta Change

- Persistência do limiar estimado na entidade `Atleta` (seria auto-calibração com aprovação do coach) ou em `PlanoSemanal` — os valores estimados vivem em `PlanoMetaDados` e não migram para o perfil oficial do atleta.
- Recalibração automática de `Atleta.fcLimiar`/`paceLimiar` a partir da inferência (exigiria aprovação explícita do coach — feature separada).
- Suporte a modalidades além de corrida (ciclismo, natação) — fica para quando o produto expandir.
- Cálculo de `fcLimiar` a partir de `fcMaxima` estimada (já existe como fallback atual).
- Integração com `add-zone-confidence-management` (pós-MVP) — essa change futura vai tratar confiança de zonas em escopo mais amplo; a transparência aqui é mínima e local à `CoachPlanReviewPage`.

## Riscos e Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Atleta com histórico predominantemente de treinos fáceis (Z1-Z2) → quintil superior também é fácil → limiar subestimado | Plano levemente subestimado | Confiança BAIXA sinaliza ao LLM que o valor é menos confiável; o coach revisará o plano |
| Atleta com picos irregulares de FC (ex: equipamento com leitura ruidosa) → quintil superior inclui outliers | Limiar superestimado | A mediana (não a média nem o máximo) é robusta a outliers isolados |
| Janela de 30 dias sem treinos válidos do tipo que o atleta faz | Nenhuma estimativa → sem Constraint injetado | CA3 garante fallback para comportamento atual |
| Bug no cálculo injeta limiar errado → zonas geradas pelo LLM erradas | Plano com intensidade errada | Coach revisa o plano antes de aprovar (fluxo AGUARDANDO_REVISAO preservado) |

## Métricas de Sucesso

- **Baseline (pré-change):** % de planos gerados onde `dataUltimoTesteFc > 90d` e sem Constraint de limiar estimado.
- **Pós-change:** % de planos com Constraint de limiar estimado injetado quando aplicável ≥ 70% (pressupõe que 70% dos atletas com teste desatualizado têm histórico suficiente de treinos).

## Open Questions & Assumptions

Todas fechadas antes da especificação:
- **Q: Quintil superior ou percentil específico?** → Quintil superior (top 20%) é standard na literatura de inferência de LTHR a partir de dados de GPS/HR. Fechado.
- **Q: Mínimo de 20 minutos de duração — `TreinoRealizado` tem campo de duração?** → `TreinoRealizado` herda `TreinoBase.duracaoMin` (Duration). Confirmado durante exploração técnica.
- **Q: A inferência de pace deve incluir INTERVALADO e TIRO?** → Não. Esses tipos têm paces muito rápidos que não representam o limiar aeróbico — incluí-los inflacionaria a estimativa.
