# Design — add-aviso-mensalidade

## Context

Radar: `CoachAttentionSignalEvaluator` produz `SinalAtencao(MotivoAtencao, Severidade,
evidencias, rationale, sources)` por sinal; `MotivoAtencao` carrega peso e ação sugerida;
`SugestaoCoachGeneratorJob` e o DTO `CoachAttentionItemOutputDto` levam isso ao front
(`CoachAttentionQueuePage`).

E-mail: `EmailSender` (SMTP em produção, arquivo em dev), `EmailMessage(to, subject, html, text)`,
`EmailTemplateRenderer.render(nome, valores)` com templates em `templates/email/`
(`athlete-invite`, `founding-invite`).

Change 1 entrega `Mensalidade`, `ContratoAtleta.avisoAtletaAtivo`, `MensalidadeRenovacaoScheduler`
(por tenant, 4h) e deixa as colunas legadas de `tb_atleta` órfãs. Migrations desta change: `V97`
(DROP adiado) e `V98`.

## Goals / Non-Goals

**Goals:** motivo de atenção sem valor; dois e-mails idempotentes ao atleta; toggle por contrato.
**Non-Goals:** aviso pós-vencimento, WhatsApp, push, e-mail ao treinador, fuso por assessoria.

## Decisions

### D1. Idempotência por coluna na mensalidade, não por tabela de notificação

Duas colunas (`aviso_previo_enviado_em`, `aviso_vencimento_enviado_em`) em `tb_mensalidade`. Uma
tabela `PaymentNotification` (roadmap) daria histórico de envios que ninguém consome; a coluna
responde a única pergunta que importa ("já mandei?") e aparece direto no DTO para o proprietário.

### D2. Janela, não data exata

Aviso prévio dispara em qualquer dia de `[vencimento−7, vencimento−1]` sem envio anterior; aviso
do dia só em `vencimento`. Job que falha um dia recupera no seguinte; job que falha o dia do
vencimento não manda o aviso do dia atrasado (viraria cobrança). Sem envio após vencido.

### D3. Regra de elegibilidade num método puro

`AvisoMensalidadePolicy.decidir(mensalidade, contrato, atletaTemEmail, hoje)` →
`Optional<TipoAviso>` (`PREVIO` | `VENCIMENTO`). Testável sem Spring; o scheduler só itera e
envia. Elegível = EM_ABERTO ∧ contrato ativo ∧ `avisoAtletaAtivo` ∧ `valor != null` ∧ e-mail.

### D4. Ordem envio → gravação, falha isolada

`EmailSender.send` primeiro; só com sucesso grava a coluna e salva. Exceção é logada com
`mensalidadeId` e o loop continua. Sem retry próprio: o job de amanhã é o retry (D2).

### D5. Conteúdo do e-mail

Assunto: "Sua mensalidade da {assessoria} vence em {data}" / "vence hoje". Corpo: nome do atleta,
nome da assessoria, valor formatado em BRL, data, frase "Combine o pagamento diretamente com
seu treinador." Sem link, sem Pix, sem descadastro. Assessoria = `Assessoria.nome` pelo
`tenantId` da mensalidade.

### D6. Sinal do Radar

`avaliarMensalidadeVencida(List<LocalDate> vencidasEmAberto, LocalDate hoje)`: vazio → sem
sinal; maior atraso ≤ 7 dias → MEDIA; > 7 → ALTA. Evidência: "Mensalidade vencida há N dias
(dd MMM)". Peso 25. A lista vem da mesma query de status da change 1
(`findEmAbertoByTenantIdAndAtletaIdIn`), sem consulta nova.

### D7. Front mínimo

Label "Mensalidade vencida" e ícone no mapa de motivos; toggle no formulário do contrato; texto
"aviso enviado em dd/MM" ao lado da mensalidade. Sem tela nova.

## Risks / Trade-offs

- **Fuso:** 8h do servidor. Aceito para v1.
- **Sem descadastro no e-mail:** o proprietário controla por contrato; volume baixo. Se a base
  crescer, link de descadastro vira change.
- **Radar peso 25:** abaixo de aderência, acima de inatividade. Ajustável sem migração.

## Migration Plan

1. Backend: V98 + policy + scheduler + templates + sinal (tests verdes). PR → develop.
2. Front: labels + toggle + texto. PR → develop.

## Open Questions

- Confirmar `SmtpEmailSender` ativo em produção antes do merge.
