import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiagnosisTabPanel } from './DiagnosisTabPanel';
import type { CoachAthleteRow, WeeklyDiagnosisPoint } from '../../types/CoachInbox';

const SEMANA: WeeklyDiagnosisPoint = {
  weekStart: '2026-09-21',
  label: '21/09',
  tss: 120,
  sessions: 3,
  planned: 4,
  completed: 3,
  adherence: 75,
  noData: false,
  current: true,
};

function atleta(over: Partial<CoachAthleteRow> = {}): CoachAthleteRow {
  return {
    id: 'a1',
    name: 'Ana Silva',
    discipline: 'Corrida',
    age: 30,
    nivelExperiencia: null,
    gender: 'F',
    weeksOnPlan: 4,
    segment: 'attention',
    planStatus: 'NO_PRAZO',
    trainingType: 'Corrida',
    statusLabel: 'No prazo',
    decision: 'PENDING',
    adherence: 62,
    adherenceWindow: { percent: 62, completed: 10, planned: 16, weeks: 4 },
    load7d: 40,
    loadDelta: -5,
    delay: 1,
    nextWorkout: { title: 'Longão', when: 'sáb', zone: 'Z2', duration: '60min', distance: '10km', objective: 'Base' },
    raceCalendar: [],
    loadTrend: [30, 35, 40],
    adherenceTrend: [70, 65, 62],
    weeklyDiagnosis: [SEMANA],
    dataGaps: [],
    notes: 'Aderência caiu 20% nas últimas duas semanas.',
    suggestedActions: ['Reduzir volume', 'Conversar sobre a rotina'],
    quickStats: {
      hasWindowData: true,
      acuteLoad: 120,
      monotony: 1.4,
      strain: 200,
      recovery: 75,
      acwr: 1.1,
      acwrConfidence: { level: 'ALTA', reason: null },
      statusForma: null,
    },
    racePrediction: null,
    ...over,
  } as CoachAthleteRow;
}

const posicaoDe = (texto: RegExp) => {
  const elemento = screen.getByText(texto);
  return Array.from(document.querySelectorAll('*')).indexOf(elemento);
};

const LIMIARES = {
  fcLimiarEstimado: 168,
  paceLimiarEstimadoFormatado: '4:35/km',
  confiancaInferenciaFc: 'ALTA',
  confiancaInferenciaPace: 'MEDIA',
  dataInferenciaLimiar: '2026-08-01',
} as const;

describe('DiagnosisTabPanel', () => {
  /**
   * UX-002 da auditoria: o insight da IA — o *porquê* — ficava no fim do painel, depois de todas as
   * métricas e gráficos. O coach decide pelo motivo, não pelo número cru; a métrica é evidência do
   * insight, não o contrário. Este teste fixa a ordem para que ninguém a reverta sem notar.
   */
  it('mostra os sinais de atenção ANTES das métricas', () => {
    render(<DiagnosisTabPanel selected={atleta()} pmc={[]} onOpenPlan={vi.fn()} />);

    expect(posicaoDe(/sinais de atenção/i)).toBeLessThan(posicaoDe(/carga aguda/i));
  });

  it('mostra os sinais de atenção ANTES das tendências', () => {
    render(<DiagnosisTabPanel selected={atleta()} pmc={[]} onOpenPlan={vi.fn()} />);

    expect(posicaoDe(/sinais de atenção/i)).toBeLessThan(posicaoDe(/adesão e carga por semana/i));
  });

  it('exibe o diagnóstico e as ações sugeridas do atleta', () => {
    render(<DiagnosisTabPanel selected={atleta()} pmc={[]} onOpenPlan={vi.fn()} />);

    expect(screen.getByText(/aderência caiu 20%/i)).toBeInTheDocument();
    expect(screen.getByText(/reduzir volume/i)).toBeInTheDocument();
  });

  describe('faixas de referência', () => {
    /**
     * UX-005: "Ideal: 110-150 km" e "Ideal: < 2.0" eram fixos e iguais para todo mundo — o mesmo
     * intervalo para um iniciante de 20 km/semana e para um maratonista. Uma referência que não
     * considera o atleta não é referência, é ruído com aparência de precisão.
     *
     * Decisão do founder: remover, em vez de derivar um número que pareceria mais preciso do que é.
     */
    it('não exibe faixas "ideais" fixas', () => {
      render(<DiagnosisTabPanel selected={atleta()} pmc={[]} onOpenPlan={vi.fn()} />);

      expect(screen.queryByText(/ideal:/i)).not.toBeInTheDocument();
    });

    /** Pior que o "ideal" fixo: o subtítulo da recuperação dizia "Boa" mesmo quando era ruim. */
    it('não afirma que a recuperação é boa quando ela está baixa', () => {
      render(
        <DiagnosisTabPanel
          selected={atleta({ quickStats: { ...atleta().quickStats, recovery: 55 } })}
          pmc={[]}
          onOpenPlan={vi.fn()}
        />,
      );

      expect(screen.queryByText(/^Boa$/)).not.toBeInTheDocument();
    });
  });

  describe('sem dados na janela', () => {
    /**
     * Sem série PMC, o adapter preenche carga com 0 e monotonia com 1.00 — e ambos caem em tone
     * "adequado". O coach lia "carga 0 km, monotonia 1.00, tudo verde" para um atleta que nunca
     * sincronizou nada. Zero por ausência de dado não é zero medido.
     */
    it('substitui a grade de métricas por uma mensagem', () => {
      render(
        <DiagnosisTabPanel
          selected={atleta({ quickStats: { ...atleta().quickStats, hasWindowData: false } })}
          pmc={[]}
          onOpenPlan={vi.fn()}
        />,
      );

      expect(screen.getByText(/sem treinos registrados/i)).toBeInTheDocument();
      expect(screen.queryByText(/carga aguda/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/monotonia/i)).not.toBeInTheDocument();
    });

    /** O insight continua visível: é o que resta de útil quando não há número. */
    it('mantém os sinais de atenção visíveis', () => {
      render(
        <DiagnosisTabPanel
          selected={atleta({ quickStats: { ...atleta().quickStats, hasWindowData: false } })}
          pmc={[]}
          onOpenPlan={vi.fn()}
        />,
      );

      expect(screen.getByText(/sinais de atenção/i)).toBeInTheDocument();
    });

    it('com dados, a grade aparece normalmente', () => {
      render(<DiagnosisTabPanel selected={atleta()} pmc={[]} onOpenPlan={vi.fn()} />);

      expect(screen.getByText(/carga aguda/i)).toBeInTheDocument();
      expect(screen.queryByText(/sem treinos registrados/i)).not.toBeInTheDocument();
    });
  });

  describe('adesão e carga por semana (fix-coach-diagnosis-charts)', () => {
    /**
     * "Tendência de carga" plotava CTL diário (condicionamento) com tooltip "Ponto N · Valor", e a
     * adesão vinha em barras "S1…Sn" sem data. Os dois viraram um gráfico semanal único.
     */
    it('não exibe mais os cards antigos', () => {
      render(<DiagnosisTabPanel selected={atleta()} pmc={[]} onOpenPlan={vi.fn()} />);

      expect(screen.queryByText(/tendência de carga/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/adesão nas últimas semanas/i)).not.toBeInTheDocument();
    });

    it('descreve a lacuna de registro em texto', () => {
      render(
        <DiagnosisTabPanel
          selected={atleta({ dataGaps: [{ start: '2026-07-16', end: '2026-09-13', days: 60, open: false }] })}
          pmc={[]}
          onOpenPlan={vi.fn()}
        />,
      );

      expect(screen.getByText('Sem treinos registrados de 16/07 a 13/09 (60 dias)')).toBeInTheDocument();
    });
  });

  describe('ordem das seções (task 2.12)', () => {
    /**
     * A sequência é situação → evidência → explicação → ação → detalhe. Adesão é **a evidência**
     * dos motivos de engajamento (`ADERENCIA`, `INATIVIDADE`), os mais comuns na fila — vem antes
     * da forma.
     */
    it('adesão e carga vêm antes da forma', () => {
      render(<DiagnosisTabPanel selected={atleta()} pmc={[]} onOpenPlan={vi.fn()} />);

      expect(posicaoDe(/adesão e carga por semana/i)).toBeLessThan(posicaoDe(/forma \(pmc\)/i));
    });

    /** "Próximo treino" é ação/contexto: vem depois da evidência, não antes dela. */
    it('próximo treino vem depois da adesão', () => {
      render(<DiagnosisTabPanel selected={atleta()} pmc={[]} onOpenPlan={vi.fn()} />);

      expect(posicaoDe(/adesão e carga por semana/i)).toBeLessThan(posicaoDe(/próximo treino/i));
    });

    it('a ordem completa é situação → evidência → ação → detalhe', () => {
      render(<DiagnosisTabPanel selected={atleta()} limiareisInferidos={LIMIARES} pmc={[]} onOpenPlan={vi.fn()} />);

      const ordem = [
        posicaoDe(/sinais de atenção/i),
        posicaoDe(/carga aguda/i),
        posicaoDe(/adesão e carga por semana/i),
        posicaoDe(/forma \(pmc\)/i),
        posicaoDe(/próximo treino/i),
        posicaoDe(/limiares inferidos/i),
      ];

      expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
    });
  });

  describe('aviso de backfill de PMC [task 6.2b]', () => {
    const PONTO_PMC = { date: new Date('2026-08-01'), tss: 50, ctl: 40, atl: 35, tsb: 5 };

    it('não mostra o aviso quando não há série PMC', () => {
      render(<DiagnosisTabPanel selected={atleta()} pmc={[]} onOpenPlan={vi.fn()} />);

      expect(screen.queryByText('Histórico de PMC atualizado')).not.toBeInTheDocument();
    });

    it('mostra o aviso quando há série PMC', () => {
      render(<DiagnosisTabPanel selected={atleta()} pmc={[PONTO_PMC]} onOpenPlan={vi.fn()} />);

      expect(screen.getByText('Histórico de PMC atualizado')).toBeInTheDocument();
    });
  });
});
