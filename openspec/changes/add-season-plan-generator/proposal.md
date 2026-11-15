**Tamanho:** M · **Trilha:** Full

> Fatia **S2** do épico `add-season-plan-macrocycle`. Proposal, design (Decisões 2, 3b, 7, 9) e decisões
> vivem lá; esta change só delimita o escopo e os cenários que a fecham.

## Why

O treinador só aprova uma temporada se a proposta do motor for boa e reprodutível. Esta fatia entrega o
gerador determinístico e o validador como domínio puro, sem endpoint, testável isoladamente.

## What Changes

Tasks do épico: **1.3b, 1.5, 1.6 (só `TemplateMetodologiaRepository`), 1.9, 2.1–2.12**.

- `TemplateMetodologia` com **só o default global** (Q7): `tb_template_metodologia` com `assessoria_id`
  nulo para o default, seed de maratona
- `MacrocicloPlannerService` em `domain/macrociclo/`: fases por template e `RacePreparationRule`
  (8/10/12/16, Q4), curva de volume, descargas, longão, `TaperStrategy` aplicada uma vez, marcos,
  compressão em preparação curta
- `MacrocicloValidator`: rampa, longão/volume, cadência de descarga, janela de taper
- **Atleta em calibração é recusado** com motivo (Q9), no lugar de "marcar como estimado" (task 2.6)

## Critérios de aceite

- **Dado** o mesmo atleta, template e baseline, **quando** a geração roda duas vezes, **então** os valores
  são idênticos em todas as semanas.
- **Dado** uma prova-alvo a 20 semanas, **quando** gera, **então** há 20 semanas, cada uma com fase
  (BASE/BUILD/PEAK/TAPER/RACE_WEEK), `volumeAlvoKm`, `tssAlvo`, `longaoKm`, `descarga` e
  `origemValor = MOTOR`.
- **Dado** uma janela menor que o mínimo da distância, **quando** gera, **então** as fases são comprimidas
  e `preparacaoCurta = true`.
- **Dado** as semanas de taper, **quando** gera, **então** o `tssAlvo` já tem a curva da `TaperStrategy`,
  aplicada uma vez.
- **Dado** um atleta em calibração, **quando** gera, **então** a geração é recusada com o motivo.
- Cada regra do validador tem um caso que dispara e um que não dispara.

## Aberto antes de começar

- Ler no código de onde vem o estado de calibração do atleta e o critério de graduação; a mensagem da
  recusa depende dele.

## Dependências e rollout

- Depende de: `add-season-plan-model-integrity` (S1).
- Flag: nenhuma — domínio puro, sem caminho de entrada até a S3.
