# reorganizar-listagem-provas-atleta — ordem cronológica e hierarquia visual na lista de provas

**Tamanho:** S · **Trilha:** Fast
**Repos afetados:** `apps/menthoros-front` (somente)

## Por quê

Na tela "Minhas provas" (`AthleteRacesPage.tsx`), o usuário notou que a próxima prova de verdade não
aparecia no topo da lista.

**Causa raiz, confirmada em `raceAdapters.ts:69`:**

```ts
export function buildAthleteRaceList(provas: Prova[], hoje: Date = new Date()): AthleteRaceView[] {
  return provas
    .map((p) => buildAthleteRaceView(p, hoje))
    .sort((a, b) => Number(b.alvo) - Number(a.alvo) || a.dataIso.localeCompare(b.dataIso));
}
```

O comparator põe **toda prova-alvo primeiro**, independente da data, e ordena o resto só por data
**ascendente**. Isso tem dois efeitos indesejados:

1. Uma prova-alvo distante no futuro sempre ocupa o topo, mesmo havendo uma prova não-alvo mais
   próxima — contraria a expectativa de "o que vem primeiro no calendário".
2. Entre as não-alvo, ordenar por data ascendente põe provas **passadas** (datas menores) antes de
   provas **futuras** (datas maiores) — uma prova já realizada aparece antes da próxima prova de
   verdade.

Não há bug no backend: `ProvaServiceImpl.listarProvas` já devolve por `dataProva` ascendente; é o
front que reordena com o comparator acima antes de renderizar. Também não há bug na faixa "Prova
nesta semana" (`selectRaceThisWeek`) nem no widget "Próxima prova" (`buildProximaProva`) — ambos já
filtram só futuras e ordenam por data. O problema é isolado à lista completa de `AthleteRacesPage`.

Visualmente, hoje só existe um nível de destaque: `destaque = race.alvo && !race.realizada` (borda
lime + ícone + label "PROVA-ALVO"). Provas passadas (`realizada`) só diferem por um chip "Realizada"
— o card em si tem a mesma cor de uma prova futura comum.

## O que muda

1. **Ordem cronológica vence sobre alvo** (decisão confirmada com o usuário 2026-10-01): a lista
   passa a ordenar por `dataProva` — futuras ascendente (a mais próxima no topo), passadas depois,
   como histórico (descendente — a mais recente primeiro). A prova-alvo **não pula mais de posição**
   por ser alvo; ela aparece onde cair cronologicamente, com destaque visual (ver item 2).
2. **Hierarquia visual por categoria do card**, substituindo o único nível de destaque atual:
   - **Prova-alvo** (`provaAlvo=true`, não realizada): destaque maior — mantém a borda lime +
     ícone + label atuais (já existe, reaproveitado).
   - **Próxima prova por data, quando NÃO é a prova-alvo**: cor própria (`semantic.info`, azul) —
     categoria nova.
   - **Demais provas futuras**: estilo neutro padrão (como hoje, sem destaque).
   - **Provas passadas (histórico)**: cor esmaecida, visualmente distinta das futuras — hoje elas têm
     a mesma cor de card que uma futura comum, só com um chip "Realizada" a mais.
3. Se a prova-alvo também for a mais próxima por data, ela recebe apenas o destaque de alvo (não
   precisa de uma terceira cor acumulada) — ver CA4.

## Fora do escopo

- Qualquer mudança de contrato de API, DTO ou backend — `ProvaServiceImpl`/`ProvaController` não são
  tocados; o problema não está lá.
- A faixa "Prova nesta semana" do Plano e o widget "Próxima prova" da Home — já corretos.
- Paginação ou filtros na listagem (não pedido, não há indício de necessidade com o volume atual).
- Provas canceladas (`statusProva=CANCELADA`): continuam aparecendo como hoje (sem tratamento visual
  dedicado) — ver Open Questions.

## Critérios de aceite

- **CA1 — Ordem cronológica.** Dado um atleta com provas futuras e passadas, quando a lista é
  renderizada, então a ordem é: futuras ascendente por `dataProva` (mais próxima primeiro), seguidas
  das passadas descendente por `dataProva` (mais recente primeiro) — nenhuma passada aparece antes de
  uma futura.
- **CA2 — Alvo não pula posição.** Dado uma prova-alvo futura que NÃO é a mais próxima por data,
  quando a lista é renderizada, então ela aparece na posição cronológica correta (não no topo), com
  o destaque visual de alvo.
- **CA3 — Próxima não-alvo tem cor própria.** Dado que a prova mais próxima por data não é a alvo,
  quando a lista é renderizada, então esse card usa a cor dedicada (`semantic.info`), distinta da cor
  de alvo e da cor neutra padrão.
- **CA4 — Sem acúmulo de destaque.** Dado que a prova-alvo é também a mais próxima por data, quando a
  lista é renderizada, então o card recebe só o destaque de alvo (não os dois estilos sobrepostos).
- **CA5 — Histórico visualmente distinto.** Dado uma prova passada (`realizada=true`), quando a lista
  é renderizada, então o card usa uma cor esmaecida, diferente da cor neutra das futuras e das cores
  de alvo/próxima.
- **CA6 — Sem alvo nem próxima não-alvo coincidentes, nada quebra.** Dado um atleta sem prova-alvo
  cadastrada, quando a lista é renderizada, então a prova mais próxima por data recebe a cor de
  "próxima" normalmente, sem erro nem fallback para o destaque de alvo.

## Métrica de sucesso

O atleta abre "Minhas provas" e identifica em menos de 2 segundos qual é a próxima prova, sem
precisar ler datas uma a uma — validado por teste de componente cobrindo os 4 critérios de ordem/cor
acima (não há instrumentação de produto para medir tempo de leitura; a metodologia é correção
funcional comprovada por teste, não métrica de uso).

## Open Questions & Assumptions

- **Provas canceladas:** ficam fora de escopo desta change (mantém comportamento atual). Se depois
  disso ficar confuso ter uma cancelada misturada no histórico ou nas futuras, é change própria.
- **Múltiplas provas-alvo:** o modelo permite mais de uma `provaAlvo=true` simultânea (visto em
  `buscarProximaProva` no backend, que pega a primeira alvo entre as futuras). Assumido: todas as
  `provaAlvo=true` futuras recebem o destaque de alvo — não só a mais próxima entre elas. Sem
  evidência de que isso seja comum na base; revisar se aparecer caso real com mais de uma.
