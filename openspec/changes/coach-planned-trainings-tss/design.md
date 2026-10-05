## Contexto

Change sobe para Full apenas por tocar dois repos (regra do `config.yaml`); não há incerteza de design, mudança de contrato quebrável ou risco de segurança/multi-tenancy. O padrão a seguir já existe no próprio código: PR #164 (`fix/coach-recent-trainings-tss`) resolveu exatamente o mesmo problema do lado "realizado" — esta change espelha a mesma solução no lado "planejado".

## Decisão

Replicar, campo por campo, a correção do PR #164:

| Lado realizado (já corrigido, PR #164) | Lado planejado (esta change) |
|---|---|
| `TreinoRealizado.tssCalculado` (entidade) | `TreinoPlanejado.tssPlanejado` (entidade, já existe) |
| `RealizadoRecenteDto.tssCalculado` (DTO) | `TreinoPlanejadoResumoDto.tssPlanejado` (DTO, a adicionar) |
| `CoachAthleteProfileServiceImpl` passa o valor no construtor | idem, em `resolverPlanoVigente` |
| `RecentTrainingsPanel.tsx` renderiza condicionalmente | `CurrentWeekPlan.tsx` (`TreinoCard`) renderiza condicionalmente |

Nenhuma lógica de cálculo nova — `tssPlanejado` já é calculado/persistido em `TreinoPlanejado` por outros fluxos (manual, patch, geração de plano). O gap é só de exposição no DTO do painel do coach.

## Alternativas consideradas

- **Recalcular TSS no momento da leitura do painel:** rejeitado — duplicaria `TssCalculatorService` fora do fluxo de escrita e não resolveria o caso raiz (o dado já existe na entidade, só não é exposto).
- **Investigar e corrigir também o gap do schema v1 do LLM nesta mesma change:** rejeitado — é um problema de qualidade de dado na geração do plano (causa diferente, código diferente, risco de regressão em outro pipeline); registrado como "fora de escopo" no proposal para virar change própria se confirmado.

## Riscos e mitigações

- **Risco:** nenhum, mudança aditiva e nullable nos dois lados do contrato.
- **Mitigação:** cobrir com teste o caso `tssPlanejado == null` para garantir que o card não renderiza "0" ou um bloco vazio enganoso (mesmo cuidado que o PR #164 teve com `fonteDados`).
