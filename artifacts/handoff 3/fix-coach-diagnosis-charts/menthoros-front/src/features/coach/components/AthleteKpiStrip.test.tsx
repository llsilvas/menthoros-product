import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AthleteKpiStrip } from './AthleteKpiStrip';
import { AthleteNextRace } from './AthleteNextRace';
import type { AthleteKpi } from '../adapters/athleteKpiAdapters';

const KPIS: AthleteKpi[] = [
  { key: 'adherence', label: 'Aderência', qualifier: '4 sem', value: '31%', detail: '5 de 16 treinos planejados', tone: 'warning', badge: null },
  { key: 'acwr', label: 'ACWR', qualifier: null, value: '1,97', detail: 'Base crônica incompleta: 60 dias sem treinos registrados', tone: 'neutral', badge: 'Baixa confiança' },
];

describe('AthleteKpiStrip', () => {
  it('mostra rótulo, valor e a base do número', () => {
    render(<AthleteKpiStrip kpis={KPIS} />);
    const celula = within(screen.getByTestId('kpi-adherence'));
    expect(celula.getByText('Aderência')).toBeInTheDocument();
    expect(celula.getByText('31%')).toBeInTheDocument();
    expect(celula.getByText('5 de 16 treinos planejados')).toBeInTheDocument();
  });

  /** O tom não pode viver só na cor (toneMarker): warning tem ícone com rótulo acessível. */
  it('tom de atenção tem marcador acessível; neutro não', () => {
    render(<AthleteKpiStrip kpis={KPIS} />);
    expect(within(screen.getByTestId('kpi-adherence')).getByTitle('Atenção')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-acwr')).queryByTitle(/atenção|adequado|crítico/i)).not.toBeInTheDocument();
  });

  it('ACWR de baixa confiança mostra selo e motivo', () => {
    render(<AthleteKpiStrip kpis={KPIS} />);
    const celula = within(screen.getByTestId('kpi-acwr'));
    expect(celula.getByText('Baixa confiança')).toBeInTheDocument();
    expect(celula.getByText(/60 dias sem treinos registrados/)).toBeInTheDocument();
  });
});

describe('AthleteNextRace', () => {
  it('prova alvo com nome e contagem', () => {
    render(<AthleteNextRace race={{ label: 'Prova alvo', name: 'Mizuno Athenas Run Longer 2026', when: '18 out · em 20 dias', isTarget: true }} />);
    expect(screen.getByText('Prova alvo')).toBeInTheDocument();
    expect(screen.getByText('18 out · em 20 dias')).toBeInTheDocument();
  });

  it('sem prova', () => {
    render(<AthleteNextRace race={null} />);
    expect(screen.getByText('Sem prova cadastrada')).toBeInTheDocument();
  });
});
