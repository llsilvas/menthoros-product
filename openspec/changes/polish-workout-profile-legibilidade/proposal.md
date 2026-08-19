# polish-workout-profile-legibilidade — o perfil está legível, mas ainda afirma coisa falsa

**Tamanho:** S · **Trilha:** Fast
**Status:** criada 2026-08-19 — aguardando DoR
**Repos afetados:** `apps/menthoros-front` (somente)

> Origem: navegação de verificação em quatro treinos reais depois do merge de
> `refactor-workout-profile-chart` (`menthoros-front` #80, arquivada 2026-08-19). O encoding entregue
> funciona — num intervalado dá para ler "seis tiros fortes com recuperação entre eles" sem ler
> texto, que era o objetivo. O que a navegação colheu foi acabamento, e **dois defeitos que fazem o
> gráfico afirmar o que não é verdade**.

## Why

Três dos seis achados são estéticos e dois são de honestidade — e são estes que justificam a change
sair agora, não no próximo ciclo.

**O gráfico ignora uma zona que está escrita.** Um treino com `descricaoEtapa` = "Corrida contínua
**Z2**" renderiza hachurado, como "não sei a zona", e com a altura errada. Verificado: sai como
`Z3 / unknown / degraded`. O `zonaDeclarada` lê `fcAlvoEtapa` e `intensidade`, mas não `descricao` —
então o dado estava ali, escrito pelo treinador, e foi descartado. É a mesma classe de erro que a
change anterior existiu para corrigir: afirmar o que não se sabe tendo o dado à mão.

**A razão trabalho:recuperação engana.** Os treinos reais mostraram `11:4`, `3:8` e `7:3` — nenhuma
delas é como um treinador enuncia um treino. A causa é estrutural: sem `repeat`, o cálculo cai no
fallback **global**, que conta aquecimento e desaquecimento como "recuperação". Num intervalado isso
produziu `3:8`, sugerindo que o atleta descansa quase três vezes mais do que corre forte, enquanto o
gráfico ao lado mostrava o contrário. A spec da change anterior já avisava que "a razão global de um
longo com sprint final não diz nada" — e o fallback global foi implementado mesmo assim.

Os outros quatro custam confiança de outra forma: um eixo que troca de unidade no meio, um rótulo
que atravessa a borda do card, `REC` repetido seis vezes, e uma laje cinza ocupando 70% da área.
Numa superfície que se apresenta como premium, esse acabamento é o que separa "ferramenta" de
"protótipo".

## What Changes

1. **Zona declarada na descrição passa a contar.** `zonaDeclarada` lê também `descricao` (e o
   `ritmoAlvo`, pela mesma razão). Ordem de precedência declarada: `fcAlvo` → `intensidade` →
   `descricao`. Sai do modo degradado todo treino cuja zona já estava escrita em prosa.
2. **A razão trabalho:recuperação some quando não há série.** Sem `repeat`, retorna `null` e o chip
   não renderiza. Uma métrica ausente é melhor que uma métrica que mente — e a razão só tem
   significado dentro de uma série, que é como o treinador enuncia o treino.
3. **Eixo X com unidade única.** Acima de 60min, **todos** os ticks em `h:mm` (`0:00`, `0:10`, …,
   `1:15`), nunca minutos crus misturados com `1:00`. E a supressão do penúltimo tick passa a usar
   `<= passo/2`, corrigindo a colisão de `1:10` com `1:15`.
4. **Rótulo não vaza o container.** O texto do bloco fica contido na largura dele; abaixo do que
   couber, cai para a abreviação ou some, pela cadeia que já existe.
5. **Agrupar série expandida sem `blocoId`.** Quando o backend entrega N repetições planas, detectar
   a janela repetida por assinatura (tipo + duração + alvo) e emitir `repeat`, como
   `itensFromEtapas` já faz no editor. Ganha-se o bracket `n×` e cala-se o `REC` repetido.

### Não faz parte desta change

O **bloco cinza dominante** (achado #4) fica fora: é decisão de design, não acabamento. Um treino
contínuo sem zona conhecida ocupa 70% do gráfico com uma laje hachurada, e as saídas possíveis —
subdividir visualmente, usar a zona-alvo do treino para colorir, ou aceitar a laje — têm implicações
diferentes sobre o que o gráfico está afirmando. Merece proposta própria, com o desenho antes do
código. Ver **Open Questions**.

Também fora: DEP-1, DEP-2, DEP-3, DEP-5 e a conversão de **bpm → zona**, todos herdados da change
anterior. A #5 desta change reduz o sintoma, não a causa.

## Critérios de aceite

- **AC-1** — *Dado* uma etapa com `descricaoEtapa` contendo "Z2" e sem `fcAlvoEtapa`, *quando* o
  perfil é montado, *então* o bloco sai com `zone: 'Z2'` e `confidence: 'prescribed'`, e o perfil
  não está degradado por causa dele.
- **AC-2** — *Dado* um perfil sem nenhum bloco com `repeat`, *então* `workToRecoveryRatio` é `null`
  e o chip de razão não é renderizado.
- **AC-3** — *Dado* um treino de 75min, *então* todos os rótulos do eixo X usam o mesmo formato
  (`0:00 … 1:15`), e não existe par de ticks a menos de meio passo de distância.
- **AC-4** — *Dado* um bloco estreito com rótulo, *quando* renderizado no navegador, *então* a caixa
  do texto está contida na caixa do bloco (verificação em Playwright — jsdom não mede).
- **AC-5** — *Dado* um treino com 6 pares idênticos de esforço+recuperação sem `blocoId`, *então*
  existe exatamente um bracket `6×` e apenas a primeira repetição tem rótulo de bloco.

## Métrica de sucesso

Qualitativa, pelo mesmo motivo da change anterior — não há canal de analytics no front. O critério é
a próxima navegação de verificação nos mesmos quatro treinos: nenhum chip exibindo razão sem série,
nenhum eixo com duas unidades, nenhum rótulo fora do container, e o treino "Corrida contínua Z2"
saindo colorido em vez de hachurado.

## Open Questions & Assumptions

**Q1 — o bloco cinza dominante.** Fora do escopo, mas precisa de dono. As opções são: (a) aceitar a
laje, que é a leitura honesta de "não sei"; (b) colorir pelo `zonaAlvo` do treino, assumindo que ela
vale para o corpo — mais bonito, e uma afirmação mais forte do que o dado sustenta; (c) subdividir o
bloco em fatias com a mesma altura, o que só troca uma laje por várias. Nenhuma é obviamente certa.

**A1 — detecção de série por assinatura (#5) é heurística.** Agrupar por "tipo + duração + alvo
iguais, alternando" acerta o caso comum e pode errar num treino que legitimamente repete um par sem
ser uma série. O `itensFromEtapas` já corre esse risco no editor, e a consequência aqui é menor —
um bracket a mais, não um dado gravado errado. **Premissa:** aceitável, com o mesmo critério de
janela usado no editor, para não haver duas heurísticas divergentes.

**A2 — a mudança do eixo para `h:mm` altera o AC-4 da spec anterior**, que fixava `0, 5, …, 40` para
um treino de 40min. Abaixo de 60min nada muda (segue em minutos crus); a mudança vale só acima de
uma hora, onde hoje as duas unidades convivem. O teste do AC-4 antigo continua válido.
