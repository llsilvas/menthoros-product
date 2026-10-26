# revalidar-fatores-pace-zonas — os fatores de pace por zona contra a literatura

**Tamanho:** S · **Trilha:** Full (muda prescrição da IA → eval gate + validação com treinador)
**Status:** proposta
**Criado:** 2026-10-26
**Repos afetados:** `apps/menthoros-backend` (e `menthoros-product/openspec/specs/fc-limiar-zones`)

> Desdobrada de `coach-zonas-pace-fc-prescricao` (Q2). Aquela só torna as faixas contíguas; esta
> decide se os números estão certos. Pode rodar em paralelo — a tabela de zonas exposta ao treinador
> vai mostrar o que quer que esteja em `ZonaTreinoService`.

## Why

As zonas de **FC** têm fonte documentada (Friel, %LTHR, Javadoc de `ZonaTreinoService`). As de
**pace** não: os fatores `{1.15,1.25},{1.05,1.15},{0.98,1.05},{0.95,1.00},{0.90,0.97},{0.82,0.90}`
sobre `paceLimiar` estão no código sem citação, e nenhuma spec os justifica.

Comparação para `paceLimiar = 5:00/km` (atleta de ~50 min nos 10 km). Valores de Friel e Daniels
**de memória — task 0.1 confirma nas fontes antes de qualquer mudança**:

| Zona | Menthoros hoje | Friel (pace de corrida, % do limiar) | Daniels (VDOT) |
|---|---|---|---|
| Z1 Recuperação | 5:45–6:15 | > 6:27 | E ≈ 6:00–6:30 |
| Z2 Aeróbico | 5:15–5:45 | 5:42–6:27 | E/M ≈ 5:20–6:00 |
| Z3 Tempo | 4:54–5:15 | 5:18–5:39 | M ≈ 5:18 |
| Z4 Limiar | 4:45–5:00 | 4:57–5:15 | T = 5:00 |
| Z5 VO₂máx | 4:30–4:51 | 4:51–5:00 / 4:30–4:48 | I ≈ 4:40 |
| Z6 Sprint | 4:06–4:30 | < 4:30 | R ≈ 4:25 |

O lado rápido (Z4–Z6) bate razoavelmente. **Z1–Z2 saem 20 a 40 s/km mais rápidos** que as duas
referências: o que o Menthoros chama de "recuperação" é zona de base para Friel e Daniels. Como a
IA recebe essas faixas no prompt e é instruída a usá-las exatamente, toda rodagem leve e longão
gerados herdam o viés. Cada treino isolado parece certo; o acúmulo é fadiga que ninguém atribui a
nada.

Isso é **metodologia**, não bug — por isso não entrou na change de exibição. Mudar os fatores muda a
prescrição de todos os atletas e precisa de eval e de um treinador olhando.

## What Changes

1. Confirmar nas fontes as tabelas de Friel (pace de corrida) e Daniels (E/M/T/I/R vs. T) e
   registrar a comparação em `design.md`.
2. Decidir o modelo de pace: **Friel** (coerente com a FC, que já é Friel; recomendação inicial),
   Daniels, ou manter os atuais com fonte declarada.
3. Ajustar `ZonaTreinoService.PACE_FATORES` e o Javadoc com a citação; manter a contiguidade
   (`paceMin(Zn) == paceMax(Zn+1)`) estabelecida pela change irmã.
4. Rodar o eval em modo candidato e validar com um treinador antes de mergear.
5. Atualizar a spec `fc-limiar-zones` com os fatores e a fonte.

## Capabilities

- **Modificada:** `fc-limiar-zones` — fatores de pace com fonte.

## Impact

- **Prompt da IA** muda (faixas de pace listadas) → eval gate obrigatório.
- **Prescrições existentes** não mudam (planos gravados têm pace absoluto); só planos novos.
- **`PaceZoneCalculator`** (ajuste por fadiga) e **`ZoneResolver`** (push) consomem os mesmos fatores
  — mudam junto, sem código novo.
- Sem migration, sem mudança de contrato.

## Critérios de aceite

- **CA1** — `design.md` traz as tabelas de Friel e Daniels **com a referência bibliográfica** (edição
  e página/capítulo), e a comparação com os fatores atuais para três limiares (4:00, 5:00, 6:30).
- **CA2** — Given a decisão registrada, Then `PACE_FATORES` reflete o modelo escolhido, o Javadoc cita
  a fonte, e `ZonaTreinoServiceTest` fixa os valores absolutos para limiar 5:00.
- **CA3** — Contiguidade preservada: `paceMin(Zn) == paceMax(Zn+1)` para n = 1..5.
- **CA4** — Tabela do eval em modo candidato no PR; grader determinístico não regride; a comparação
  auditoria × candidato mostra a mudança esperada nas rodagens leves (pace mais lento) e nada fora
  disso.
- **CA5** — Um treinador revisou pelo menos um plano gerado com as faixas novas e aprovou a
  intensidade das rodagens leves (registrar quem e quando no `tasks.md`).

## Métrica de sucesso

Rodagens leves (`REGENERATIVO`, `FACIL`, `LONGO`) geradas pela IA passam a sair com pace dentro da
faixa que Friel/Daniels chamam de fácil para o limiar do atleta — hoje saem 20–40 s/km mais rápidas.
Acompanhar: taxa de edição do pace pelo treinador nesses tipos (deve cair) e RPE realizado médio em
rodagem leve (deve cair para ≤ 4).

## Open Questions & Assumptions

- **Friel ou Daniels?** Friel mantém um só modelo (FC já é Friel) e mapeia direto em 5–6 zonas.
  Daniels é mais usado por treinadores de corrida no Brasil, mas tem 5 paces (E/M/T/I/R) que não
  casam 1:1 com Z1–Z6. Recomendação inicial: Friel; decidir após 0.1.
- **Z6 existe só no Menthoros.** Friel tem Z5c, Daniels tem R. Confirmar o que mapeia.
- **Premissa:** os valores de memória na tabela acima podem estar errados em alguns segundos; nada
  no código muda antes da confirmação (CA1).

## Fora de escopo

- Exibir as zonas ao treinador — `coach-zonas-pace-fc-prescricao`.
- Zonas de FC (já documentadas).
- Zonas por potência ou por VDOT calculado de prova (outra discussão).
