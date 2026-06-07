# Design Decisions — Finalize Design System

## Context

Após geração e validação visual das 4 telas do coach shell, identificamos
que: (1) a paleta visual emergente (lime + navy do logo) é superior à
proposta original (orange + slate), unificando atleta e treinador; (2)
dark mode funciona como padrão único; (3) o review revelou inconsistências
finas que precisam ser formalizadas antes de codar.

Este documento consolida as decisões que travam o design system para
implementação.

---

## Decisões

### Decision 1: Lime do logo como primary canônico (BREAKING)

**What**: `primary-500` muda de `#FF6B35` (laranja) para `#D4FF3A` (lime
do logo do rinoceronte).

**Why**:
- Coerência com a identidade institucional já estabelecida (logo)
- Lime sobre navy tem contraste excepcional (~14:1) — WCAG AAA com folga
- Energia visual alinhada com nicho esportivo de alta performance
- Unifica visualmente coach shell e athlete shell que já tendiam ao lime
- Diferencia do laranja do Strava e do rosa do Runna — ocupação de espaço
  cromático livre no mercado

**Cost**: Substituição de tokens em todos os componentes existentes.
Mitigado por: tokens semânticos (todos usam `primary-500`, não `#FF6B35`
hardcoded), então é um único arquivo de tokens trocado.

**Alternatives considered**:
- Manter laranja: rejeitado por incoerência com logo
- Lime mais claro/escuro: rejeitado por menor contraste

---

### Decision 2: Dark-first como padrão único do MVP

**What**: Tema claro fica fora de escopo até pós-piloto.

**Why**:
- Caso de uso real do treinador: sessões longas (40-60min na inbox de
  validação), ambiente controlado — dark reduz fadiga
- Caso de uso real do atleta: app usado pré/pós-treino (madrugada, fim
  de tarde), baixa luminosidade ambiente
- Estética dark é estado-da-arte em serious tools (Linear, Vercel, WHOOP)
- **Reduz pela metade** a superfície de testes visuais e componentes
- Sem custo de produto: usuários esperam toggle de tema, mas aceitam
  bem default dark se comunicado ("Tema claro em breve" na Config)

**Cost**: Atletas/treinadores em campo aberto sob sol direto terão
legibilidade reduzida. Mitigado: a maioria dos casos de campo é mobile e
de leitura rápida (não sessão profunda). Solução futura: toggle no perfil.

---

### Decision 3: Status dot do avatar — laranja, nunca lime

**What**: `pending_validation` passa a usar `warning-500` (laranja) em
todas as telas, removendo a opção lime.

**Why**:
- Lime é cor de **ação executável** (botão Aprovar, CTA, item ativo)
- Usar lime também para "estado pendente" cria ambiguidade cognitiva:
  "isso é clicável ou é só status?"
- Laranja é convencionalmente "atenção benigna" (Slack, GitHub, Linear
  usam laranja para notificações pendentes)
- Mantém lime "raro e valioso" — ao ver lime, usuário sabe que é ação

**Trade-off**: Treinador precisa aprender que dot laranja = sugestão da
IA esperando. Mitigação: tooltip no hover do avatar explicando ("3
sugestões pendentes").

---

### Decision 4: Princípio "Vermelho ≠ Categoria"

**What**: Cor `danger` é exclusiva para risco/erro/alerta. Categorização
(tipos de treino, fases, etc.) usa paleta categorical dedicada.

**Why**:
- O mockup do Calendar usou borda vermelha para "Treino combinado" —
  treinador olha e pensa "isso é problema?" antes de ler o texto
- Convenção universal de UI: vermelho = pare/cuidado/erro
- Quebra dessa convenção custa milisegundos de cognição em cada scan
- Multiplicado por dezenas de treinos por tela, vira ruído real

**Implementação**: paleta `categoricalColors` (cat1-cat8) separada para
todas as decisões de categorização. Vermelho fica reservado para
overtraining, lesão, rejeição, alertas críticos.

---

### Decision 5: Disciplina do Lime com hook de auditoria

**What**: Máximo 8 elementos lime por viewport, validado em dev mode com
`useLimeAudit()`.

**Why**:
- Mockup `/coach/athletes` chegou a ~15 elementos lime — começou a poluir
- Saturação dilui o sinal: se tudo é lime, nada é destacado
- Hook de auditoria evita drift incremental ao longo do tempo
  (PR a PR adicionando "só mais um lime" até saturar de novo)

**Implementação**:
```typescript
// dev-only, no-op em produção
function useLimeAudit() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const limeElements = document.querySelectorAll('[data-color="primary-500"]');
    if (limeElements.length > 8) {
      console.warn(`[LimeAudit] ${limeElements.length} elementos lime no viewport — limite recomendado: 8`);
    }
  });
}
```

---

### Decision 6: Escala tipográfica fechada (7 níveis)

**What**: 7 tokens canônicos (`xs`, `sm`, `base`, `lg`, `xl`, `2xl`,
`display`). Componentes não usam valores arbitrários.

**Why**:
- Mockups atuais misturaram 11/12/13/14/16/18/24/32px sem critério
- Escala fechada acelera decisões ("isso é título? `text-2xl`")
- Reduz inconsistências entre componentes feitos por pessoas diferentes
- Tabular nums em métricas evita "salto" visual em tabelas

**Cost**: Designers podem sentir falta de granularidade. Mitigação: 7
níveis cobrem 95% dos casos; raros casos especiais usam tokens custom
com justificativa documentada.

---

### Decision 7: Single source of truth temporal

**What**: Cada tela tem um date range global. Componentes filhos herdam.

**Why**:
- Insights atual tinha date range no header **e** dropdown "Últimas 4
  semanas" no card detalhado — qual prevalece?
- Treinador editando o global espera que tudo siga; encontrar exceções
  é frustrante
- Princípio geral de UX: um controle, um efeito

**Exceção legítima**: KPIs com janela fisiológica fixa (CTL é sempre 42d
por definição). Aí o range fixo aparece como **label informativo**, não
como controle interativo.

---

### Decision 8: Coluna "Forma" como enum fechado de 5 níveis

**What**: 5 variants determinísticos derivados do TSB.

**Why**:
- Mockup tinha "Excelente" em emerald, "Ótima" em lime — confusão sutil
- TSB é numérico contínuo, mas humanos pensam em 4-5 categorias
- Mapeamento determinístico (`formFromTSB(tsb)`) elimina decisão arbitrária
- Cores fixas por nível: treinador aprende a paleta uma vez

**Faixas**:
- `>= +15`: Excelente (lime) — atleta fresco para prova
- `+5 a +14`: Boa (emerald) — bem recuperado
- `-10 a +4`: Estável (azul) — equilíbrio neutro
- `-25 a -11`: Baixa (amber) — fadiga moderada
- `< -25`: Muito baixa (red) — risco

---

### Decision 9: Edge cases como stories obrigatórias

**What**: Todos os componentes de domínio precisam de stories cobrindo
8 edge cases mínimos.

**Why**:
- Mockups têm dados curados; produção tem ruído
- Nomes longos quebram células; atletas sem foto precisam fallback;
  TSS=0 precisa exibir "—", não "0"; etc.
- Storybook força esses cenários a serem pensados **antes** de virarem
  bugs no piloto

**Lista mínima de edge cases** (por componente, quando aplicável):
1. Texto longo (truncate + tooltip)
2. Sem imagem/foto (fallback)
3. Sem dados (placeholder, não "0")
4. Valor extremo positivo
5. Valor extremo negativo
6. Empty state (lista vazia)
7. Loading state (skeleton)
8. Error state (erro de fetch, retry)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Treinador-piloto preferir a paleta antiga (laranja) | Validar visualmente as 4 telas em sessão dedicada **antes** de codar; se rejeição forte, pivotar antes de gastar sprint |
| Lime saturar mesmo com audit hook | Audit hook é apenas warning, não bloqueante — mas adicionar revisão visual no PR template ("contou os limes?") |
| Light mode pedido cedo | Mensagem na Config "em breve" gerencia expectativa; medir frequência de pedido no piloto antes de priorizar |
| Migração de tokens quebrar UI | Substituir em commit único + visual regression test (Chromatic) cobrindo todas as telas antes do merge |
| Stories de edge cases consumirem muito tempo | Lista mínima de 8 por componente — não exaustivo, prático; foco nos que aparecem em produção real |

---

## Out of Scope (explicitamente)

- **Light mode**: pós-piloto, sem prazo
- **High contrast mode**: pós-piloto, mas dark default já alto contraste
- **Tema customizável por tenant** (white-label): tier premium futuro
- **Animações sofisticadas** (Framer Motion): pós-piloto, focar em UX
  base primeiro
- **Internationalization**: PT-BR fixo no MVP, expansão depois do Brasil
