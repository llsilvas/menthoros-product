# desenhar-bloco-sem-zona-conhecida — a laje cinza que ocupa 70% do gráfico

**Tamanho:** S · **Trilha:** Fast (mas o desenho vem antes do código — ver Why)
**Status:** criada 2026-08-19 — **não escalonada**, aguardando decisão de design
**Repos afetados:** `apps/menthoros-front` (somente)

> Origem: `polish-workout-profile-legibilidade` deixou este item **explicitamente fora** (Q1), porque
> não é acabamento. É a única das seis observações daquela navegação que não tem resposta óbvia.

## Why

Num treino contínuo sem zona por etapa, o bloco principal ocupa **70% da largura do gráfico** e é
desenhado como uma laje hachurada cinza. Ele é honesto — a hachura significa "não sei a zona" —, mas
o resultado é uma superfície morta no meio de uma tela que se apresenta como premium, e o treinador
olha o gráfico e não recebe nada de volta.

O que torna isto difícil, e o motivo de não ter entrado na change de acabamento: **cada saída afirma
uma coisa diferente sobre o que o sistema sabe.** Não é escolha estética.

## O que decidir

**(a) Aceitar a laje.** É a leitura honesta: não sabemos a zona, e o gráfico diz isso. Custo: a tela
mais importante do treinador fica visualmente vazia em boa parte dos treinos.

**(b) Colorir pela `zonaAlvo` do treino.** O perfil já **usa** esse campo para a altura do corpo,
desde `refactor-workout-profile-chart` — então a informação já está na tela, codificada em altura.
Colorir seria estender a mesma inferência para o canal de cor. Custo: cor é o canal que o
treinador lê como "zona desta etapa", e afirmá-la a partir da zona do *treino* é mais forte do que o
dado sustenta. Se for por aqui, a hachura tem de ficar por cima — cor **e** marca de estimativa.

**(c) Subdividir o bloco.** Quebrar visualmente o contínuo em fatias. Custo: troca uma laje por
várias, sem acrescentar informação — provavelmente pior.

**(d) Mudar o que o vazio comunica.** Em vez de pintar, usar o espaço: o bloco contínuo poderia
carregar a duração e o alvo em texto, já que tem espaço de sobra — a laje deixa de ser vazia sem
afirmar zona nenhuma. Não foi considerada na change anterior, e é a única que resolve o problema
sem tocar no que o gráfico afirma.

## Não faz parte

Sair do modo degradado de verdade — isso é **DEP-1** (intensidade estruturada por etapa) e a
conversão **bpm → zona** (DEP-2), ambas de backend. Esta change decide como desenhar enquanto elas
não existem, e some naturalmente se elas chegarem.

## Critérios de aceite

A definir junto com a decisão. O que **não** pode acontecer, independentemente da saída escolhida:

- **AC-1** — nenhuma etapa sem zona conhecida pode ser desenhada de forma indistinguível de uma com
  zona conhecida. A marca de estimativa é obrigatória em qualquer saída.
- **AC-2** — o chip `⚠ intensidade estimada` continua no header enquanto houver bloco estimado.

## Open Questions

**Q1 — quem decide.** É decisão de produto/design, não de implementação. A opção (d) foi levantada
depois da change anterior e ainda não foi avaliada por ninguém.

**Q2 — vale medir antes?** As duas changes anteriores mostraram que navegação em treinos reais acha
o que teste não acha. Antes de escolher, vale olhar a distribuição real: **que fração dos treinos em
produção cai no modo degradado?** Se for baixa, (a) é suficiente e esta change morre; se for a
maioria, o custo de (a) é alto e justifica (b) ou (d).
