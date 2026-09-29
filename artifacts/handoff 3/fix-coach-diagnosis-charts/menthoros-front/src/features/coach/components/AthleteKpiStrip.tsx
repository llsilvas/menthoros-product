import { Box, Typography } from '@mui/material';
import { backgrounds, content, semantic, surface } from '../../../theme/tokens';
import { marcadorDe } from './toneMarker';
import type { AthleteKpi } from '../adapters/athleteKpiAdapters';
import type { MetricTone } from '../types/AthleteForm';

interface AthleteKpiStripProps {
  kpis: AthleteKpi[];
}

const TONE_COLOR: Record<MetricTone, string> = {
  success: semantic.success[500],
  warning: semantic.warning[500],
  danger: semantic.danger[500],
  neutral: surface[50],
};

/**
 * Faixa de KPIs do atleta selecionado (substitui a grade de `MetricTile compact`). Células largas:
 * a linha de apoio carrega a base do número ("5 de 16 treinos planejados") ou o motivo de não
 * confiar nele — texto que o tile compacto, de uma linha, cortava.
 */
export function AthleteKpiStrip({ kpis }: AthleteKpiStripProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(${kpis.length}, minmax(0, 1fr))` },
        gap: '1px',
        backgroundColor: content.divider,
        borderBottom: `1px solid ${content.divider}`,
      }}
    >
      {kpis.map((kpi) => {
        const color = TONE_COLOR[kpi.tone];
        const marcador = marcadorDe(kpi.tone);
        return (
          <Box
            key={kpi.key}
            data-testid={`kpi-${kpi.key}`}
            sx={{
              backgroundColor: backgrounds.panel,
              px: { xs: 1.25, lg: 2, xl: 2.5 },
              py: { xs: 1.1, lg: 1.5, xl: 1.75 },
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
              minWidth: 0,
            }}
          >
            <Typography sx={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: surface[400] }}>
              <span>{kpi.label}</span>
              {kpi.qualifier ? <Box component="span" sx={{ color: surface[500] }}> · {kpi.qualifier}</Box> : null}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <Typography
                sx={{ fontSize: { xs: '1.25rem', xl: '1.5rem' }, fontWeight: 700, lineHeight: 1.15, color, fontVariantNumeric: 'tabular-nums' }}
              >
                {marcador ? (
                  <marcador.Icone titleAccess={marcador.rotulo} sx={{ fontSize: '0.85em', mr: 0.5, verticalAlign: '-0.1em', color }} />
                ) : null}
                {kpi.value}
              </Typography>
              {kpi.badge ? (
                <Box
                  component="span"
                  sx={{
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    color: semantic.warning[500],
                    border: `1px dashed ${semantic.warning[700]}`,
                    borderRadius: 999,
                    px: 1,
                    py: 0.15,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {kpi.badge}
                </Box>
              ) : null}
            </Box>
            <Typography
              sx={{
                fontSize: '0.75rem',
                lineHeight: 1.35,
                color: surface[400],
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textWrap: 'pretty',
              }}
            >
              {kpi.detail}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
