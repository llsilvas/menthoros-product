import { formatKm } from '../components/coachInboxHelpers';
import { adherenceTone } from './diagnosisChartsAdapters';
import { getAcwrZone } from './coachInboxAdapters';
import type { FaixaApresentacao } from '../../../types/FaixaTsb';
import type { MetricTone } from '../types/AthleteForm';
import type { CoachAthleteRow, RaceItem } from '../types/CoachInbox';

export type AthleteKpiKey = 'adherence' | 'load' | 'form' | 'acwr';

/** Uma célula da faixa de KPIs do atleta selecionado — tudo já formatado para exibir. */
export interface AthleteKpi {
  key: AthleteKpiKey;
  /** Nome da métrica. Fica num span próprio para testes e leitores de tela acharem pelo nome. */
  label: string;
  /** Janela ou unidade ("4 sem", "7 dias", "TSB"). */
  qualifier: string | null;
  value: string;
  /** Base do valor ou motivo de não haver um. Pode quebrar em até 2 linhas. */
  detail: string;
  tone: MetricTone;
  /** Selo ao lado do valor — hoje só "Baixa confiança" no ACWR. */
  badge: string | null;
}

export interface NextRaceHeader {
  label: 'Prova alvo' | 'Próxima prova';
  name: string;
  when: string;
  isTarget: boolean;
}

const SEM_DADO = 'Sem dado na janela';

const decimal = (v: number, casas: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const signed = (v: number, casas: number) => `${v > 0 ? '+' : ''}${decimal(v, casas)}`;

function semDado(key: AthleteKpiKey, label: string, qualifier: string | null): AthleteKpi {
  return { key, label, qualifier, value: '—', detail: SEM_DADO, tone: 'neutral', badge: null };
}

function adherenceKpi(row: CoachAthleteRow): AthleteKpi {
  const base = { key: 'adherence' as const, label: 'Aderência', qualifier: '4 sem', badge: null };
  const janela = row.adherenceWindow;
  if (janela) {
    return {
      ...base,
      value: `${janela.percent}%`,
      detail: `${janela.completed} de ${janela.planned} treinos planejados`,
      tone: adherenceTone(janela.percent),
    };
  }
  // Perfil ainda sem `aderenciaSemanal`: valor do roster, sem a conta que o sustenta.
  return { ...base, value: `${Math.round(row.adherence)}%`, detail: 'Últimas 4 semanas', tone: adherenceTone(row.adherence) };
}

function loadKpi(row: CoachAthleteRow): AthleteKpi {
  const base = { key: 'load' as const, label: 'Carga', qualifier: '7 dias', value: formatKm(row.load7d), badge: null };
  if (row.loadDelta == null) {
    return { ...base, detail: 'Sem carga nos 7 dias anteriores para comparar', tone: 'neutral' };
  }
  // Delta em TSS: o perfil não traz km dos 7 dias anteriores (follow-up de backend).
  return {
    ...base,
    detail: `TSS ${signed(Math.round(row.loadDelta), 0)}% vs. 7 dias anteriores`,
    tone: row.loadDelta >= 10 ? 'warning' : 'success',
  };
}

function formKpi(row: CoachAthleteRow, faixa: FaixaApresentacao | null): AthleteKpi {
  const tsb = row.quickStats.tsb;
  return {
    key: 'form',
    label: 'Forma',
    qualifier: 'TSB',
    value: faixa?.label ?? '—',
    detail: tsb != null ? `TSB ${signed(tsb, 1)}` : 'TSB não disponível',
    tone: faixa?.tone ?? 'neutral',
    badge: null,
  };
}

function acwrKpi(row: CoachAthleteRow): AthleteKpi {
  const base = { key: 'acwr' as const, label: 'ACWR', qualifier: null };
  const acwr = row.quickStats.acwr;
  if (acwr == null) return { ...base, value: '—', detail: 'Dado insuficiente', tone: 'neutral', badge: null };

  const confianca = row.quickStats.acwrConfidence;
  if (confianca?.level === 'BAIXA') {
    // Base crônica incompleta infla o ACWR; "Risco" aqui seria alarme falso.
    return {
      ...base,
      value: decimal(acwr, 2),
      detail: confianca.reason ?? 'Base crônica incompleta',
      tone: 'neutral',
      badge: 'Baixa confiança',
    };
  }
  const zona = getAcwrZone(acwr);
  return { ...base, value: decimal(acwr, 2), detail: `${zona.label} · carga aguda ÷ crônica`, tone: zona.tone, badge: null };
}

/**
 * Faixa de KPIs do atleta selecionado. "Sem dado na janela" (série PMC vazia) vence as demais
 * regras: os campos têm fallback numérico que não pode aparecer como medição.
 */
export function buildAthleteKpis(row: CoachAthleteRow, faixa: FaixaApresentacao | null): AthleteKpi[] {
  if (!row.quickStats.hasWindowData) {
    return [
      semDado('adherence', 'Aderência', '4 sem'),
      semDado('load', 'Carga', '7 dias'),
      semDado('form', 'Forma', 'TSB'),
      semDado('acwr', 'ACWR', null),
    ];
  }
  return [adherenceKpi(row), loadKpi(row), formKpi(row, faixa), acwrKpi(row)];
}

/** Próxima prova no cabeçalho (saiu da faixa de KPIs). `daysUntil < 0` = sem prova futura. */
export function buildNextRaceHeader(race: RaceItem | null, daysUntil: number): NextRaceHeader | null {
  if (!race) return null;
  const quando =
    daysUntil > 1 ? ` · em ${daysUntil} dias` : daysUntil === 1 ? ' · amanhã' : daysUntil === 0 ? ' · hoje' : '';
  const isTarget = race.tag === 'ALVO';
  return { label: isTarget ? 'Prova alvo' : 'Próxima prova', name: race.label, when: `${race.date}${quando}`, isTarget };
}
