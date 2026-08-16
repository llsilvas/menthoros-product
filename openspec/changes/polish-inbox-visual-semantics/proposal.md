**Tamanho:** XS · **Trilha:** Fast

## Why

Navegação de verificação pós-merge da `refine-inbox-visual-hierarchy` (2026-08-16, medições no DOM
do inbox autenticado) confirmou as Fases 1–2 entregues, mas achou quatro pontas soltas — três de
acabamento da Fase 2 que ficaram fora do fechamento, e uma de robustez de rota encontrada durante a
navegação:

1. **O accent ainda vaza** (critério 5 da change original, parcial: 14 elementos lime acima da
   dobra vs. 16 antes): os botões secundários do rodapé (Enviar mensagem / Ajustar plano / Mais
   ações) seguem em lime outline, e o toggle do gráfico PMC ("Simples/Avançado" + período "12s")
   renderiza **lime sólido** — o mesmo peso visual do CTA primário.
2. **Semântica de cor do Alerta ficou ambígua:** o badge "Alerta" mede âmbar (`#F59E0B`, mesma cor
   do badge "Atenção"), enquanto o card da fila usa tratamento vermelho. A regra "vermelho = requer
   ação / âmbar = observar" não fechou entre badge e card.
3. **Zero-por-ausência com check verde no strip de KPIs:** atleta com 209 dias de inatividade exibe
   "Carga (7d): 0 km" com ícone verde de ok. A regra da change original (zero legítimo renderiza;
   zero por ausência de dado vira mensagem/neutro) foi aplicada à grade de métricas do diagnóstico,
   mas não ao strip de KPIs do cabeçalho.
4. **Rota inválida estoura o erro cru do React Router** ("Unexpected Application Error! 404 Not
   Found... Hey developer") — não há `errorElement` nas rotas. Qualquer link quebrado ou hash antigo
   derruba o coach numa tela de developer.

## What Changes

Somente `apps/menthoros-front`, sem contrato de API.

- Secundários do rodapé do painel e toggle do PMC migram para neutros (accent restrito a CTA
  primário + navegação ativa, fechando o critério 5 da change original).
- Badge de status "Alerta" passa a usar a paleta `error` (vermelho), alinhado ao card; "Atenção"
  permanece `warning` (âmbar).
- Strip de KPIs do cabeçalho passa a distinguir zero legítimo de ausência de dado (mesma flag do
  adapter usada na grade de diagnóstico): sem dado → valor neutro ("—" ou mensagem curta), sem
  ícone de estado positivo.
- `errorElement` nas rotas do router: página de erro simples no tema (título, mensagem em PT-BR e
  ação "Voltar ao inbox"), cobrindo 404 e erro de render.

## Non-Goals

- Nada de mobile/breakpoint (escopo da `refine-inbox-mobile-breakpoint`).
- Não redesenha o toggle do PMC — só troca a cor do estado selecionado.
- Não altera a lógica de cálculo de KPIs nem o backend.

## Critérios de aceite

1. Given o inbox acima da dobra em desktop, When se inventariam os elementos na cor de accent,
   Then apenas o CTA primário e a navegação ativa (sidebar + tab ativa) a utilizam.
2. Given um atleta com status Alerta, When badge e card renderizam, Then ambos usam a paleta
   `error`; Given status Atenção, Then ambos usam `warning`.
3. Given um atleta sem dados de treino na janela, When o strip de KPIs renderiza, Then nenhum KPI
   sem dado exibe ícone/cores de estado positivo — valor neutro; Given um zero legítimo (ex.:
   monotonia calculada), Then o valor numérico renderiza normalmente.
4. Given uma rota inexistente (ex.: `/#/coach/rota-que-nao-existe`), When a navegação resolve,
   Then renderiza página de erro no tema com ação "Voltar ao inbox" — nunca o fallback default do
   React Router.
5. `npm run lint && npm run build` e a suíte de testes passam.

## Métrica de sucesso

Proxy mecânico (herdada da change original): contagem de elementos em accent acima da dobra cai de
14 para o conjunto {CTA, nav ativa}; nenhuma tela de developer alcançável por URL no fluxo do coach.

## Open Questions & Assumptions

- **Premissa:** a flag "sem dados na janela" exposta pelo adapter na change original cobre os KPIs
  do strip (aderência, carga 7d, forma, ACWR); se algum KPI não tiver flag, deriva-se no adapter,
  sem mudança de API.
- **Premissa:** o estado selecionado do toggle PMC em neutro (ex.: fundo slate + texto claro) tem
  contraste suficiente; validação visual no QA.
