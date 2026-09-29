import { lazy, Suspense, useMemo, useState } from 'react';
import { Box, Button, Chip, CircularProgress, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { parseISO } from 'date-fns';
import { primary, semantic, surface } from '../../../../theme/tokens';
import { DetailMetric } from '../DetailMetric';
import { SectionCard } from '../SectionCard';
import { EmptyMetricState } from '../EmptyMetricState';
import { AIInsightCard } from '../AIInsightCard';
import { PmcBackfillNotice } from '../PmcBackfillNotice';
import { WeeklyAdherenceLoadChart, AdherenceToneLegend } from '../WeeklyAdherenceLoadChart';
import { DiagnosisChartCard } from '../DiagnosisChartCard';
import { PmcChartControls } from '../../../athlete/components/PmcChartControls';
import type { PMCViewMode } from '../../../athlete/components/PmcChartControls';
import { usePmcBackfillNotice } from '../../../../hooks/usePmcBackfillNotice';
import type { CoachAttentionItem } from '../../../../types/Coach';
import { formatKm, formatPercent } from '../coachInboxHelpers';
import { ACTION_BTN_END_ICON_SX } from '../../../../shared/components/actionButtonSx';
import { getAcuteLoadTone, getMonotonyTone, getStrainZone } from '../../adapters/coachInboxAdapters';
import type { CoachAthleteRow } from '../../types/CoachInbox';
import type { LimiareisInferidosDto } from '../../../../types/AtletaPerfilCoach';
import type { PMCDataPoint, PMCGap, PMCRange } from '../../../athlete/components/PMCChart';

// Lazy como nas demais superfícies: mantém o recharts fora do chunk principal.
const PMCChart = lazy(() => import('../../../athlete/components/PMCChart'));

/** O perfil agregado traz ~12 semanas de PMC; 6m/1a mostrariam o mesmo recorte. */
const COACH_PMC_RANGES: PMCRange[] = ['4w', '8w', '12w'];

const WEEKS_SUBTITLE = 'Últimas 12 semanas · acima: adesão (treinos feitos / planejados) · abaixo: carga em TSS';
const PMC_SUBTITLE: Record<PMCViewMode, string> = {
  advanced: 'Condicionamento, cansaço e forma diários',
  simple: 'Forma diária (TSB), colorida pela faixa',
};

const CONFIANCA_LABEL: Record<'ALTA' | 'MEDIA' | 'BAIXA', string> = {
  ALTA:  'Alta confiança',
  MEDIA: 'Média confiança',
  BAIXA: 'Baixa confiança',
};

const CONFIANCA_COLOR: Record<'ALTA' | 'MEDIA' | 'BAIXA', string> = {
  ALTA:  semantic.success[500],
  MEDIA: semantic.warning[500],
  BAIXA: surface[400],
};

function LimiareisCard({ limiares }: { limiares: LimiareisInferidosDto }) {
  const temFc = limiares.fcLimiarEstimado != null;
  const temPace = limiares.paceLimiarEstimadoFormatado != null;
  if (!temFc && !temPace) return null;
  return (
    <SectionCard title="Limiares inferidos">
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {temFc && (
          <Box>
            <Typography sx={{ fontSize: '0.72rem', color: surface[400] }}>FC limiar</Typography>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: surface[50] }}>
              {limiares.fcLimiarEstimado} bpm
            </Typography>
            {limiares.confiancaInferenciaFc && (
              <Typography sx={{ fontSize: '0.6875rem', color: CONFIANCA_COLOR[limiares.confiancaInferenciaFc] }}>
                {CONFIANCA_LABEL[limiares.confiancaInferenciaFc]}
              </Typography>
            )}
          </Box>
        )}
        {temPace && (
          <Box>
            <Typography sx={{ fontSize: '0.72rem', color: surface[400] }}>Pace limiar</Typography>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: surface[50] }}>
              {limiares.paceLimiarEstimadoFormatado} /km
            </Typography>
            {limiares.confiancaInferenciaPace && (
              <Typography sx={{ fontSize: '0.6875rem', color: CONFIANCA_COLOR[limiares.confiancaInferenciaPace] }}>
                {CONFIANCA_LABEL[limiares.confiancaInferenciaPace]}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </SectionCard>
  );
}

const PLAN_STATUS_LABEL: Record<CoachAthleteRow['planStatus'], string> = {
  ATRASADO: 'Atrasado',
  NO_PRAZO: 'No prazo',
  CONCLUIDO: 'Concluído',
};

const PLAN_STATUS_COLOR: Record<CoachAthleteRow['planStatus'], string> = {
  ATRASADO: semantic.danger[500],
  NO_PRAZO: primary[500],
  CONCLUIDO: semantic.success[500],
};

interface DiagnosisTabPanelProps {
  selected: CoachAthleteRow;
  /** Item bruto da fila de atenção do atleta, quando ele está nela. */
  attentionItem?: CoachAttentionItem | null;
  /** Dias sem treinar (inatividade) ou idade do alerta. */
  attentionRecencyDays?: number | null;
  limiareisInferidos?: LimiareisInferidosDto | null;
  /** Série PMC (CTL/ATL/TSB) do atleta selecionado, já mapeada do perfil. */
  pmc: PMCDataPoint[];
  onOpenPlan: () => void;
}

export function DiagnosisTabPanel({ selected, attentionItem, attentionRecencyDays = null, limiareisInferidos, pmc, onOpenPlan }: DiagnosisTabPanelProps) {
  const strainZone = getStrainZone(selected.quickStats.strain);
  const statusColor = PLAN_STATUS_COLOR[selected.planStatus];
  const [pmcRange, setPmcRange] = useState<PMCRange>('12w');
  const [pmcMode, setPmcMode] = useState<PMCViewMode>('advanced');
  const { dismissed: pmcNoticeDismissed, dismiss: dismissPmcNotice } = usePmcBackfillNotice();
  const pmcGaps = useMemo<PMCGap[]>(
    () => selected.dataGaps.map((g) => ({ start: parseISO(g.start), end: parseISO(g.end) })),
    [selected.dataGaps],
  );

  /*
    Ordem: situação → evidência → explicação → ação → detalhe.
      1. Sinais de atenção       — o porquê, que é como o coach decide
      2. Métricas                — evidência imediata
      3. Adesão e carga/semana   — evidência dos motivos de engajamento (ADERENCIA/INATIVIDADE);
                                   adesão e carga no MESMO eixo semanal, com lacunas explícitas
      4. Forma (PMC)             — evidência de médio prazo
      5. Próximo treino          — ação/contexto, depois da evidência que a justifica
      6. Limiares                — detalhe de referência
  */
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 0.9, sm: 1.05, lg: 1.25, xl: 1.5 } }}>
      {/*
        O insight vem PRIMEIRO. A auditoria (UX-002) encontrou o diagnóstico enterrado abaixo de
        todas as métricas e gráficos: o coach decide pelo "porquê", e o número é evidência do
        insight — não o contrário. A ordem está travada por teste.
      */}
      <SectionCard title="Sinais de atenção">
        {attentionItem ? (
          <AIInsightCard item={attentionItem} recencyDays={attentionRecencyDays} />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography sx={{ fontSize: { xs: '0.78rem', lg: '0.85rem', xl: '0.9rem' }, color: surface[100], lineHeight: 1.45 }}>{selected.notes}</Typography>
            {selected.suggestedActions.map((action) => (
              <Box key={`${selected.id}-${action}`} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon sx={{ fontSize: 16, color: semantic.success[500] }} />
                <Typography sx={{ fontSize: '0.84rem', color: surface[200] }}>{action}</Typography>
              </Box>
            ))}
          </Box>
        )}
      </SectionCard>

      {selected.quickStats.hasWindowData ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: { xs: 0.9, sm: 1.05, lg: 1.25, xl: 1.5 } }}>
          {/* Sem faixa "ideal" (UX-005): referência que ignora o atleta é ruído com aparência de precisão. */}
          <DetailMetric label="Carga aguda" value={formatKm(selected.quickStats.acuteLoad)} tone={getAcuteLoadTone(selected.quickStats.acuteLoad)} />
          <DetailMetric label="Monotonia" value={selected.quickStats.monotony.toFixed(2)} tone={getMonotonyTone(selected.quickStats.monotony)} />
          <DetailMetric
            label="Strain"
            value={selected.quickStats.strain != null ? String(selected.quickStats.strain) : '—'}
            subtitle={strainZone.label}
            tone={strainZone.tone}
          />
          <DetailMetric
            label="Recuperação"
            value={formatPercent(selected.quickStats.recovery)}
            tone={selected.quickStats.recovery < 80 ? 'warning' : 'success'}
          />
        </Box>
      ) : (
        /*
          Sem série na janela, os números desta grade são fallback: carga cai para 0 e monotonia
          para 1.00, ambos em faixa "adequada". Exibi-los seria afirmar que o atleta está bem
          quando o que se sabe é que não há dado nenhum.
        */
        <EmptyMetricState
          mensagem="Sem treinos registrados na janela analisada — os indicadores aparecem com o primeiro treino sincronizado."
          proximoPasso="Confira a integração do atleta ou registre um treino manualmente."
        />
      )}

      {/*
        Substitui "Adesão nas últimas semanas" (barras S1…Sn sem data) e "Tendência de carga" (que
        plotava CTL diário — condicionamento — com tooltip "Ponto N · Valor"). Ver
        fix-coach-diagnosis-charts, RC1/RC4.
      */}
      <DiagnosisChartCard
        title="Adesão e carga por semana"
        subtitle={WEEKS_SUBTITLE}
        action={selected.weeklyDiagnosis.some((w) => w.adherence != null) ? <AdherenceToneLegend /> : undefined}
      >
        <WeeklyAdherenceLoadChart weeks={selected.weeklyDiagnosis} gaps={selected.dataGaps} />
      </DiagnosisChartCard>

      <DiagnosisChartCard
        title="Forma (PMC)"
        subtitle={PMC_SUBTITLE[pmcMode]}
        action={
          pmc.length > 0 ? (
            <PmcChartControls mode={pmcMode} onModeChange={setPmcMode} range={pmcRange} onRangeChange={setPmcRange} ranges={COACH_PMC_RANGES} />
          ) : undefined
        }
      >
        {pmc.length > 0 && !pmcNoticeDismissed && <PmcBackfillNotice onDismiss={dismissPmcNotice} />}
        {pmc.length === 0 ? (
          <Typography sx={{ fontSize: '0.82rem', color: surface[400] }}>
            Sem histórico de PMC para exibir ainda.
          </Typography>
        ) : (
          <Suspense
            fallback={
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={24} />
              </Box>
            }
          >
            <PMCChart
              data={pmc}
              range={pmcRange}
              mode={pmcMode}
              gaps={pmcGaps}
              simpleMetric="forma"
              embedded
            />
          </Suspense>
        )}
      </DiagnosisChartCard>

      <SectionCard
        title="Próximo treino"
        action={
          <Button size="small" endIcon={<ArrowForwardIcon fontSize="small" />} sx={{ ...ACTION_BTN_END_ICON_SX, px: { xs: 0.75, xl: 1 } }} onClick={onOpenPlan}>
            Abrir plano
          </Button>
        }
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography sx={{ fontSize: { xs: '0.92rem', lg: '1rem', xl: '1.1rem' }, fontWeight: 700, color: surface[50] }}>{selected.nextWorkout.title}</Typography>
            <Typography sx={{ fontSize: { xs: '0.7rem', lg: '0.8rem', xl: '0.86rem' }, color: surface[400], mt: 0.2 }}>
              {selected.nextWorkout.when} · {selected.nextWorkout.duration} - {selected.nextWorkout.distance}
            </Typography>
          </Box>
          <Chip
            size="small"
            label={PLAN_STATUS_LABEL[selected.planStatus]}
            sx={{ bgcolor: `${statusColor}16`, color: statusColor, border: `1px solid ${statusColor}44`, fontWeight: 700 }}
          />
        </Box>
      </SectionCard>

      {limiareisInferidos && <LimiareisCard limiares={limiareisInferidos} />}
    </Box>
  );
}
