import { parseISO } from 'date-fns';
import type { PMCDataPoint } from '../components/PMCChart';
import type { PmcPontoRaw } from '../../../types/AtletaPerfilCoach';

/**
 * Converte a série PMC do perfil do atleta (`PmcPontoRaw`, `data: string` ISO) no formato
 * consumido pelo `PMCChart` (`date: Date`); demais campos 1:1.
 *
 * Fonte única do mapeamento PMC → chart, reusada pelo perfil do atleta e pela aba
 * Diagnóstico do dashboard do coach (ambas já carregam o perfil via `useAthleteProfile`).
 * `statusForma` segue junto: o modo Simples "forma" colore cada dia pela faixa do backend.
 */
export function buildPmcDataPoints(pontos: PmcPontoRaw[]): PMCDataPoint[] {
    return pontos.map((p) => ({
        date: parseISO(p.data),
        ctl: p.ctl,
        atl: p.atl,
        tsb: p.tsb,
        tss: p.tss,
        statusForma: p.statusForma,
    }));
}
