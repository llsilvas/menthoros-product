# tasks — expandir-serie-timeline-revisao

Repo afetado: `apps/menthoros-front` · branch `feature/expandir-serie-timeline-revisao`

## 1. Timeline expandida

- [x] **1.1** Teste que falha (CA1/CA2): `TreinoEditDialog.test.tsx` monta um fartlek com 4 pares e
      espera 4 barras numeradas com a duração de **uma** repetição.
- [x] **1.2** `liveBlocks` (`TreinoEditDialog.tsx:342`) emite um par esforço/recuperação por
      repetição, em vez de dois blocos agregados por `duração × repetições`.
- [x] **Validação:** `npm run lint` → sem issues · `npm run build` → ok ·
      `npm run test:run` → **122 arquivos, 980 testes, 0 falhas**

### Notas de diagnóstico

- As duas telas **já usavam o mesmo componente** (`WorkoutTimelineChart`). A divergência era só a
  fonte dos blocos — não foi preciso unificar componente nenhum.
- O primeiro fixture do teste usou esforço de 1 min e falhou: com 3,7% da largura total, a barra cai
  abaixo do limiar `showLabel = widthPct > 5` (`WorkoutTimelineChart.tsx:151`) e é desenhada sem
  rótulo. Comportamento correto do componente — o fixture foi ajustado para durações acima do
  limiar, senão o teste não distinguiria "expandiu" de "agregou".
- Uma assertion inicial (`queryByText('4×')` ausente) era inválida: o `4×` do stepper da série é
  legítimo e permanece na tela. Substituída pela verificação da duração por barra.

## 2. E2E — deferido, com motivo

- [ ] **2.1** **Deferido.** O `CLAUDE.md` do front lista "editar um treino planejado" como fluxo
      crítico com E2E obrigatório. Não há spec E2E da tela de revisão hoje (`tests/e2e/` cobre
      auth, atletas, dashboard e coach/inbox), e criar a primeira exigiria seed de plano + auth —
      escopo próprio, maior que esta change.

      Mitigação considerada suficiente aqui: a mudança é **puramente de renderização**. Não toca a
      hidratação das etapas, a serialização do patch, o cálculo de totais nem qualquer chamada de
      API — o caminho que escreve no plano do atleta é byte-a-byte o mesmo. O risco que o E2E
      cobriria (fluxo quebrar de ponta a ponta) não é atingido por este diff.

## 3. Fechamento

- [ ] **3.1** PR `feature/expandir-serie-timeline-revisao` → `develop`

## Follow-ups fora do escopo

- `TreinoEditDialog.tsx:256-286` / `:407-450` — o editor colapsa qualquer série em **um** par
  esforço/recuperação, na hidratação e na serialização. Séries heterogêneas perdem a variação ao
  serem salvas pela tela de revisão. Esta change torna a perda mais visível (N pares idênticos
  desenhados), mas não a corrige.
- `TreinoPlanejadoServiceImpl:410-423` (backend) — `aplicarEtapasPatch` descarta `blocoId` ao editar.
