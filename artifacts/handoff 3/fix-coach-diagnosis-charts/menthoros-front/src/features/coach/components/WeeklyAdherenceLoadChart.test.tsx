import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdherenceToneLegend, WeeklyAdherenceLoadChart } from './WeeklyAdherenceLoadChart';
import type { WeeklyDiagnosisPoint } from '../types/CoachInbox';

function semana(over: Partial<WeeklyDiagnosisPoint> = {}): WeeklyDiagnosisPoint {
  return {
    weekStart: '2026-09-21',
    label: '21/09',
    tss: 120,
    sessions: 3,
    planned: 4,
    completed: 3,
    adherence: 75,
    noData: false,
    current: false,
    ...over,
  };
}

describe('WeeklyAdherenceLoadChart', () => {
  it('sem plano e sem carga → estado vazio', () => {
    render(<WeeklyAdherenceLoadChart weeks={[semana({ tss: null, sessions: null, adherence: null })]} gaps={[]} />);
    expect(screen.getByText(/sem plano nem carga/i)).toBeInTheDocument();
  });

  it('com dados, mostra os dois painéis', () => {
    render(<WeeklyAdherenceLoadChart weeks={[semana()]} gaps={[]} />);
    expect(screen.getByText(/adesão ao plano/i)).toBeInTheDocument();
    expect(screen.getByText(/carga semanal \(tss\)/i)).toBeInTheDocument();
  });

  it('legenda de escala em 4 faixas (Proposta)', () => {
    render(<AdherenceToneLegend />);
    expect(screen.getAllByRole('listitem').map((i) => i.textContent)).toEqual(['≥ 90%', '70–89%', '40–69%', '< 40%']);
  });

  /** A lacuna precisa ser dita em texto: o gráfico sozinho não é lido por leitor de tela. */
  it('descreve cada lacuna de registro', () => {
    render(
      <WeeklyAdherenceLoadChart
        weeks={[semana(), semana({ weekStart: '2026-08-03', label: '03/08', noData: true, tss: null, sessions: null })]}
        gaps={[{ start: '2026-07-16', end: '2026-09-13', days: 60, open: false }]}
      />,
    );
    expect(screen.getByText('Sem treinos registrados de 16/07 a 13/09 (60 dias)')).toBeInTheDocument();
  });
});
