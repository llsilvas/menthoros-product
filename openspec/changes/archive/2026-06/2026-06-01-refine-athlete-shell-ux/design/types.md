# Shared Types — Athlete UI

Tipos TypeScript compartilhados pelos componentes do shell do atleta.
Devem viver em `src/features/athlete/types.ts` (ou equivalente conforme a
estrutura simplificada acordada).

## Domain Types (UI-friendly)

```typescript
/**
 * Tipos de treino aceitos pela UI.
 * Mapeia 1:1 com WorkoutType do backend, mas é tipado no front para
 * garantir exaustividade nos switch/match de gradiente/ícone.
 */
export type WorkoutType =
  | 'easy_run'      // Corrida fácil (Z1-Z2)
  | 'long_run'      // Longão
  | 'tempo'         // Tempo run / threshold
  | 'intervals'     // Intervalado (Z4-Z5)
  | 'fartlek'       // Fartlek
  | 'recovery'      // Recuperação ativa
  | 'rest'          // Descanso
  | 'strength'      // Força
  | 'crosstrain';   // Cross-training (bike, natação)

export type TrainingPhase =
  | 'BASE'
  | 'BUILD'
  | 'ESPECIFICO'
  | 'TAPER';

export type TimeOfDay =
  | 'morning'   // 5h-11h
  | 'afternoon' // 11h-17h
  | 'evening'   // 17h-20h
  | 'night';    // 20h-5h

export type CompletionStatus =
  | 'pending'
  | 'completed'
  | 'skipped'
  | 'modified';
```

## Translation Layer (TSS / CTL / ATL / TSB)

```typescript
/**
 * Camada de tradução entre conceitos técnicos e vernáculo do atleta.
 * Usada por componentes de UI; NÃO impacta cálculos do backend.
 */
export const TECHNICAL_TERMS = {
  TSS: {
    label: 'Carga de treino',
    tooltip: {
      title: 'O que é Carga de treino?',
      body: 'Mede o quanto um treino "custa" para seu corpo, combinando duração e intensidade. Quanto maior, mais exigente.',
      technicalName: 'TSS (Training Stress Score)',
    },
  },
  CTL: {
    label: 'Condicionamento',
    tooltip: {
      title: 'O que é Condicionamento?',
      body: 'Reflete sua média de treino dos últimos 42 dias. Cresce com consistência.',
      technicalName: 'CTL (Chronic Training Load)',
    },
  },
  ATL: {
    label: 'Cansaço',
    tooltip: {
      title: 'O que é Cansaço?',
      body: 'Mede a fadiga acumulada dos últimos 7 dias. Cresce rápido com treinos intensos.',
      technicalName: 'ATL (Acute Training Load)',
    },
  },
  TSB: {
    label: 'Forma',
    tooltip: {
      title: 'O que é Forma?',
      body: 'Indica se você está fresco (forma positiva) ou cansado (forma negativa). Próximo de provas, queremos forma positiva.',
      technicalName: 'TSB (Training Stress Balance)',
    },
  },
  RPE: {
    label: 'Esforço percebido',
    tooltip: {
      title: 'O que é Esforço percebido?',
      body: 'Sua avaliação subjetiva de quão difícil foi o treino, numa escala de 1 a 10.',
      technicalName: 'RPE (Rate of Perceived Exertion)',
    },
  },
} as const;
```

## Gradient Tokens

```typescript
/**
 * Mapeamento determinístico de tipo de treino → token de gradiente.
 * Os tokens reais ficam em design-tokens/gradients.css.
 */
export const WORKOUT_GRADIENTS: Record<WorkoutType, string> = {
  easy_run:   'var(--gradient-easy)',      // verde → teal
  long_run:   'var(--gradient-long)',      // azul → roxo
  tempo:      'var(--gradient-tempo)',     // amarelo → laranja
  intervals:  'var(--gradient-intervals)', // laranja → vermelho
  fartlek:    'var(--gradient-fartlek)',   // verde → amarelo
  recovery:   'var(--gradient-recovery)',  // azul claro → lavanda
  rest:       'var(--gradient-rest)',      // cinza → azul muito claro
  strength:   'var(--gradient-strength)',  // roxo → magenta
  crosstrain: 'var(--gradient-cross)',     // teal → azul
};

/**
 * Ajustes de luminosidade por período do dia, aplicados como overlay.
 */
export const TIME_OF_DAY_OVERLAYS: Record<TimeOfDay, { brightness: number; warmth: number }> = {
  morning:   { brightness: 1.10, warmth: 1.15 },
  afternoon: { brightness: 1.00, warmth: 1.00 },
  evening:   { brightness: 0.95, warmth: 1.10 },
  night:     { brightness: 0.85, warmth: 0.90 },
};
```

## Helper: CTA contextual do home

```typescript
/**
 * Decide qual CTA exibir no /athlete/home conforme contexto.
 * Regra simples e explícita > magia condicional dispersa.
 */
export function decideHomeCTA(ctx: {
  hasWorkoutToday: boolean;
  workoutCompletedToday: boolean;
  hasCheckedInToday: boolean;
  minutesUntilWorkout: number | null;
}): { label: string; action: 'start_workout' | 'mark_done' | 'check_in' | 'view_plan' } {
  if (ctx.hasWorkoutToday && !ctx.workoutCompletedToday && (ctx.minutesUntilWorkout ?? Infinity) <= 60) {
    return { label: 'Iniciar treino', action: 'start_workout' };
  }
  if (ctx.hasWorkoutToday && ctx.workoutCompletedToday) {
    return { label: 'Como foi seu treino?', action: 'mark_done' };
  }
  if (!ctx.hasCheckedInToday) {
    return { label: 'Como me sinto hoje?', action: 'check_in' };
  }
  return { label: 'Ver meu plano', action: 'view_plan' };
}
```
