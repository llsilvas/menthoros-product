**Tamanho:** S · **Trilha:** Fast

## Why

O dashboard do coach exibe carga semanal (volume) e monotonia, mas não combina esses dois indicadores
num único sinal de qualidade de treino. Um atleta pode acumular alto volume com distribuição
homogênea (alto TSS + alta monotonia) e estar no limite do sobretreinamento — mas hoje isso não
aparece em lugar nenhum na interface.

**Training Strain** = `TSS_semanal × monotonia` é a métrica que une os dois:

- TSS semanal = Σ(TSS dos últimos 7 dias do histórico PMC)
- Monotonia = `mean(TSS 7d) / stddev(TSS 7d)` (já calculado em `fix-coach-inbox-metrics`)

Strain baixo e monotonia baixa = treino variado, risco controlado.
Strain alto e monotonia alta = treino homogêneo demais → sobretreinamento, lesão ou estagnação.

O coach precisa desse número para diferenciar um atleta que treinou muito de forma saudável
(alto strain, baixa monotonia) de um que treinou muito de forma perigosa (alto strain, alta monotonia).

## What Changes

**Somente `apps/menthoros-front`.**

### Nova métrica no adapter

- `calcularStrain(pmcPoints)`: `TSS_semanal × calcularMonotonia(pmcPoints)`
- Depende de `calcularMonotonia` (já exportada em `fix-coach-inbox-metrics`)
- Fallback: `null` quando menos de 3 pontos de TSS disponíveis

### Tipo

- Adicionar `strain: number | null` em `quickStats` de `CoachAthleteRow`

### UI

- Novo `MetricTile` "Strain" com classificação e tooltip explicativo:

| Strain | Classificação | Cor |
|--------|--------------|-----|
| `< 150` | Baixo | cinza |
| `150–300` | Moderado | verde |
| `300–600` | Alto | amarelo |
| `> 600` | Crítico | vermelho |

*(Thresholds ajustados para corredores recreativos com CTL típico de 40–80 TSS/dia.)*

### Testes

- `calcularStrain`: casos com TSS variado, menos de 3 pontos, monotonia=1.0

## Capabilities

### Modified Capabilities

- `coach-inbox`: novo indicador de qualidade de ciclo de treino na visão por atleta.

## Impact

**Banco:** nenhuma alteração.
**API:** nenhuma alteração. Usa `tss` e `ctl` já presentes em `PmcPontoDto`.
**Repositórios:** somente `apps/menthoros-front`.
**Risco:** baixo — campo novo, não afeta campos existentes.

## Critérios de aceite

- **CA-01:** Dado atleta com 7 dias de TSS `[80, 70, 90, 60, 100, 75, 85]` e monotonia ≈ 9.8, o strain exibido é `TSS_semanal × 9.8`.
- **CA-02:** Dado atleta com menos de 3 pontos de TSS, o tile exibe "—" sem erro.
- **CA-03:** Strain ≤ 150 exibe classificação "Baixo" (cinza); > 600 exibe "Crítico" (vermelho).
- **CA-04:** `npm run lint && npm run build && npm run test:run` passa.

## Dependência

Requer `feature/fix-coach-inbox-metrics` mergeada em `develop` antes de iniciar — usa
`calcularMonotonia` exportada por essa change.

## Métrica de sucesso

Ao abrir atleta com ≥ 7 dias de histórico PMC, o tile Strain exibe valor numérico diferente de "—"
para pelo menos 80% dos atletas com atividade na semana.
