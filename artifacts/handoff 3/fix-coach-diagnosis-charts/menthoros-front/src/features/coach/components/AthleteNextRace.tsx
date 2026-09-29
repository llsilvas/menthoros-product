import { Box, Typography } from '@mui/material';
import { semantic, surface } from '../../../theme/tokens';
import type { NextRaceHeader } from '../adapters/athleteKpiAdapters';

interface AthleteNextRaceProps {
  race: NextRaceHeader | null;
}

/**
 * Próxima prova no cabeçalho do atleta, ao lado da ação primária. Saiu da faixa de KPIs: não é
 * métrica de treino, é contexto — e o nome da prova não cabia num tile.
 */
export function AthleteNextRace({ race }: AthleteNextRaceProps) {
  return (
    <Box data-testid="inbox-proxima-prova" sx={{ ml: 'auto', textAlign: 'right', minWidth: 0, maxWidth: 280 }}>
      <Typography
        sx={{
          fontSize: '0.6875rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: race?.isTarget ? semantic.warning[500] : surface[400],
          fontWeight: race?.isTarget ? 700 : 400,
        }}
      >
        {race?.label ?? 'Próxima prova'}
      </Typography>
      <Typography noWrap sx={{ fontSize: '0.875rem', fontWeight: 600, color: race ? surface[50] : surface[400] }}>
        {race?.name ?? 'Sem prova cadastrada'}
      </Typography>
      {race ? <Typography sx={{ fontSize: '0.75rem', color: surface[400] }}>{race.when}</Typography> : null}
    </Box>
  );
}
