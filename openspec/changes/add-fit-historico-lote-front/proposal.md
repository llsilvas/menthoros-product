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

- Revisão de usabilidade (2026-11-01): tela desenhada em três estados (antes de enviar, enviando,
  resumo). Canvas: https://claude.ai/artifact/G5CMiZCkAoKntc698ZtMfb. Mudanças em relação ao
  rascunho original: vira **dialog** (não seção do perfil) com dois pontos de entrada; aviso de
  autorização e "sem desfazer" movidos para **antes** do envio; pré-voo da seleção (arquivos
  ignorados, período estimado); retentativa só dos arquivos com erro; status por texto e cor.
  Continua adiada: o gatilho não mudou.

## Why

O endpoint existe, mas exige `curl` e token. Com mais de um treinador ou atletas novos recorrentes,
o treinador precisa selecionar os arquivos, ver o progresso e conferir o resultado sem ferramenta
técnica.

## What Changes

**Onde:** dialog `FitHistoricoDialog` sobre `CoachDialog` (mesmo padrão de `PlanosDialog` e
`AtletaDialog`), não um `SectionCard` no perfil. A ação é de onboarding, uma vez por atleta; um card
permanente ficaria vazio depois e o perfil já tem dez cards. Dois pontos de entrada abrem o mesmo
dialog:

- Menu "Ações" da lista em `/coach/athletes` (`CoachAthletesPage`): item "Importar histórico .fit",
  entre "Sincronizar Strava" e "Projeção de prova", como `RosterActionType` novo (`'fit-historico'`).
- Cabeçalho de `CoachAthleteProfilePage`: botão ao lado de "Preencher onboarding".

Ver o que foi importado continua no card "Treinos recentes" do perfil; a ação "Ver treinos do
atleta" do resumo leva para lá.

**O dialog, em três estados:**

1. **Antes de enviar.** Aviso de autorização e de "sem desfazer" acima do seletor, com link para
   como obter os arquivos no Garmin Connect. Seleção de vários `.fit` (teto de 200, 10 MB cada, sem
   `.zip`). Lista do que será enviado: arquivo que não é `.fit` aparece como ignorado; período
   estimado pelos nomes ou datas dos arquivos, marcado como estimativa. Botão primário com a contagem
   ("Importar N arquivos"), desabilitado sem arquivo válido.
2. **Enviando.** Fila sequencial (um arquivo por requisição, concorrência 1 por causa do recálculo
   de carga). Progresso "n de N", nome do arquivo atual, tempo restante estimado (média dos já
   enviados), contadores parciais (importados, já existiam, com erro) e lista dos últimos arquivos
   com status por texto e cor. Erro por arquivo não interrompe a fila. Fechar o dialog fica
   bloqueado (`disableClose`); "Cancelar restante" interrompe após o arquivo atual e deixa claro que
   os já importados permanecem.
3. **Resumo.** Contadores finais; período coberto (treino mais antigo, mais recente, número de
   semanas) com selo quando ≥ 6 semanas; lista dos arquivos com erro e o motivo em PT-BR; nota de que
   reenviar é seguro (idempotente, CA2 do backend); lembrete de "sem desfazer" com caminho para
   suporte. Ações: "Tentar os N com erro" (reenvia só esses) e "Ver treinos do atleta" (vai ao
   perfil). Ao fechar, a lista ou o perfil recarrega o roster/perfil.

Non-goals: `.zip` (extração no navegador só se o pilot mostrar que extrair atrapalha; exige
biblioteca nova, a justificar); exclusão de treino importado; envio feito pelo atleta em lote.

## Critérios de aceite

- **CA6 — Fila sequencial com progresso.** Given 30 arquivos selecionados, When o treinador inicia
  a importação, Then os arquivos são enviados um por vez, a tela mostra "n de 30", e ao final mostra
  importados, já existentes e com erro (nome do arquivo e motivo).
- **CA6b — Aviso antes do envio e período coberto.** Given o dialog "Importar histórico", When o
  treinador o abre, Then vê, antes do seletor, o aviso "Confirme que tem autorização do atleta para
  carregar estes dados", a nota de que a importação não tem desfazer e a orientação de obter os
  arquivos; e Given a importação concluída, Then o resumo mostra o período coberto (data do treino
  mais antigo e do mais recente e o número de semanas) e repete que não há desfazer. O aviso é
  lembrete; a base legal é a cláusula contratual.
- **CA6c — Pré-voo da seleção.** Given arquivos selecionados, When a lista é exibida, Then arquivos
  que não são `.fit` aparecem como ignorados e não entram na fila, e o botão primário mostra a
  contagem dos que serão enviados; Given nenhum arquivo válido, Then o botão fica desabilitado.
- **CA6d — Retentativa só dos com erro.** Given o resumo com arquivos com erro, When o treinador
  aciona "Tentar os N com erro", Then só esses arquivos voltam para a fila.
- **CA6e — Cancelar preserva o que entrou.** Given a fila em andamento, When o treinador cancela,
  Then o envio para após o arquivo atual, e o resumo mostra o que foi importado até ali; e fechar o
  dialog fica bloqueado enquanto há arquivo em envio.
- **CA6f — Dois pontos de entrada.** Given a lista `/coach/athletes`, When o treinador abre o menu
  "Ações" de um atleta, Then vê "Importar histórico .fit"; e Given o perfil do atleta, Then vê o
  botão no cabeçalho; ambos abrem o mesmo dialog para aquele atleta.
- **CA3 (tela) — Arquivo inválido.** Given um arquivo inválido na fila, When o servidor devolve 422,
  Then a fila continua com os demais e o arquivo aparece no resumo com o motivo.

## Métrica de sucesso

Tempo do treinador na tela para chegar a ≥ 6 semanas de histórico ≤ 5 minutos (selecionar e conferir
o resumo), mais a métrica ponta a ponta de `add-fit-historico-lote`.

## Open Questions & Assumptions

- **Decidido:** dialog com dois pontos de entrada, não card no perfil (ver "Onde" acima).
- **Depende da medição da task 1.3 do backend:** o tempo por arquivo define se a estimativa de
  tempo restante e o cancelamento são essenciais ou detalhe. Acima de ~1 s por arquivo, 100 arquivos
  passam de 1,5 min no dialog.
- **Período estimado pelos nomes** só funciona se o Garmin exportar com data no nome ou se o front
  ler o header do `.fit` no navegador. Se nenhum dos dois valer, o pré-voo mostra só contagem e
  tamanho.
- **Mobile:** não desenhado. A seleção de muitos arquivos em celular é improvável para este fluxo.

## Referências

- `add-fit-historico-lote` (endpoint, decisões D1–D3, risco "sem desfazer")
- `fitUploadResultAdapter` do atleta (reaproveitar)
