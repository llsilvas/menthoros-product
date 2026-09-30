# Design — fix-adherence-count-until-today

## D1. Uma regra de "treino devido", aplicada no serviço

A consulta compartilhada ganha **teto de data** (`dataTreino <= :dataFim`) — sem ele, o banco devolve
semanas inteiras de futuro que o serviço descarta. O restante da regra fica no serviço, num predicado
único e testável:

```
devido(tp, hoje) = tp.tipoTreino != DESCANSO
                   && (tp.dataTreino < hoje || (tp.dataTreino == hoje && tp.treinoRealizado != null))
```

Por que não tudo em JPQL: o caso "hoje só se feito" depende do vínculo, e o predicado em Java é o mesmo
para `getAderenciaSemanal` e para o roster — uma regra, não duas cópias de SQL. O teto em SQL basta para
não trazer o futuro.

A consulta atual (`findComRealizadoByAtletaAndPeriodo`) é usada também por `ProgressaoTreinoServiceImpl` e
`RevisaoSemanalServiceImpl`. Para não mudar o comportamento deles nesta change, o teto entra como
**método novo** (`findComRealizadoByAtletaAndPeriodoAte`), e a consulta antiga fica para esses dois até a
change seguinte.

## D2. "Hoje" é o dia do atleta

`AtletaHojeResolver` (já injetado em `AtletaProgressServiceImpl`) resolve o dia no fuso do atleta, com
padrão America/Sao_Paulo. O `Clock` do servidor segue como fonte do instante (testável). O resolver lê o
`timezone` do atleta já carregado — não consulta o banco, então usá-lo por atleta no roster não custa.

## D3. Semanas sem nada devido não aparecem

`getAderenciaSemanal` agrupa só os devidos. Semana sem devido (futura, ou a atual antes do primeiro
vencimento) não gera entrada — o contrato "lista só semanas com plano" continua valendo, agora como
"semanas com algo devido". A lista vazia continua significando "sem dados".

## D4. Front

- A célula "Aderência · 4 sem" usa `aderencia4Semanas` do perfil (D5). `buildAdherenceWindow` deixa de
  calcular a janela — e com ela some o risco de a janela virar 5 semanas ou de o navegador ancorar outra
  semana que o servidor. O fallback do roster vale só enquanto o perfil não carregou; com perfil e sem
  nada devido, a célula mostra "Sem treino vencido na janela", nunca um número de fora dela.
- `describeWeek`: semana atual sem entrada → "Nada vencido ainda nesta semana" (não "Sem plano na
  semana", que seria falso: o plano existe).
- `buildAdherenceTile` e o texto "X de Y treinos planejados" não mudam.
- Tela do atleta (`buildAdherenceReading`): a semana corrente sem entrada deixa de virar `semPlano`;
  passa a um estado "nada vencido ainda". Lista vazia com plano existente não é "Sem plano aprovado".

## D5. Uma função para a janela de 4 semanas

`aderencia4Semanas(atleta, hoje)` = soma dos devidos e realizados da **semana atual + 3 anteriores**
(semanas ISO no fuso do atleta). É chamada pelo roster (`aderenciaPercentual`) e pelo perfil do coach
(campo novo `aderencia4Semanas`: `realizado`, `planejado`, `percentual`, ausente sem nada devido). Roster
e perfil concordam por construção; o front só exibe.

## D6. Estados sem nada devido

"Sem devido" é um estado, não zero: sem entrada no gráfico, sem campo no perfil, `null` no roster. Nenhum
consumidor converte ausência em 0%.

## Riscos (pré-mortem Codex incorporado)

- **Queda aparente de aderência.** Atletas que hoje aparecem inflados por semanas futuras (improvável,
  futuro só derruba) — sem risco. O inverso é o objetivo: o número sobe na segunda.
- **Consumidor externo do `/me/aderencia` que dependa das semanas futuras.** Mitigação: o front do atleta
  foi mapeado; nenhum outro consumidor conhecido.
- **Fuso:** servidor e atleta em dias diferentes perto da meia-noite. Mitigação: D2; o front não
  recalcula a janela (D5).
- **Vínculo best-effort:** treino feito sem vínculo com o planejado conta como não feito (anterior a esta
  change). Mitigação: teste que distingue "sem vínculo" de "sem execução" fica como follow-up da
  reconciliação.
- **Janela desliza:** a aderência de 4 semanas pode cair na segunda sem nova falta, quando uma semana
  boa sai da janela — comportamento esperado de janela móvel, não defeito.

## Rollback

Reverter os PRs. Sem migration, sem dado persistido novo.
