# athlete-share-cards-esteira — card de compartilhamento para corrida na esteira

**Tamanho:** S · **Trilha:** Fast (só front, consome contrato de `add-activity-treadmill-flag` sem mudá-lo)
**Status:** proposta
**Criado:** 2026-11-09
**Repos afetados:** `apps/menthoros-front`
**Depende de:** `add-activity-treadmill-flag` (backend) em produção

> Referência visual: artboard "Compartilhar treino — cards sociais", seção **Esteira (sem GPS)**,
> `v2 I · Esteira` (aprovado pelo founder em 2026-11-09). O card `v2 J · Curva` é
> `athlete-share-cards-curva`, depois do gate de adoção definido em `add-activity-treadmill-flag`.

## Why

Corrida na esteira não tem trajeto, então perde Rota e Foto e fica com Plano × realizado, Parciais e
Semana. O founder confirma que vários atletas do pilot treinam na esteira com frequência: é o treino
que pior se compartilha hoje. O card Esteira dá a ele um card próprio, barato (só um booleano novo no
contrato).

## Escopo

1. **Modelo `esteira`** (v2 I): selo "ESTEIRA" com ícone, modelo do relógio, tipo do treino, km em
   destaque, pace médio grande, três blocos (Tempo, FC média, TSS) e assinatura. Disponível quando
   `realizado.esteira === true`.
2. **Picker:** rótulo "Esteira"; ordem `plano, parciais, rota, stickers, esteira, semana`; formato
   padrão story.
3. **"Mostrar FC"** passa a valer para `esteira` (esconde o bloco de FC média).
4. **Dados ausentes:** sem distância, o destaque vira o tempo; sem TSS ou FC, o bloco some e os demais
   ocupam a linha.
5. **Foto na esteira** (pedido do founder em 2026-11-09, revertendo o "fora do escopo" anterior): o
   modelo Foto fica disponível para treino `esteira = true` sem trajeto; o adesivo do trajeto vira o
   selo "ESTEIRA" e, sem mapa, o card não pede o consentimento de trajeto. Ordem com esteira sem GPS:
   `plano, parciais, stickers, esteira, semana`.

## Fora do escopo

- Card Curva — `athlete-share-cards-curva`.
- Inclinação da esteira.

## Critérios de aceite

**CA1 — Card Esteira**
> **Dado** um realizado com `esteira: true`, 10,0 km, 50:30, FC média 146 e TSS 58
> **Quando** o atleta abre Compartilhar e escolhe "Esteira"
> **Então** o picker lista "Esteira" na ordem do escopo (o modelo inicial segue a regra atual,
> `availableModels[0]`), o formato muda para story e o card mostra o selo "ESTEIRA", "10,0 KM", o pace
> "5:03 /KM", tempo, FC média e TSS. Com `esteira: false` ou ausente, a opção não aparece.

**CA2 — Dados ausentes**
> **Dado** um realizado de esteira sem `distanciaKm` (ou sem `tssCalculado`, ou sem `fcMedia`)
> **Quando** o card Esteira é gerado
> **Então** sem distância o destaque é o tempo e o pace some; sem TSS ou FC o bloco correspondente some.

**CA3 — Mostrar FC**
> **Dado** o modelo `esteira`
> **Quando** "Mostrar FC" é desligado
> **Então** o bloco de FC média some do card e do PNG.

**CA4 — Atribuição Garmin**
> **Dado** um realizado de esteira com fonte Garmin
> **Quando** o card é gerado
> **Então** mostra "GARMIN {deviceName}" como os demais cards; com fonte manual ou intervals.icu, não.

**CA7 — Foto na esteira**
> **Dado** um realizado com `esteira: true` e sem trajeto
> **Quando** o atleta escolhe "Foto" e uma imagem do aparelho
> **Então** os adesivos mostram distância e o selo "ESTEIRA" (sem adesivo de trajeto), o consentimento
> de trajeto não é consultado e o PNG é gerado.

**CA5 — E2E**
> **Dado** um treino de esteira mockado no formato real da API
> **Quando** o atleta abre Compartilhar, escolhe "Esteira" e clica Salvar
> **Então** baixa um PNG 1080 × 1920.

## Métrica de sucesso

- **Gate da Curva.** Coorte: atletas do pilot com ≥ 1 treino `esteira = true` de fonte Garmin nas 4
  semanas após o deploy (SQL em `tb_treino_realizado`). Ação contada: clicar **Salvar** ou
  **Compartilhar** com o modelo Esteira selecionado — a prévia renderiza sozinha
  (`useShareImage`) e não conta. Sem instrumentação (`athlete-share-cards-extra`), a evidência é o
  founder perguntar a cada atleta da coorte, uma vez, se salvou ou compartilhou um card Esteira;
  quem não responde conta como não. Passa com ≥ 30% da coorte; abaixo disso, série e Curva não
  entram. Registro em `tasks.md` 2.4.
- Para o treinador: a hipótese de aquisição da trilha; critério de parada herdado de
  `add-activity-gps-trace`.

## Open Questions & Assumptions

- **Aberto:** ícone da esteira. Sem dependência nova: SVG inline equivalente ao do artboard.
- **Premissa:** `tssCalculado` e `fcMedia` já chegam em `GET /me/treinos` para treinos de esteira
  (vêm do mesmo `.fit`).

## Riscos e mitigações

- **Selo errado.** O backend só liga o flag com evidência positiva (`add-activity-treadmill-flag`, D2).
- **Contagem manual do gate não acontecer.** Registrar a data de deploy no `tasks.md` e lembrar o
  founder na revisão de sprint seguinte às 4 semanas.
