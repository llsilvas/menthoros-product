import { addDays, differenceInCalendarDays, format, subDays } from 'date-fns';
import type { FaixaTsbStatus } from '../../../types/FaixaTsb';

export type PMCRange = '4w' | '8w' | '12w' | '6m' | '1y';

export interface PMCDataPoint {
  date: Date;
  tss: number;
  ctl: number;
  atl: number;
  tsb: number;
  /** Faixa resolvida pelo backend para o dia; ausente quando sem TSB. */
  statusForma?: FaixaTsbStatus;
}

/** Período sem treinos registrados (inclusivo nas duas pontas). */
export interface PMCGap {
  start: Date;
  end: Date;
}

export type PmcSeriesKey = 'ctl' | 'atl' | 'tsb';

export interface PmcChartRow {
  /** Timestamp do dia — chave do eixo X (categórico, 1 linha por dia). */
  t: number;
  /** Dia sem ponto na série do backend. */
  missing: boolean;
  inGap: boolean;
  statusForma?: FaixaTsbStatus;
  tss: number | null;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  /** Fora de lacuna — linha contínua. */
  ctlSolid: number | null;
  atlSolid: number | null;
  tsbSolid: number | null;
  /** Dentro de lacuna + vizinhos — linha tracejada (valor estimado por decaimento). */
  ctlEst: number | null;
  atlEst: number | null;
  tsbEst: number | null;
}

export interface PmcGapArea {
  x1: number;
  x2: number;
}

export interface PmcChartModel {
  rows: PmcChartRow[];
  ticks: number[];
  gapAreas: PmcGapArea[];
  /** Último dia com valores — alimenta a legenda com o valor atual. */
  latest: PmcChartRow | null;
}

export const RANGE_DAYS: Record<PMCRange, number> = {
  '4w': 28,
  '8w': 56,
  '12w': 84,
  '6m': 182,
  '1y': 365,
};

const EMPTY: PmcChartModel = { rows: [], ticks: [], gapAreas: [], latest: null };
const key = (d: Date) => format(d, 'yyyy-MM-dd');
const SERIES: PmcSeriesKey[] = ['ctl', 'atl', 'tsb'];

/**
 * Prepara a série para o gráfico:
 * - filtra pelo período (últimos N dias a partir do último ponto) — antes o seletor não filtrava;
 * - densifica por dia, para o eixo categórico ser proporcional ao tempo;
 * - separa cada série em trecho contínuo e trecho estimado (lacunas);
 * - gera ticks semanais contados do último dia.
 */
export function buildPmcChartModel(data: PMCDataPoint[], gaps: PMCGap[], range: PMCRange): PmcChartModel {
  if (data.length === 0) return EMPTY;

  const porDia = new Map(data.map((p) => [key(p.date), p]));
  const ultimo = data.reduce((m, p) => (p.date > m ? p.date : m), data[0].date);
  const primeiro = data.reduce((m, p) => (p.date < m ? p.date : m), data[0].date);
  const inicioPeriodo = subDays(ultimo, RANGE_DAYS[range] - 1);
  const inicio = primeiro > inicioPeriodo ? primeiro : inicioPeriodo;
  const total = differenceInCalendarDays(ultimo, inicio) + 1;
  const dias = Array.from({ length: total }, (_, i) => addDays(inicio, i));

  const naLacuna = (dia: Date) =>
    gaps.some((g) => differenceInCalendarDays(dia, g.start) >= 0 && differenceInCalendarDays(g.end, dia) >= 0);
  const flags = dias.map(naLacuna);

  const rows: PmcChartRow[] = dias.map((dia, i) => {
    const p = porDia.get(key(dia));
    const perto = flags[i] || flags[i - 1] === true || flags[i + 1] === true;
    const row: PmcChartRow = {
      t: dia.getTime(),
      missing: !p,
      inGap: flags[i],
      statusForma: p?.statusForma,
      tss: p ? p.tss : null,
      ctl: null, atl: null, tsb: null,
      ctlSolid: null, atlSolid: null, tsbSolid: null,
      ctlEst: null, atlEst: null, tsbEst: null,
    };
    if (p) {
      for (const s of SERIES) {
        row[s] = p[s];
        row[`${s}Solid` as const] = flags[i] ? null : p[s];
        row[`${s}Est` as const] = perto ? p[s] : null;
      }
    }
    return row;
  });

  const gapAreas: PmcGapArea[] = [];
  let inicioRun = -1;
  rows.forEach((r, i) => {
    if (r.inGap && inicioRun < 0) inicioRun = i;
    const fecha = inicioRun >= 0 && (!r.inGap || i === rows.length - 1);
    if (fecha) {
      gapAreas.push({ x1: rows[inicioRun].t, x2: rows[r.inGap ? i : i - 1].t });
      inicioRun = -1;
    }
  });

  const passo = range === '6m' || range === '1y' ? 28 : 7;
  const ticks: number[] = [];
  for (let i = rows.length - 1; i >= 0; i -= passo) ticks.push(rows[i].t);
  ticks.reverse();

  const latest = [...rows].reverse().find((r) => r.ctl != null) ?? null;
  return { rows, ticks, gapAreas, latest };
}
