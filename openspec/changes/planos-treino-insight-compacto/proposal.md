**Tamanho:** S · **Trilha:** Fast · **Status:** 🏃 **EM IMPLEMENTAÇÃO** — somente `apps/menthoros-front`,
branch `refactor/planos-treino-insight-compacto` (worktree `.worktrees/front-planos-treino-insight-compacto`).

# planos-treino-insight-compacto

Sequência de `planos-dialog-padrao-inbox` (mergeada): ajustes de leitura no dialog de planos do coach,
pedidos pelo founder ao revisar a tela em uso.

## Por que

1. **Insight expandido quebra o grid.** O "Ver mais" do Coach Insight abre texto longo dentro do card; o
   grid iguala a altura da linha e os cards vizinhos ganham um vazio enorme, com o insight colado no rodapé
   longe das métricas.
2. **Texto sem hierarquia.** Recomendação, "O que o atleta leu" e a causa principal têm o mesmo peso; o que o
   coach precisa ler primeiro se perde. A nota (`executionScore`, "8/10") aparece sem rótulo, ao lado do RPE
   realizado que também é "x/10" e também usa cor de esforço.
3. **"Volume planejado" e "Volume alvo" são o mesmo número.** O backend grava `volumeAlvoKm =
   volumePlanejadoKm` ao gerar o plano e ao editar treino (`PlanGenerationPersister`,
   `TreinoPlanejadoServiceImpl`). Dois cartões, rótulos diferentes, dado idêntico.

## O que muda

- **Card de treino:** o insight vira um bloco compacto: tag da causa principal, "Execução x/10" rotulada,
  resumo em até 2 linhas e "Ver insight completo". Sem expansão inline, então a altura do card não muda.
- **Insight completo:** novo `InsightTreinoDialog` (aberto pelo card, que já tem a análise carregada).
  Ordem: veredito (causa + nota) → resumo → **Recomendação em destaque** → "O que o atleta leu"
  **recolhido** por padrão.
- **Grid:** sem expansão inline, a linha volta a alinhar a altura dos cards (stretch). "Ritmo alvo" aparece
  sempre ("—" quando ausente) para a linha não ficar irregular; o link "Ver insight completo" usa texto
  principal (o cinza de ghost quase não parecia clicável).
- **KPIs do plano:** remove "Volume alvo"; a faixa passa de 4 para 3 cartões (Planejado, Realizado, Treinos).

## Fora de escopo

- Backend e contrato de API: `volumeAlvoKm` continua sendo devolvido (outros consumidores); só deixa de ser
  exibido no dialog do coach. Uma meta de volume independente seria outra change.
- `DetalheTreinoDialog` (prescrição) não muda. A análise de treino vive no estado do `TreinoCard`; levá-la
  ao `DetalheTreinoDialog` exigiria nova busca ou elevar estado, sem ganho para o coach.
- Estados `pending`/`loading` do insight continuam como hoje.

## Critérios de aceite

1. Given um treino realizado com análise concluída, When o card renderiza, Then o insight mostra tag da
   causa principal (quando existe), "Execução x/10" (quando há nota) e o resumo em até 2 linhas, sem botão
   "Ver mais" que expanda o card.
2. Given três cards lado a lado, When qualquer um é interagido, Then a altura de nenhum card muda e a linha
   permanece alinhada (inclusive quando um treino não tem ritmo alvo).
3. Given "Ver insight completo", When clicado, Then abre o `InsightTreinoDialog` com veredito, resumo e
   Recomendação visíveis, e "O que o atleta leu" recolhido; o botão da seção a expande e recolhe.
4. Given uma análise sem `recommendation` ou sem textos do atleta, When o dialog abre, Then a seção
   ausente não aparece (sem bloco vazio).
5. Given um plano, When a faixa de KPIs renderiza, Then há três cartões (Volume planejado, Volume
   realizado, Treinos) e nenhum "Volume alvo".
6. `npm run lint && npm run build` e `npm run test:run` passam.

## Métrica de sucesso

O coach lê a recomendação de um treino em **1 clique, sem rolar o grid** e sem cards vizinhos esticados;
e a faixa de KPIs deixa de repetir o mesmo número duas vezes.

## Open Questions & Assumptions

- **Assumido:** `executionScore` é a nota de execução do treino ("Execução x/10" é o rótulo mais fiel ao
  campo). A causa principal (`primaryCause`) é a "tag de status" do insight.
- **Assumido:** não há consumidor da meta `volumeAlvoKm` no dialog do coach que dependa de ela aparecer.
- **Aberto:** se o founder quiser uma meta de volume distinta do planejado (definida pelo coach), o campo
  precisa ser gravado de forma independente no backend — change própria.
