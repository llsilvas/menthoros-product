import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek, subDays } from 'date-fns';
import { buildAderenciaResumo } from '../../athlete/adapters/aderenciaAdapter';
import type { AderenciasSemanalDto, PmcPontoRaw } from '../../../types/AtletaPerfilCoach';
import type { MetricTone } from '../types/AthleteForm';
import type { AcwrConfidence, AdherenceWindow, DataGap, WeeklyDiagnosisPoint } from '../types/CoachInbox';

/** Dias seguidos sem TSS a partir dos quais a série é lacuna de registro, não descanso. */
export const GAP_MIN_DAYS = 10;
/** Base mínima para ler o ACWR (janela crônica clássica). */
export const ACWR_BASE_DAYS = 28;
/** Semanas exibidas no gráfico "Adesão e carga por semana". */
export const DIAGNOSIS_WEEKS = 12;

const WEEK = { weekStartsOn: 1 } as const;
const toIso = (d: Date): string => format(d, 'yyyy-MM-dd');
const toLabel = (d: Date): string => format(d, 'dd/MM');

function activeDays(pmc: PmcPontoRaw[]): Date[] {
  return pmc
    .filter((p) => (p.tss ?? 0) > 0)
    .map((p) => parseISO(p.data))
    .sort((a, b) => a.getTime() - b.getTime());
}

function firstDay(pmc: PmcPontoRaw[]): Date | null {
  if (pmc.length === 0) return null;
  return pmc.map((p) => parseISO(p.data)).reduce((min, d) => (d < min ? d : min));
}

/**
 * Lacunas de registro: ≥ `minDays` dias sem TSS > 0 entre dois treinos, ou do último treino até
 * hoje (`open`). Dias antes do primeiro treino são início de histórico, não lacuna. Aceita série
 * densa (dias com tss=0) e esparsa (dias omitidos).
 */
export function detectDataGaps(pmc: PmcPontoRaw[], hoje: Date, minDays = GAP_MIN_DAYS): DataGap[] {
  const ativos = activeDays(pmc);
  if (ativos.length === 0) return [];

  const gaps: DataGap[] = [];
  for (let i = 1; i < ativos.length; i += 1) {
    const dias = differenceInCalendarDays(ativos[i], ativos[i - 1]) - 1;
    if (dias >= minDays) {
      gaps.push({ start: toIso(addDays(ativos[i - 1], 1)), end: toIso(subDays(ativos[i], 1)), days: dias, open: false });
    }
  }

  const ultimo = ativos[ativos.length - 1];
  const diasAberto = differenceInCalendarDays(hoje, ultimo);
  if (diasAberto >= minDays) {
    gaps.push({ start: toIso(addDays(ultimo, 1)), end: toIso(hoje), days: diasAberto, open: true });
  }
  return gaps;
}

/**
 * Semanas (seg–dom) das últimas `weeks` semanas, da mais antiga para a atual, com carga (Σ TSS)
 * e adesão da mesma semana. Uma semana inteira dentro de uma lacuna não tem carga (`noData`).
 */
export function buildWeeklyDiagnosis(
  pmc: PmcPontoRaw[],
  aderencia: AderenciasSemanalDto[],
  gaps: DataGap[],
  hoje: Date,
  weeks = DIAGNOSIS_WEEKS,
): WeeklyDiagnosisPoint[] {
  const inicioHistorico = firstDay(pmc);
  if (inicioHistorico == null && aderencia.length === 0) return [];

  const cargaPorSemana = new Map<string, { tss: number; sessions: number }>();
  for (const p of pmc) {
    const chave = toIso(startOfWeek(parseISO(p.data), WEEK));
    const acc = cargaPorSemana.get(chave) ?? { tss: 0, sessions: 0 };
    const tss = Math.max(0, p.tss ?? 0);
    acc.tss += tss;
    if (tss > 0) acc.sessions += 1;
    cargaPorSemana.set(chave, acc);
  }
  const aderenciaPorSemana = new Map(aderencia.map((a) => [toIso(startOfWeek(parseISO(a.semanaInicio), WEEK)), a]));
  const lacunas = gaps.map((g) => ({ start: parseISO(g.start), end: parseISO(g.end) }));
  const semanaAtual = startOfWeek(hoje, WEEK);

  return Array.from({ length: weeks }, (_, i) => {
    const inicio = subDays(semanaAtual, 7 * (weeks - 1 - i));
    const fim = addDays(inicio, 6);
    const fimEfetivo = fim > hoje ? hoje : fim;
    const chave = toIso(inicio);

    const noData = lacunas.some((g) => g.start <= inicio && g.end >= fimEfetivo);
    const antesDoHistorico = inicioHistorico == null || fim < inicioHistorico;
    const carga = cargaPorSemana.get(chave);
    const semCarga = noData || antesDoHistorico;
    const plano = aderenciaPorSemana.get(chave);

    return {
      weekStart: chave,
      label: toLabel(inicio),
      tss: semCarga ? null : Math.round(carga?.tss ?? 0),
      sessions: semCarga ? null : carga?.sessions ?? 0,
      planned: plano?.totalPlanejado ?? null,
      completed: plano?.totalRealizado ?? null,
      adherence: plano ? Math.round(plano.percentual) : null,
      noData,
      current: i === weeks - 1,
    };
  });
}

/**
 * Aderência das últimas `weeks` semanas civis: Σ realizado ÷ Σ planejado das entradas de
 * `aderenciaSemanal` na janela — as mesmas que o gráfico exibe. `null` sem plano na janela.
 */
export function buildAdherenceWindow(aderencia: AderenciasSemanalDto[], hoje: Date, weeks = 4): AdherenceWindow | null {
  const inicioJanela = subDays(startOfWeek(hoje, WEEK), 7 * (weeks - 1));
  const naJanela = aderencia.filter((a) => startOfWeek(parseISO(a.semanaInicio), WEEK) >= inicioJanela);
  const resumo = buildAderenciaResumo(naJanela);
  if (!resumo || resumo.totalPlanejado <= 0) return null;
  return {
    percent: Math.round((resumo.totalRealizado / resumo.totalPlanejado) * 100),
    completed: resumo.totalRealizado,
    planned: resumo.totalPlanejado,
    weeks: naJanela.length,
  };
}

/** Variação % de TSS: últimos 7 dias vs. 7 anteriores, por data. `null` sem base anterior. */
export function calculateLoadDelta7d(pmc: PmcPontoRaw[], hoje: Date): number | null {
  let atual = 0;
  let anterior = 0;
  for (const p of pmc) {
    const d = differenceInCalendarDays(hoje, parseISO(p.data));
    const tss = Math.max(0, p.tss ?? 0);
    if (d >= 0 && d < 7) atual += tss;
    else if (d >= 7 && d < 14) anterior += tss;
  }
  if (anterior <= 0) return null;
  return parseFloat((((atual - anterior) / anterior) * 100).toFixed(1));
}

/**
 * O ACWR (ATL/CTL) só se sustenta com base crônica. Com histórico curto ou lacuna recente, CTL
 * está artificialmente baixo e qualquer retorno vira "Risco".
 */
export function assessAcwrConfidence(pmc: PmcPontoRaw[], gaps: DataGap[], hoje: Date): AcwrConfidence {
  const inicio = firstDay(pmc);
  if (inicio == null) return { level: 'BAIXA', reason: 'Sem histórico de treinos' };
  if (differenceInCalendarDays(hoje, inicio) < ACWR_BASE_DAYS) {
    return { level: 'BAIXA', reason: `Histórico com menos de ${ACWR_BASE_DAYS} dias` };
  }
  const inicioBase = subDays(hoje, ACWR_BASE_DAYS - 1);
  const recente = gaps.find((g) => parseISO(g.end) >= inicioBase);
  if (recente) {
    return { level: 'BAIXA', reason: `Base crônica incompleta: ${recente.days} dias sem treinos registrados` };
  }
  return { level: 'ALTA', reason: null };
}

/** Tom da aderência — o mesmo para a célula de KPI e para as barras. Escala da Proposta. */
export function adherenceTone(percent: number): MetricTone {
  if (percent >= 90) return 'success';
  if (percent >= 70) return 'neutral';
  if (percent >= 40) return 'warning';
  return 'danger';
}

export function formatGapCaption(gap: DataGap): string {
  const inicio = toLabel(parseISO(gap.start));
  if (gap.open) return `Sem treinos registrados desde ${inicio} (${gap.days} dias)`;
  return `Sem treinos registrados de ${inicio} a ${toLabel(parseISO(gap.end))} (${gap.days} dias)`;
}
