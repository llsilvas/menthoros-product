# Tasks — add-aviso-mensalidade

Pré-requisito: `add-contrato-atleta-mensalidade` mergeada em `develop` nos dois repos. Validação
por bloco: backend `./mvnw clean test`; frontend `npm run lint && npm run build && npm test`.
Branch `feature/add-aviso-mensalidade` nos dois repos antes de qualquer código.

## 0. Backend — limpeza adiada da change 1

- [ ] 0.1 Migration `V97__drop_billing_columns_from_tb_atleta.sql` (`DROP COLUMN
      tipo_plano_atleta, data_vencimento_plano`). Só depois de `add-contrato-atleta-mensalidade`
      estar em produção sem leitores legados. **Gate:** migration destrutiva — confirmar com o
      usuário antes de commitar.
      *verify:* IT de migração; suíte verde.

## 1. Backend — Radar

- [ ] 1.1 `MotivoAtencao.MENSALIDADE_VENCIDA` (peso 25, ação sugerida) e
      `CoachAttentionSignalEvaluator.avaliarMensalidadeVencida` (design D6). Ligar no ponto onde
      os demais sinais são montados, reusando a query de mensalidades em aberto da change 1.
      *verify:* CA8, CA9, CA11 — teste do evaluator (severidade por atraso, evidência sem valor)
      e teste de montagem do Radar.

## 2. Backend — e-mail ao atleta

- [ ] 2.1 Migration `V98__add_avisos_to_tb_mensalidade.sql`; campos em `Mensalidade`;
      `MensalidadeOutputDto` e `ContratoAtletaOutputDto` expõem as datas e `avisoAtletaAtivo`.
      *verify:* IT de migração; serialização.
- [ ] 2.2 `AvisoMensalidadePolicy` (design D3, pura).
      *verify:* teste parametrizado — CA4, CA5, CA6, janela de 7 dias, dia do vencimento.
- [ ] 2.3 Templates `mensalidade-aviso-previo.{html,txt}` e `mensalidade-aviso-vencimento.{html,txt}`
      (design D5) + `MensalidadeAvisoEmailBuilder` (assunto, valores BRL, nome da assessoria).
      *verify:* teste de renderização — placeholders todos preenchidos, valor "R$ 200,00".
- [ ] 2.4 `MensalidadeAvisoScheduler` (`${mensalidade.aviso.cron:0 0 8 * * *}`, por tenant com `TenantContext`,
      design D4).
      *verify:* CA1, CA2, CA3, CA7 com `EmailSender` mockado; suíte completa verde.

## 3. Frontend

- [ ] 3.1 Motivo MENSALIDADE_VENCIDA no mapa de labels/ícones da fila de atenção; tipos.
      *verify:* teste da página com item do novo motivo.
- [ ] 3.2 Toggle "Avisar o atleta por e-mail" no formulário do contrato e "aviso enviado em …"
      por mensalidade em `CobrancaAtletaSection`.
      *verify:* CA10 — teste RTL do toggle persistindo via `PUT`; lint/build/test.

## 4. Integração e encerramento

- [ ] 4.1 Confirmar `SmtpEmailSender` ativo no Railway `develop`; gates completos; `/qa`.
- [ ] 4.2 Validação manual: mensalidade com vencimento forçado para daqui a 7 dias, rodar o job,
      conferir e-mail recebido e coluna gravada; Radar com atleta vencido.
