import { describe, expect, it } from 'vitest';
import { buildAthleteKpis, buildNextRaceHeader } from './athleteKpiAdapters';
import type { CoachAthleteRow } from '../types/CoachInbox';

function atleta(over: Partial<CoachAthleteRow> = {}, stats: Partial<CoachAthleteRow['quickStats']> = {}): CoachAthleteRow {
  const base = {
    adherence: 38,
    adherenceWindow: { percent: 31, completed: 5, planned: 16, weeks: 4 },
    load7d: 5,
    loadDelta: 36.2,
    quickStats: {
      hasWindowData: true,
      acuteLoad: 21.1,
      monotony: 1.2,
      tsb: -8.64,
      statusForma: 'FATIGADO',
      acwr: 1.97,
      acwrConfidence: { level: 'BAIXA', reason: 'Base crônica incompleta: 60 dias sem treinos registrados' },
      strain: null,
      recovery: 50,
      ...stats,
    },
  };
  return { ...base, ...over } as unknown as CoachAthleteRow;
}

const FATIGADO = { label: 'Fatigado', tone: 'neutral' } as const;
const porChave = (row: CoachAthleteRow, faixa = FATIGADO) =>
  Object.fromEntries(buildAthleteKpis(row, faixa).map((k) => [k.key, k]));

describe('buildAthleteKpis', () => {
  it('aderência mostra a conta da janela, no tom das barras', () => {
    expect(porChave(atleta()).adherence).toMatchObject({ value: '31%', detail: '5 de 16 treinos planejados', tone: 'danger' });
  });

  it('aderência sem janela cai no roster', () => {
    expect(porChave(atleta({ adherenceWindow: null })).adherence).toMatchObject({ value: '38%', detail: 'Últimas 4 semanas' });
  });

  it('carga: delta em TSS arredondado; ≥ 10% é atenção', () => {
    expect(porChave(atleta()).load).toMatchObject({ detail: 'TSS +36% vs. 7 dias anteriores', tone: 'warning' });
    expect(porChave(atleta({ loadDelta: 4 })).load.tone).toBe('success');
  });

  it('carga sem base anterior é neutra', () => {
    expect(porChave(atleta({ loadDelta: null })).load).toMatchObject({ tone: 'neutral', detail: 'Sem carga nos 7 dias anteriores para comparar' });
  });

  it('forma usa a faixa do backend e TSB em pt-BR com 1 casa', () => {
    expect(porChave(atleta()).form).toMatchObject({ value: 'Fatigado', detail: 'TSB -8,6', tone: 'neutral' });
  });

  it('ACWR com baixa confiança: neutro, selo e motivo', () => {
    expect(porChave(atleta()).acwr).toMatchObject({
      value: '1,97',
      tone: 'neutral',
      badge: 'Baixa confiança',
      detail: 'Base crônica incompleta: 60 dias sem treinos registrados',
    });
  });

  it('ACWR com base completa segue a zona', () => {
    const kpi = porChave(atleta({}, { acwr: 1.74, acwrConfidence: { level: 'ALTA', reason: null } })).acwr;
    expect(kpi).toMatchObject({ value: '1,74', tone: 'danger', badge: null, detail: 'Risco · carga aguda ÷ crônica' });
  });

  it('sem dado na janela vence todas as regras', () => {
    const kpis = buildAthleteKpis(atleta({}, { hasWindowData: false }), FATIGADO);
    expect(kpis.map((k) => [k.value, k.detail, k.tone])).toEqual(Array(4).fill(['—', 'Sem dado na janela', 'neutral']));
  });
});

describe('buildNextRaceHeader', () => {
  const prova = { date: '18 out', label: 'Mizuno Athenas Run Longer 2026', tag: 'ALVO' as const };

  it('prova alvo com contagem', () => {
    expect(buildNextRaceHeader(prova, 20)).toEqual({ label: 'Prova alvo', name: prova.label, when: '18 out · em 20 dias', isTarget: true });
  });

  it('amanhã, hoje e sem contagem', () => {
    expect(buildNextRaceHeader(prova, 1)?.when).toBe('18 out · amanhã');
    expect(buildNextRaceHeader(prova, 0)?.when).toBe('18 out · hoje');
    expect(buildNextRaceHeader({ ...prova, tag: 'PRINCIPAL' }, -1)).toMatchObject({ label: 'Próxima prova', when: '18 out' });
  });

  it('sem prova → null', () => {
    expect(buildNextRaceHeader(null, -1)).toBeNull();
  });
});
