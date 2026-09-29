import type { FormVariant } from './AthleteForm';
import type { FaixaTsbStatus } from '../../../types/FaixaTsb';
import type { CoachAtletaStatus } from '../../../types/Coach';

export type DecisionState = 'PENDING' | 'APPROVED' | 'REJECTED';
export type SegmentFilter = 'all' | 'attention' | 'drop' | 'stable' | 'growth';
export type PlanStatus = 'ATRASADO' | 'NO_PRAZO' | 'CONCLUIDO';
export type TrainingType = 'Corrida' | 'Força' | 'Mobilidade' | 'Descanso';

export interface RaceItem {
  date: string;
  label: string;
  tag: 'ALVO' | 'PRINCIPAL' | 'SECUNDÁRIA';
}

/**
 * Período sem nenhum treino registrado (TSS > 0) longo o bastante para não ser descanso.
 * Não afirma a causa: pode ser pausa real ou falha de sincronização.
 */
export interface DataGap {
  /** Primeiro dia sem registro (ISO yyyy-MM-dd). */
  start: string;
  /** Último dia sem registro (ISO yyyy-MM-dd); em lacuna aberta, é hoje. */
  end: string;
  days: number;
  /** `true` quando a lacuna vai até hoje (atleta ainda sem registrar). */
  open: boolean;
}

/** Uma semana (seg–dom) do gráfico "Adesão e carga por semana". */
export interface WeeklyDiagnosisPoint {
  /** Segunda-feira da semana (ISO yyyy-MM-dd) — mesma chave de `aderenciaSemanal.semanaInicio`. */
  weekStart: string;
  /** Rótulo curto dd/MM. */
  label: string;
  /** Σ TSS da semana; `null` quando a semana está numa lacuna ou antes do histórico. */
  tss: number | null;
  /** Dias com TSS > 0 na semana; `null` junto de `tss`. */
  sessions: number | null;
  planned: number | null;
  completed: number | null;
  /** % da semana vindo do backend; `null` quando a semana não tem plano. */
  adherence: number | null;
  /** Semana inteira dentro de uma lacuna de registro. */
  noData: boolean;
  current: boolean;
}

/** Aderência consolidada da janela (Σ realizado ÷ Σ planejado) — a MESMA base das barras. */
export interface AdherenceWindow {
  percent: number;
  completed: number;
  planned: number;
  /** Semanas com plano dentro da janela. */
  weeks: number;
}

export interface AcwrConfidence {
  level: 'ALTA' | 'BAIXA';
  reason: string | null;
}

export interface CoachAthleteRow {
  id: string;
  name: string;
  discipline: string;
  age: number;
  nivelExperiencia: string | null;
  gender: string;
  weeksOnPlan: number;
  segment: SegmentFilter;
  planStatus: PlanStatus;
  trainingType: TrainingType;
  /**
   * Status do atleta, cru. O `statusLabel` é a versão exibível dele; a COR do chip precisa vir da
   * mesma fonte, senão rótulo e cor divergem — foi o que aconteceu quando a cor vinha da decisão
   * do plano.
   */
  status: CoachAtletaStatus;
  statusLabel: string;
  decision: DecisionState;
  adherence: number;
  /** Janela de 4 semanas que sustenta `adherence`; `null` sem perfil ou sem plano na janela. */
  adherenceWindow: AdherenceWindow | null;
  load7d: number;
  /**
   * Variação % de TSS: últimos 7 dias vs. 7 dias anteriores. `null` sem base de comparação.
   * Antes era variação de CTL (condicionamento) exibida como carga — ver fix-coach-diagnosis-charts.
   */
  loadDelta: number | null;
  delay: number;
  nextWorkout: {
    title: string;
    when: string;
    zone: string;
    duration: string;
    distance: string;
    objective: string;
  };
  raceCalendar: RaceItem[];
  /** @deprecated Série de CTL, não de carga. Sem uso no Diagnóstico; remover no follow-up. */
  loadTrend: number[];
  /** @deprecated Perde a data da semana. Use `weeklyDiagnosis`. */
  adherenceTrend: number[];
  /** Últimas 12 semanas, da mais antiga para a atual. Vazio sem perfil. */
  weeklyDiagnosis: WeeklyDiagnosisPoint[];
  /** Lacunas de registro detectadas na série PMC. */
  dataGaps: DataGap[];
  notes: string;
  suggestedActions: string[];
  quickStats: {
    /**
     * `false` quando não há série PMC na janela: as métricas abaixo são preenchidas com fallbacks
     * (0 km, monotonia 1.00) que a UI **não pode** exibir como medição — sem esta flag, um atleta
     * que nunca sincronizou aparece com carga "adequada".
     */
    hasWindowData: boolean;
    acuteLoad: number;
    monotony: number;
    tsb: number | null;
    /** Faixa de forma resolvida pelo backend (FaixaTsb); null quando sem TSB. */
    statusForma: FaixaTsbStatus | null;
    acwr: number | null;
    /** Base crônica suficiente para ler o ACWR; `null` quando não avaliada (linha de roster). */
    acwrConfidence: AcwrConfidence | null;
    /** Training Strain = TSS_semanal × monotonia — qualidade do ciclo de treino. */
    strain: number | null;
    /** % de aderência da semana mais recente — NÃO é recuperação fisiológica (TSB). Ver follow-up de semântica. */
    recovery: number;
  };
  /** Forma prevista no dia da próxima prova (taper puro). null quando sem prova futura ou sem PMC. */
  racePrediction: {
    diasAteProva: number;
    tsbPrevisto: number;
    formaPrevista: FormVariant;
  } | null;
}
