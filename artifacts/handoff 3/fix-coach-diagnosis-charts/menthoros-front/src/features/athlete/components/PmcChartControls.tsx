import { Box } from '@mui/material';
import { surface } from '../../../theme/tokens';
import type { PMCRange } from '../adapters/pmcChartModel';

export type PMCViewMode = 'simple' | 'advanced';

export const RANGE_LABELS: Record<PMCRange, string> = {
  '4w': '4s',
  '8w': '8s',
  '12w': '12s',
  '6m': '6m',
  '1y': '1a',
};

export const ALL_RANGES: PMCRange[] = ['4w', '8w', '12w', '6m', '1y'];

interface ToggleButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  small?: boolean;
}

function ToggleButton({ label, active, onClick, small = false }: ToggleButtonProps) {
  return (
    <Box
      component="button"
      type="button"
      aria-pressed={active}
      onClick={onClick}
      sx={{
        px: small ? 1 : 1.5,
        py: small ? 0.25 : 0.5,
        fontSize: small ? '0.72rem' : '0.78rem',
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        border: 'none',
        borderRadius: 1,
        bgcolor: active ? surface[700] : 'transparent',
        color: active ? surface[50] : surface[400],
        transition: 'all 0.15s ease',
        '&:hover': { bgcolor: active ? surface[700] : surface[800], color: surface[50] },
      }}
    >
      {label}
    </Box>
  );
}

interface PmcChartControlsProps {
  mode: PMCViewMode;
  onModeChange: (mode: PMCViewMode) => void;
  range: PMCRange;
  onRangeChange: (range: PMCRange) => void;
  ranges?: PMCRange[];
}

/**
 * Seletores de modo e período do PMC. Arquivo próprio, sem recharts: o card do Diagnóstico
 * renderiza estes controles no cabeçalho enquanto o `PMCChart` continua lazy.
 */
export function PmcChartControls({ mode, onModeChange, range, onRangeChange, ranges = ALL_RANGES }: PmcChartControlsProps) {
  const grupo = { display: 'flex', bgcolor: `${surface[0]}0A`, borderRadius: 1, p: 0.25, gap: 0.25 } as const;
  return (
    <>
      <Box role="group" aria-label="Modo do gráfico" sx={grupo}>
        <ToggleButton label="Simples" active={mode === 'simple'} onClick={() => onModeChange('simple')} />
        <ToggleButton label="Avançado" active={mode === 'advanced'} onClick={() => onModeChange('advanced')} />
      </Box>
      <Box role="group" aria-label="Período" sx={grupo}>
        {ranges.map((r) => (
          <ToggleButton key={r} label={RANGE_LABELS[r]} active={range === r} onClick={() => onRangeChange(r)} small />
        ))}
      </Box>
    </>
  );
}
