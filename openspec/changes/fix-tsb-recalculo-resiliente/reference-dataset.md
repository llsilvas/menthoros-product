# Reference Dataset — fix-tsb-recalculo-resiliente (CA5)

> Dataset de 90 dias com valores esperados calculados manualmente (EWMA, round-half-up).
> Usado como gabarito para o teste de equivalência antes/depois do chunking.
> **NÃO** usar outputs da aplicação como gabarito — os valores foram calculados com
> as fórmulas extraídas do código (`TsbServiceImpl:197-201`, `:219`, `:127`).

## Constantes

| Parâmetro | AVANÇADO | INICIANTE |
|---|---|---|
| τ_ctl | 42 | 30 |
| τ_atl | 7 | 5 |
| e^(-1/τ_ctl) | 0.9764716867 | 0.9672161115 |
| e^(-1/τ_atl) | 0.8668778998 | 0.8187307531 |
| 1 - e^(-1/τ_ctl) | 0.0235283133 | 0.0327838885 |
| 1 - e^(-1/τ_atl) | 0.1331221002 | 0.1812692469 |

## Fórmulas

```
CTL_hoje = TSS × (1 - e^(-1/τ_ctl)) + CTL_ontem × e^(-1/τ_ctl)
ATL_hoje = TSS × (1 - e^(-1/τ_atl)) + ATL_ontem × e^(-1/τ_atl)
TSB_hoje = CTL_hoje - ATL_hoje
round(v, 2) = Math.round(v × 100) / 100
```

## Estrutura do período (90 dias, 10 fases)

| Fase | Dias | Descrição |
|---|---|---|
| 1 | 1-14 | Construção da base aeróbica (TSS 35-60) |
| 2 | 15-30 | Progressão de carga (TSS 60-95) |
| 3 | 31-37 | Bloco de pico (TSS 90-130) |
| 4 | 38-44 | Semana de recuperação (TSS 0-50) |
| 5 | 45-60 | Construção 2 (TSS 70-115) |
| 6 | 61-70 | Pico 2 + spike TSS 180 no dia 65 |
| 7 | 71-77 | Taper (TSS 0-80) |
| 8 | 78 | Dia de evento (TSS 200) |
| 9 | 79-84 | Recuperação ativa (TSS 0-30) |
| 10 | 85-90 | Retorno gradual (TSS 0-70) |

## Dataset AVANÇADO (τ_ctl=42, τ_atl=7)

| Dia | TSS | CTL | ATL | TSB | Nota |
|---|---:|---:|---:|---:|---|
| 1 | 35 | 0.82 | 4.66 | -3.84 | Início sem histórico |
| 2 | 40 | 1.75 | 9.36 | -7.62 | |
| 3 | 0 | 1.70 | 8.12 | -6.41 | Descanso |
| 4 | 45 | 2.72 | 13.03 | -10.30 | |
| 5 | 50 | 3.84 | 17.95 | -14.11 | |
| 6 | 0 | 3.74 | 15.56 | -11.81 | Descanso |
| 7 | 55 | 4.95 | 20.81 | -15.86 | |
| 8 | 60 | 6.25 | 26.03 | -19.78 | |
| 9 | 0 | 6.10 | 22.56 | -16.46 | Descanso |
| 10 | 45 | 7.01 | 25.55 | -18.53 | |
| 11 | 50 | 8.03 | 28.80 | -20.78 | TSB < -20 |
| 12 | 0 | 7.84 | 24.97 | -17.13 | Descanso |
| 13 | 55 | 8.95 | 28.97 | -20.02 | TSB < -20 |
| 14 | 55 | 9.68 | 30.44 | -20.76 | TSB < -20 |
| 15 | 60 | 10.86 | 34.37 | -23.51 | TSB < -20 |
| 16 | 65 | 12.14 | 38.45 | -26.31 | TSB < -20 |
| 17 | 0 | 11.85 | 33.33 | -21.48 | Descanso, TSB < -20 |
| 18 | 70 | 13.22 | 38.21 | -24.99 | TSB < -20 |
| 19 | 75 | 14.67 | 43.11 | -28.44 | TSB < -20 |
| 20 | 0 | 14.33 | 37.37 | -23.04 | Descanso, TSB < -20 |
| 21 | 80 | 15.87 | 43.05 | -27.17 | TSB < -20 |
| 22 | 70 | 17.14 | 46.63 | -29.49 | TSB < -20 |
| 23 | 0 | 16.74 | 40.43 | -23.68 | Descanso, TSB < -20 |
| 24 | 85 | 18.35 | 46.36 | -28.01 | TSB < -20 |
| 25 | 90 | 20.03 | 52.17 | -32.14 | TSB < -20 |
| 26 | 0 | 19.56 | 45.22 | -25.66 | Descanso, TSB < -20 |
| 27 | 75 | 20.87 | 49.19 | -28.32 | TSB < -20 |
| 28 | 80 | 22.26 | 53.29 | -31.03 | TSB < -20 |
| 29 | 0 | 21.73 | 46.20 | -24.46 | Descanso, TSB < -20 |
| 30 | 95 | 23.46 | 52.69 | -29.23 | 🧱 Fronteira de chunk, TSB < -20 |
| 31 | 100 | 25.26 | 58.99 | -33.73 | 🧱 Fronteira de chunk, TSB < -20 |
| 32 | 110 | 27.25 | 65.78 | -38.53 | TSB < -20 |
| 33 | 0 | 26.61 | 57.02 | -30.41 | Descanso, TSB < -20 |
| 34 | 120 | 28.81 | 65.41 | -36.60 | TSB < -20 |
| 35 | 90 | 30.25 | 68.68 | -38.43 | TSB < -20 |
| 36 | 0 | 29.54 | 59.54 | -30.00 | Descanso, TSB < -20 |
| 37 | 130 | 31.90 | 68.92 | -37.02 | TSB < -20 |
| 38 | 40 | 32.09 | 65.07 | -32.98 | TSB < -20 |
| 39 | 30 | 32.04 | 60.40 | -28.36 | TSB < -20 |
| 40 | 0 | 31.29 | 52.36 | -21.07 | Descanso, TSB < -20 |
| 41 | 20 | 31.02 | 48.05 | -17.03 | |
| 42 | 0 | 30.29 | 41.66 | -11.36 | Descanso |
| 43 | 30 | 30.29 | 40.10 | -9.82 | |
| 44 | 50 | 30.75 | 41.42 | -10.67 | |
| 45 | 70 | 31.67 | 45.23 | -13.55 | |
| 46 | 80 | 32.81 | 49.85 | -17.04 | |
| 47 | 0 | 32.04 | 43.22 | -11.18 | Descanso |
| 48 | 90 | 33.40 | 49.45 | -16.04 | |
| 49 | 100 | 34.97 | 56.18 | -21.21 | TSB < -20 |
| 50 | 0 | 34.15 | 48.70 | -14.55 | Descanso |
| 51 | 110 | 35.93 | 56.86 | -20.93 | TSB < -20 |
| 52 | 85 | 37.09 | 60.60 | -23.52 | TSB < -20 |
| 53 | 0 | 36.21 | 52.54 | -16.32 | Descanso |
| 54 | 95 | 37.60 | 58.19 | -20.59 | TSB < -20 |
| 55 | 105 | 39.18 | 64.42 | -25.24 | TSB < -20 |
| 56 | 0 | 38.26 | 55.85 | -17.59 | Descanso |
| 57 | 100 | 39.71 | 61.72 | -22.01 | TSB < -20 |
| 58 | 90 | 40.90 | 65.49 | -24.59 | TSB < -20 |
| 59 | 0 | 39.93 | 56.77 | -16.84 | Descanso |
| 60 | 115 | 41.70 | 64.52 | -22.82 | 🧱 Fronteira de chunk, TSB < -20 |
| 61 | 120 | 43.54 | 71.91 | -28.36 | 🧱 Fronteira de chunk, TSB < -20 |
| 62 | 130 | 45.58 | 79.64 | -34.06 | TSB < -20 |
| 63 | 0 | 44.50 | 69.04 | -24.53 | Descanso, TSB < -20 |
| 64 | 140 | 46.75 | 78.48 | -31.73 | TSB < -20 |
| 65 | 180 | 49.89 | 92.00 | -42.11 | ⚡ Spike TSS=180, TSB < -20 |
| 66 | 0 | 48.71 | 79.75 | -31.04 | Descanso, TSB < -20 |
| 67 | 100 | 49.92 | 82.45 | -32.53 | TSB < -20 |
| 68 | 110 | 51.33 | 86.12 | -34.78 | TSB < -20 |
| 69 | 0 | 50.12 | 74.65 | -24.53 | Descanso, TSB < -20 |
| 70 | 150 | 52.47 | 84.68 | -32.21 | TSB < -20 |
| 71 | 80 | 53.12 | 84.06 | -30.94 | TSB < -20 |
| 72 | 60 | 53.28 | 80.86 | -27.57 | TSB < -20 |
| 73 | 0 | 52.03 | 70.09 | -18.06 | Descanso |
| 74 | 40 | 51.75 | 66.09 | -14.34 | |
| 75 | 0 | 50.53 | 57.29 | -6.76 | Descanso |
| 76 | 30 | 50.05 | 53.66 | -3.61 | |
| 77 | 0 | 48.87 | 46.51 | 2.36 | TSB positivo |
| 78 | 200 | 52.43 | 66.95 | -14.52 | 🏁 Evento TSS=200 |
| 79 | 0 | 51.19 | 58.03 | -6.84 | Descanso |
| 80 | 0 | 49.99 | 50.31 | -0.32 | Descanso |
| 81 | 20 | 49.28 | 46.27 | 3.01 | TSB positivo |
| 82 | 0 | 48.12 | 40.11 | 8.01 | Descanso, TSB positivo |
| 83 | 30 | 47.70 | 38.77 | 8.93 | TSB positivo |
| 84 | 0 | 46.57 | 33.61 | 12.97 | Descanso, TSB positivo |
| 85 | 40 | 46.42 | 34.46 | 11.96 | TSB positivo |
| 86 | 0 | 45.33 | 29.87 | 15.46 | Descanso, TSB positivo |
| 87 | 50 | 45.44 | 32.55 | 12.89 | TSB positivo |
| 88 | 60 | 45.78 | 36.20 | 9.57 | TSB positivo |
| 89 | 0 | 44.70 | 31.38 | 13.32 | Descanso, TSB positivo |
| 90 | 70 | 45.30 | 36.53 | 8.77 | TSB positivo |

## Dataset INICIANTE (τ_ctl=30, τ_atl=5)

| Dia | TSS | CTL | ATL | TSB |
|---|---:|---:|---:|---:|---|
| 1 | 35 | 1.15 | 6.34 | -5.20 |
| 2 | 40 | 2.42 | 12.45 | -10.02 |
| 3 | 0 | 2.34 | 10.19 | -7.85 |
| 4 | 45 | 3.74 | 16.50 | -12.76 |
| 5 | 50 | 5.26 | 22.57 | -17.32 |
| 6 | 0 | 5.08 | 18.48 | -13.40 |
| 7 | 55 | 6.72 | 25.10 | -18.38 |
| 8 | 60 | 8.47 | 31.43 | -22.96 |
| 9 | 0 | 8.19 | 25.73 | -17.54 |
| 10 | 45 | 9.40 | 29.22 | -19.83 |
| 11 | 50 | 10.73 | 32.99 | -22.26 |
| 12 | 0 | 10.38 | 27.01 | -16.63 |
| 13 | 55 | 11.84 | 32.08 | -20.24 |
| 14 | 40 | 12.76 | 33.52 | -20.76 |
| 15 | 60 | 14.31 | 38.32 | -24.01 |
| 16 | 65 | 15.97 | 43.16 | -27.18 |
| 17 | 0 | 15.45 | 35.33 | -19.88 |
| 18 | 70 | 17.24 | 41.62 | -24.38 |
| 19 | 75 | 19.13 | 47.67 | -28.54 |
| 20 | 0 | 18.50 | 39.03 | -20.52 |
| 21 | 80 | 20.52 | 46.45 | -25.93 |
| 22 | 70 | 22.14 | 50.72 | -28.58 |
| 23 | 0 | 21.42 | 41.53 | -20.11 |
| 24 | 85 | 23.50 | 49.41 | -25.91 |
| 25 | 90 | 25.68 | 56.77 | -31.09 |
| 26 | 0 | 24.84 | 46.48 | -21.64 |
| 27 | 75 | 26.48 | 51.65 | -25.16 |
| 28 | 80 | 28.24 | 56.79 | -28.55 |
| 29 | 0 | 27.31 | 46.49 | -19.18 |
| 30 | 95 | 29.53 | 55.29 | -25.75 |
| 31 | 100 | 31.84 | 63.39 | -31.55 |
| 32 | 110 | 34.40 | 71.84 | -37.44 |
| 33 | 0 | 33.28 | 58.82 | -25.54 |
| 34 | 120 | 36.12 | 69.91 | -33.79 |
| 35 | 90 | 37.89 | 73.55 | -35.66 |
| 36 | 0 | 36.64 | 60.22 | -23.57 |
| 37 | 130 | 39.70 | 72.87 | -33.16 |
| 38 | 40 | 39.71 | 66.91 | -27.20 |
| 39 | 30 | 39.40 | 60.22 | -20.82 |
| 40 | 0 | 38.10 | 49.30 | -11.20 |
| 41 | 20 | 37.51 | 43.99 | -6.48 |
| 42 | 0 | 36.28 | 36.02 | 0.26 |
| 43 | 30 | 36.07 | 34.93 | 1.15 |
| 44 | 50 | 36.53 | 37.66 | -1.13 |
| 45 | 70 | 37.63 | 43.52 | -5.89 |
| 46 | 80 | 39.02 | 50.13 | -11.12 |
| 47 | 0 | 37.74 | 41.05 | -3.31 |
| 48 | 90 | 39.45 | 49.92 | -10.47 |
| 49 | 100 | 41.44 | 59.00 | -17.56 |
| 50 | 0 | 40.08 | 48.30 | -8.23 |
| 51 | 110 | 42.37 | 59.49 | -17.12 |
| 52 | 85 | 43.77 | 64.11 | -20.34 |
| 53 | 0 | 42.33 | 52.49 | -10.16 |
| 54 | 95 | 44.06 | 60.20 | -16.14 |
| 55 | 105 | 46.06 | 68.32 | -22.26 |
| 56 | 0 | 44.55 | 55.93 | -11.39 |
| 57 | 100 | 46.37 | 63.92 | -17.56 |
| 58 | 90 | 47.80 | 68.65 | -20.85 |
| 59 | 0 | 46.23 | 56.20 | -9.98 |
| 60 | 115 | 48.48 | 66.86 | -18.38 |
| 61 | 120 | 50.83 | 76.49 | -25.67 |
| 62 | 130 | 53.42 | 86.19 | -32.77 |
| 63 | 0 | 51.67 | 70.57 | -18.90 |
| 64 | 140 | 54.57 | 83.16 | -28.59 |
| 65 | 180 | 58.68 | 100.71 | -42.03 |
| 66 | 0 | 56.76 | 82.45 | -25.70 |
| 67 | 100 | 58.17 | 85.63 | -27.46 |
| 68 | 110 | 59.87 | 90.05 | -30.18 |
| 69 | 0 | 57.91 | 73.73 | -15.82 |
| 70 | 150 | 60.93 | 87.55 | -26.62 |
| 71 | 80 | 61.55 | 86.18 | -24.63 |
| 72 | 60 | 61.50 | 81.44 | -19.93 |
| 73 | 0 | 59.49 | 66.68 | -7.19 |
| 74 | 40 | 58.85 | 61.84 | -2.99 |
| 75 | 0 | 56.92 | 50.63 | 6.29 |
| 76 | 30 | 56.04 | 46.89 | 9.15 |
| 77 | 0 | 54.20 | 38.39 | 15.81 |
| 78 | 200 | 58.98 | 67.69 | -8.71 |
| 79 | 0 | 57.05 | 55.42 | 1.63 |
| 80 | 0 | 55.18 | 45.37 | 9.80 |
| 81 | 20 | 54.02 | 40.77 | 13.25 |
| 82 | 0 | 52.25 | 33.38 | 18.87 |
| 83 | 30 | 51.52 | 32.77 | 18.75 |
| 84 | 0 | 49.83 | 26.83 | 23.00 |
| 85 | 40 | 49.51 | 29.22 | 20.29 |
| 86 | 0 | 47.89 | 23.92 | 23.97 |
| 87 | 50 | 47.96 | 28.65 | 19.31 |
| 88 | 60 | 48.35 | 34.33 | 14.02 |
| 89 | 0 | 46.77 | 28.11 | 18.66 |
| 90 | 70 | 47.53 | 35.70 | 11.83 |

## Checkpoints para Asserções no Teste

### AVANÇADO (τ_ctl=42, τ_atl=7)

| Dia | CTL | ATL | TSB | Significado |
|---|---:|---:|---:|---|
| 1 | 0.82 | 4.66 | -3.84 | Dia 1 sem histórico |
| 7 | 4.95 | 20.81 | -15.86 | Fim semana 1 |
| 14 | 9.68 | 30.44 | -20.76 | Fim fase base |
| 30 | 23.46 | 52.69 | -29.23 | Fronteira de chunk |
| 31 | 25.26 | 58.99 | -33.73 | Fronteira de chunk |
| 44 | 30.75 | 41.42 | -10.67 | Fim recuperação |
| 60 | 41.70 | 64.52 | -22.82 | Fronteira de chunk |
| 61 | 43.54 | 71.91 | -28.36 | Fronteira de chunk |
| 65 | 49.89 | 92.00 | -42.11 | Dia do spike TSS=180 |
| 70 | 52.47 | 84.68 | -32.21 | Fim pico 2 |
| 77 | 48.87 | 46.51 | 2.36 | TSB positivo (fim taper) |
| 78 | 52.43 | 66.95 | -14.52 | Dia do evento TSS=200 |
| 84 | 46.57 | 33.61 | 12.97 | TSB positivo (recuperado) |
| 90 | 45.30 | 36.53 | 8.77 | Último dia |

### Asserções Java para JUnit

```java
private static final double DELTA = 0.01;

// AVANÇADO (τ_ctl=42, τ_atl=7)
// Use o array TSS_PLAN do dataset para inserir os treinos antes de recalcular

@Test
void ca5DeveProduzirValoresIdenticosAposChunkingAvancado() {
    // ... setup: inserir 90 dias de treinos conforme dataset, atleta AVANÇADO ...
    // ... executar recalcularHistoricoCompleto(atletaId) ...

    assertArrayEquals(new double[]{0.82, 4.66, -3.84},
        obterMetricas(atletaId, dataBase), DELTA, "Dia 1");
    assertArrayEquals(new double[]{4.95, 20.81, -15.86},
        obterMetricas(atletaId, dataBase.plusDays(6)), DELTA, "Dia 7");
    assertArrayEquals(new double[]{23.46, 52.69, -29.23},
        obterMetricas(atletaId, dataBase.plusDays(29)), DELTA, "Dia 30 (fronteira)");
    assertArrayEquals(new double[]{25.26, 58.99, -33.73},
        obterMetricas(atletaId, dataBase.plusDays(30)), DELTA, "Dia 31 (fronteira)");
    assertArrayEquals(new double[]{41.70, 64.52, -22.82},
        obterMetricas(atletaId, dataBase.plusDays(59)), DELTA, "Dia 60 (fronteira)");
    assertArrayEquals(new double[]{43.54, 71.91, -28.36},
        obterMetricas(atletaId, dataBase.plusDays(60)), DELTA, "Dia 61 (fronteira)");
    assertArrayEquals(new double[]{49.89, 92.00, -42.11},
        obterMetricas(atletaId, dataBase.plusDays(64)), DELTA, "Dia 65 (spike)");
    assertArrayEquals(new double[]{48.87, 46.51, 2.36},
        obterMetricas(atletaId, dataBase.plusDays(76)), DELTA, "Dia 77 (TSB+)");
    assertArrayEquals(new double[]{52.43, 66.95, -14.52},
        obterMetricas(atletaId, dataBase.plusDays(77)), DELTA, "Dia 78 (evento)");
    assertArrayEquals(new double[]{45.30, 36.53, 8.77},
        obterMetricas(atletaId, dataBase.plusDays(89)), DELTA, "Dia 90");
}

// INICIANTE (τ_ctl=30, τ_atl=5) — constantes customizadas
@Test
void ca5DeveProduzirValoresIdenticosAposChunkingIniciante() {
    // ... setup: inserir 90 dias de treinos, atleta INICIANTE (τ_ctl=30, τ_atl=5) ...

    assertArrayEquals(new double[]{1.15, 6.34, -5.20},
        obterMetricas(atletaId, dataBase), DELTA, "Dia 1");
    assertArrayEquals(new double[]{29.53, 55.29, -25.75},
        obterMetricas(atletaId, dataBase.plusDays(29)), DELTA, "Dia 30");
    assertArrayEquals(new double[]{48.48, 66.86, -18.38},
        obterMetricas(atletaId, dataBase.plusDays(59)), DELTA, "Dia 60 (fronteira)");
    assertArrayEquals(new double[]{50.83, 76.49, -25.67},
        obterMetricas(atletaId, dataBase.plusDays(60)), DELTA, "Dia 61 (fronteira)");
    assertArrayEquals(new double[]{54.20, 38.39, 15.81},
        obterMetricas(atletaId, dataBase.plusDays(76)), DELTA, "Dia 77 (TSB+)");
    assertArrayEquals(new double[]{47.53, 35.70, 11.83},
        obterMetricas(atletaId, dataBase.plusDays(89)), DELTA, "Dia 90");
}
```

## Invariantes Verificadas

1. **ATL converge mais rápido que CTL:** dia 30 — ATL=52.69, CTL=23.46. ATL ~2.3× mais rápido ✅
2. **TSB mínimo no pico:** -42.11 (dia 65, spike TSS=180) ✅
3. **TSB cruza zero na recuperação:** dia 77, TSB=2.36 (durante taper, após 6 dias de carga reduzida) ✅
4. **Decaimento puro:** dia 38 CTL=32.09 → dia 44 CTL=30.75. Em 7 dias de recuperação, CTL caiu apenas 1.34 pontos (τ=42 é muito lento para decair rápido) ✅
5. **rampRate na fronteira de chunk:** CTL[61] - CTL[54] = 43.54 - 37.60 = 5.94. D-7 cruza a fronteira dia 60→61 corretamente ✅
6. **Idempotência:** recalcular do zero produz os mesmos valores que cálculo incremental ✅ (por construção — usamos a mesma fórmula)

## Fontes

- Coggan, A. (2003). *Training and Racing with a Power Meter*. VeloPress. — τ=42/7, fórmula EWMA (Established)
- Clarke, D.C. & Skiba, P.F. (2013). Rationale and resources for teaching the mathematical modeling of athletic training and performance. *Adv Physiol Educ*, 37(2), 134-152. — modelo matemático (Established)
- Fórmulas extraídas de `TsbServiceImpl.java:197-201` (CTL), `:219` (ATL), `:127` (TSB), commit `f9e754b`, branch `feature/testes-carga-referencia`
