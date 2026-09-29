# Tasks — standardize-card-foundation

Branch `feature/standardize-card-foundation` (front).

**Ordem:** 1 → 2 → 3 → 4 → 5. O bloco 1 remove a ambiguidade de `radius` que os blocos 2 e 3 consomem;
o bloco 4 (fix isolado) pode rodar em paralelo a 1-3 se preferir, mas entra antes do 5 porque
`AssessmentInfoCard` é um dos candidatos de migração-prova caso `WorkoutAnalysisCard` mude de escopo.
Um commit por bloco.

## 1. Resolver colisão de `radius` (D1)
- [ ] 1.1 Levantar todos os consumidores de `radius` de `theme/tokens.ts` (`grep -rn "radius" src --include="*.tsx" --include="*.ts"`) e confirmar se algum depende do formato `number` em vez de string px. Confirmar também que os consumidores de `radius` de `theme/theme.premium.ts` (`sharp/inner/outer/pill`) estão todos em `src/landing/` — se algum viver fora dali, ele entra no escopo desta change (D1)
  - verify: lista de arquivos documentada no commit; nenhum consumidor quebra ao trocar para string; consumidores de `theme.premium.ts`'s `radius` confirmados como landing-only (ou escopo ajustado)
- [ ] 1.2 Remover o export `radius` de `theme/tokens.ts`; atualizar os poucos consumidores identificados em 1.1 para importar de `shared/design-tokens/density.ts`
  - verify: `npm run build` sem erro de tipo/import; `grep -rn "radius" src/theme/tokens.ts` não retorna a definição do objeto
- [ ] 1.3 Validação: `npm run lint && npm run build && npm run test:run`

## 2. Componente `Card` (D2, D3)
- [ ] 2.1 Teste primeiro: `shared/components/Card.test.tsx` — variante `flat` (bgcolor `elevation.card`, borda `content.cardBorder`, `radius.lg`, sem boxShadow), variante `glass` (spread de `glassSx`), `interactive`/`onClick` liga hover e cursor, ausência de `interactive` não gera `:hover`, `stateColor` aplica borda 2px + fundo tingido via `alpha()` (caso `success`/`danger`, espelhando `TreinoCard`), `component="section"` + `aria-label` produz `getByRole('region', { name })`
  - verify: teste vermelho antes da implementação (arquivo de destino não existe)
- [ ] 2.2 Implementar `shared/components/Card.tsx` conforme D2/D3 — props `variant`, `interactive`, `onClick`, `stateColor`, `component`, `aria-label`, `sx`
  - verify: `vitest run Card.test` verde
- [ ] 2.3 Validação: `npm run lint && npm run build && npm run test:run`

## 3. Componente `CardHeader` (D4)
- [ ] 3.1 Teste primeiro: `shared/components/CardHeader.test.tsx` — título sempre presente (string e `ReactNode`, ex.: label envolto em `Tooltip`), `icon`/`subtitle`/`action` opcionais renderizam quando passados e somem quando omitidos, `divider` alterna a borda inferior
  - verify: teste vermelho antes da implementação
- [ ] 3.2 Implementar `shared/components/CardHeader.tsx` conforme D4 (`title: React.ReactNode`)
  - verify: `vitest run CardHeader.test` verde
- [ ] 3.3 Validação: `npm run lint && npm run build && npm run test:run`

## 4. Corrigir bug de cor (F4)
- [ ] 4.1 `pages/home/components/AssessmentInfoCard.tsx:125` — trocar `bgcolor: '33'` pelo token real (confirmar contra o design original se era `${primary[500]}33` ou outro papel de cor; usar `alpha()` do MUI em vez de concatenação de string, alinhado com F7)
  - verify: teste de componente cobrindo a cor do Chip (novo caso ou ajuste em teste existente); `npm run test:run` verde
- [ ] 4.2 Validação: `npm run lint && npm run build && npm run test:run`

## 5. Migração-prova (CA7)
- [ ] 5.1 Migrar `shared/components/KPICard.tsx` para `<Card variant="flat">` como wrapper — manter o label row (com `Tooltip` condicional) e o sparkline como `children`, sem `CardHeader` (ver `design.md` D4)
  - verify: testes existentes de `KPICard` continuam verdes, incluindo o comportamento de `Tooltip`; diff visual conferido com a skill `run`
- [ ] 5.2 Migrar `pages/home/components/StatCard.tsx` para `<Card variant="glass" interactive={!!onClick}>`
  - verify: testes existentes de `StatCard` continuam verdes; comportamento de hover condicional a `onClick` preservado
- [ ] 5.3 Migrar `features/athlete/components/WorkoutAnalysisCard.tsx` para `<Card variant="flat">` + `<CardHeader icon={...} title={...}>`
  - verify: testes existentes de `WorkoutAnalysisCard` continuam verdes
- [ ] 5.4 Validação final: `npm run lint && npm run build && npm run test:run`; navegação manual nas 3 telas afetadas com a skill `run`, print anexado ao relatório da task

## 6. Fechamento
- [ ] 6.1 Revisar `specs/design-system/spec.md` (já criado no proposal) contra a implementação final — ajustar cenários se a API de `Card`/`CardHeader` mudou durante o desenvolvimento
- [ ] 6.2 Revisar se `standardize-card-migration` (change seguinte) precisa de ajuste no proposal/design em função de alguma decisão tomada durante a implementação (ex.: mudança na API de `Card`/`CardHeader`)
