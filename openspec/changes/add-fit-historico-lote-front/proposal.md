**Tamanho:** M · **Trilha:** Full

# Proposal — add-fit-historico-lote-front

Tela do treinador para carregar vários `.fit` de um atleta novo, em fila, sobre o endpoint de
`add-fit-historico-lote`.

## Status

- **rascunho adiado (2026-11-01).** Não implementar. Aberto a partir do grilling de
  `add-fit-historico-lote`, que entregou só o endpoint. ROI (CPO): impacto 3 × confiança 30% ÷
  esforço 3 = 0,3, "Experimentar depois".
- **Gatilho para promover:** o treinador do pilot pedir a tela, ou mais de 3 atletas precisarem de
  histórico em um mês. Sem isso, o pilot usa `curl`.
- **Pré-requisitos:** `add-fit-historico-lote` mergeado em `develop`; cláusula de LGPD em vigor
  (task 0.1 daquela change).

## Why

O endpoint existe, mas exige `curl` e token. Com mais de um treinador ou atletas novos recorrentes,
o treinador precisa selecionar os arquivos, ver o progresso e conferir o resultado sem ferramenta
técnica.

## What Changes

Seção "Importar histórico" em `CoachAthleteProfilePage`: seleção de vários `.fit` (teto de 200 por
seleção), fila enviada em sequência (um arquivo por requisição, concorrência 1 por causa do
recálculo de carga), progresso "n de N", erro por arquivo sem interromper a fila, cancelar a fila e
resumo final (importados, já existentes, com erro e o motivo).

Non-goals: `.zip` (extração no navegador só se o pilot mostrar que extrair atrapalha; exige
biblioteca nova, a justificar); exclusão de treino importado; envio feito pelo atleta em lote.

## Critérios de aceite

- **CA6 — Fila sequencial com progresso.** Given 30 arquivos selecionados, When o treinador inicia
  a importação, Then os arquivos são enviados um por vez, a tela mostra "n de 30", e ao final mostra
  importados, já existentes e com erro (nome do arquivo e motivo).
- **CA6b — Aviso e período coberto.** Given a seção "Importar histórico", When o treinador a abre,
  Then vê o aviso "Confirme que tem autorização do atleta para carregar estes dados" e a orientação
  de obter os arquivos; e Given a importação concluída, Then o resumo mostra o período coberto
  (data do treino mais antigo e do mais recente e o número de semanas) e que a importação não tem
  desfazer. O aviso é lembrete; a base legal é a cláusula contratual.
- **CA3 (tela) — Arquivo inválido.** Given um arquivo inválido na fila, When o servidor devolve 422,
  Then a fila continua com os demais.

## Métrica de sucesso

Tempo do treinador na tela para chegar a ≥ 6 semanas de histórico ≤ 5 minutos (selecionar e conferir
o resumo), mais a métrica ponta a ponta de `add-fit-historico-lote`.

## Referências

- `add-fit-historico-lote` (endpoint, decisões D1–D3, risco "sem desfazer")
- `fitUploadResultAdapter` do atleta (reaproveitar)
