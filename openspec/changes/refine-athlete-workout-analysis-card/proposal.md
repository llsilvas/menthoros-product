**Tamanho:** S · **Trilha:** Fast

# refine-athlete-workout-analysis-card

> Só `apps/menthoros-front`. Sem mudança de contrato de API, de schema ou de quando a análise é
> gerada — ela continua automática no registro do treino.
> Simulação de UI: <https://claude.ai/artifact/52uq835bTThybo2x4xUSjY> (canvas privado do founder).

## Por que

Revisão da Home do atleta (2026-10-06) no estado `FEITO`:

- O card "Análise do treino" repete, num grid de três colunas, a duração e o RPE que o
  `TodayCompletedCard` já mostra no subtítulo logo acima.
- Enquanto a análise está `pending`, um bloco com borda própria, três barras de skeleton e duas
  linhas de texto ocupa a área principal da Home com conteúdo vazio.
- O RPE aparece em cor de alerta mesmo quando é igual ao esperado.
- Com a análise pronta, o texto da IA não se distingue visualmente dos dados do treino; o único
  realce é o bloco "Para o próximo treino".

## O que muda

1. **Métricas em uma linha.** O grid de três colunas do `WorkoutAnalysisCard` vira uma linha única
   em mono (`29 min · 4,0 km · RPE 5/10`). O valor planejado só aparece, numa segunda linha
   discreta, quando algum número difere do plano.
2. **Sem duplicação na Home.** `TodayCompletedCard` deixa de renderizar o subtítulo de duração/RPE
   quando recebe `analysisView` — a linha de métricas do card de análise passa a ser a única.
3. **Estado `pending` enxuto.** Uma frase ("Analisando o seu treino… pode fechar, fica guardado
   aqui.") e duas barras de skeleton, sem caixa aninhada.
4. **Destaque de conteúdo de IA.** Com a análise pronta, os textos gerados ficam dentro de um bloco
   com `aiHighlight.bg` + `aiHighlight.border` (lime translúcido), rótulo e ícone em `primary[500]`.
   O realce próprio de "Para o próximo treino" sai, para não haver lime sobre lime.
5. **Resumo primeiro.** O bloco fechado mostra só `reconhecimento` (resumo), para caber em 2–3
   linhas; "Ver análise completa" expande `comoFoi`, `proximoTreino` e `esforco`. O rodapé "Gerada
   automaticamente… Seu coach vê a mesma análise." permanece sempre visível.
6. **Cor do RPE.** Só usa cor de alerta quando o RPE informado é maior que o esperado.
7. **Tokens.** `aiHighlight.bg = rgba(189,222,90,0.10)` e `aiHighlight.border = rgba(189,222,90,0.45)`
   em `theme.premium.ts` — já registrados no design system como `ai-highlight-bg` / `ai-highlight-border`.

Vale nos quatro lugares que usam `WorkoutAnalysisCard` (Home, `WorkoutDetailDrawer`,
`PostWorkoutFeedbackCard` e `FitUploadResultCard`, no fluxo de importação `.fit`); o item 2 é
específico da Home.

## Fora de escopo

- Análise sob demanda (avaliada e descartada pelo founder em 2026-10-06): a geração continua
  automática, backend intocado.
- Chip de veredito "Dentro do plano / Esforço acima do esperado" e o controle "Cenário" que aparecem
  na simulação — exigiriam um campo novo calculado no backend.
- Conteúdo, prompt, validador e classificador da análise.
- Reconciliar "Forma: Fatigado" com a prontidão; texto duplicado do card de prontidão.

## Critérios de aceite

1. Given análise `pending` ou `done` com `stats`, When o card renderiza, Then as métricas aparecem
   numa única linha em fonte mono, sem o grid de três colunas.
2. Given todos os números iguais ao planejado, Then a linha de plano não é renderizada; Given algum
   diferente, Then ela aparece abaixo das métricas.
3. Given `TodayCompletedCard` com `analysisView` não nulo, Then o subtítulo de duração/RPE não é
   renderizado; Given `analysisView` nulo, Then o subtítulo continua aparecendo.
4. Given análise `pending`, Then o card mostra uma frase e duas barras de skeleton, sem borda interna.
5. Given análise `done`, Then os textos ficam dentro de um contêiner com `data-testid="ai-highlight"`
   que usa `aiHighlight.bg` e `aiHighlight.border`, e nenhum hex aparece no componente.
6. Given análise `done`, Then `comoFoi`, `proximoTreino` e `esforco` ficam ocultos até o toque em
   "Ver análise completa", que é um `<button>` com `aria-expanded`; só `reconhecimento` (resumo)
   aparece de cara.
7. Given RPE informado ≤ esperado, Then o valor não usa cor de alerta.
8. Texto sobre o bloco de destaque mantém contraste ≥ 4.5:1 (ver task 1.2 de validação de contraste).
9. `npm run lint && npm run build && npm run test:run` passam e a E2E
   `tests/e2e/athlete/workout-analysis.spec.ts` continua verde, ajustada ao novo layout. O fluxo de
   importação `.fit` (`FitUploadResultCard`) não tem E2E hoje no repo (gap pré-existente, fora desta
   change) — cobertura dele com o card novo fica no teste de componente
   `FitUploadResultCard.test.tsx`, que já verifica a paridade com o registro manual.

## Métrica de sucesso

- **Atleta:** proporção de análises em que o atleta expande "Ver análise completa" para ler
  `comoFoi`/`proximoTreino`/`esforco` (evento novo de front, se houver telemetria disponível; senão,
  verificação qualitativa com a turma fundadora).
- **Rotina do treinador (guarda):** nenhuma mudança — o coach continua recebendo a mesma análise no
  mesmo momento; a change não pode alterar `atleta_analise_visualizada_total` para baixo.

## Risco e rollback

- **Risco:** o destaque em lime translúcido ou a nova linha de métricas em mono não renderizarem bem
  em algum dispositivo/tema — mitigado por manter os tokens dentro do design system já registrado
  (`ai-highlight-bg` / `ai-highlight-border`) e pela validação de contraste na task 1.2.
- **Rollback:** change UI-only, sem migração nem dado persistido — revert do PR único em
  `apps/menthoros-front` desfaz o comportamento por completo.

## Open Questions & Assumptions

- **Decidido (founder, 2026-10-06):** manter a análise automática; destaque em lime translúcido.
- **Decidido (DoR, 2026-10-06, revertida depois):** a primeira correção do DoR manteve
  `proximoTreino` sempre visível — só `esforco` atrás do toggle — porque `proximoTreino` pode
  carregar o encaminhamento ao coach quando `primary_cause != NORMAL` (spec canônica
  `athlete-workout-analysis`). Essa decisão foi **revertida em revisão posterior no mesmo dia**: ao
  ver o card fechado em uso real, o founder pediu explicitamente que ele caiba em 2–3 linhas
  (`comoFoi`/`proximoTreino`/`esforco` todos atrás do toggle, só `reconhecimento` fica de cara). O
  risco de esconder o encaminhamento ao coach continua real e não foi reavaliado tecnicamente nesta
  reversão — fica registrado aqui para quem for revisar a métrica de guarda do coach
  (`atleta_analise_visualizada_total`) ou investigar queda de leitura da orientação de procurar o
  coach.
- **Aberto:** chip de veredito determinístico — vale uma change própria (backend + front)?
- **Aberto:** há telemetria de front para medir a expansão, ou a métrica fica qualitativa?
