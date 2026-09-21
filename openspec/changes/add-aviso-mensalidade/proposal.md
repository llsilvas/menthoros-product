# add-aviso-mensalidade — O Radar avisa o treinador e o atleta recebe e-mail antes de vencer

**Tamanho:** M · **Trilha:** Full

> Full porque toca os dois repositórios, adiciona colunas em `tb_mensalidade`, cria um job
> por tenant que envia e-mail a atletas (canal externo, idempotência obrigatória) e um novo
> motivo de atenção no Radar.

## Status

Segunda change da trilha de cobrança do atleta, nascida do grilling de 2026-09-21. **Depende de
`add-contrato-atleta-mensalidade`** mergeada em `develop` nos dois repos (usa `Mensalidade`,
`ContratoAtleta.avisoAtletaAtivo` e `StatusCobrancaAtleta`). **Gate do `/implement init`:** falhar
cedo se `tb_mensalidade` e `tb_contrato_atleta.aviso_atleta_ativo` não existirem no schema de
`develop`; não paralelizar sobre a change 1 ainda aberta.

Revisão de produto (2026-09-21, `product-reviewer`): **Go**. Dois ajustes incorporados: o gate
acima e o corte da métrica por toggle.

## Why

Com a change 1 o proprietário sabe quem está vencido quando abre o perfil ou o roster. Mas nada
o chama para isso, e o atleta continua dependendo do treinador lembrar de cobrar. Dois
lembretes resolvem os dois lados sem transformar o Menthoros num sistema de cobrança:

- O **Radar** (fila de atenção do treinador, `MotivoAtencao`) ganha o motivo **mensalidade
  vencida**, no mesmo lugar onde o treinador já decide quem cutucar hoje.
- O **atleta** recebe um e-mail 7 dias antes e outro no dia do vencimento, com valor, data e nome
  da assessoria. Sem instrução de pagamento e sem aviso depois de vencido: cobrar é do treinador
  (decisão 2026-09-21).

## What Changes

### Backend (`menthoros-backend`)

- **`MotivoAtencao.MENSALIDADE_VENCIDA`** (peso 25, entre ADERENCIA e INATIVIDADE; ação
  sugerida: "Confirmar o pagamento com o atleta e dar baixa na mensalidade."). Novo
  `avaliarMensalidadeVencida(List<LocalDate> vencidas)` em `CoachAttentionSignalEvaluator`:
  severidade MEDIA até 7 dias de atraso, ALTA acima; evidência "vencida há N dias" **sem valor**.
  Entra no `SugestaoCoachGeneratorJob` / montagem do Radar pelo mesmo caminho dos demais sinais.
- **Migration `V97`:** `DROP` das colunas legadas `tipo_plano_atleta` e `data_vencimento_plano`
  de `tb_atleta`, adiado da change 1 para ter uma janela em produção sem leitores (gate de
  migration destrutiva).
- **Migration `V98`:** `tb_mensalidade` ganha `aviso_previo_enviado_em` e
  `aviso_vencimento_enviado_em` (`timestamptz`, nullable).
- **`MensalidadeAvisoScheduler`** diário (`0 0 8 * * *`, por tenant com `TenantContext`, mesmo padrão do de
  renovação): para cada mensalidade EM_ABERTO com contrato ativo, `avisoAtletaAtivo = true`,
  `valor` não nulo e atleta com e-mail:
  - se `hoje ∈ [vencimento−7, vencimento−1]` e `aviso_previo_enviado_em` nulo → envia o aviso
    prévio e grava o instante;
  - se `hoje == vencimento` e `aviso_vencimento_enviado_em` nulo → envia o aviso do dia e grava;
  - `hoje > vencimento` → nunca envia.
  Envio via `EmailSender` existente, templates `mensalidade-aviso-previo.{html,txt}` e
  `mensalidade-aviso-vencimento.{html,txt}` em `templates/email/`, renderizados por
  `EmailTemplateRenderer`. Falha em uma mensalidade não impede as outras; a coluna só é gravada
  depois do envio bem-sucedido.
- **`ContratoAtletaOutputDto`** expõe `avisoAtletaAtivo` (já persistido na change 1) e
  `MensalidadeOutputDto` expõe as duas datas de aviso.

### Frontend (`menthoros-front`)

- Label e ícone do novo motivo na fila de atenção (`CoachAttentionQueuePage` e adaptadores).
- Na seção Cobrança do perfil (proprietário): toggle "Avisar o atleta por e-mail" no contrato e
  indicação "aviso enviado em …" em cada mensalidade.

## Capabilities

### New Capabilities

- `aviso-mensalidade`: motivo de atenção no Radar para mensalidade vencida e régua de dois
  e-mails ao atleta antes do vencimento, desligável por contrato.

### Modified Capabilities

- `coach-attention-queue` (se existir spec canônica): ganha o motivo MENSALIDADE_VENCIDA.

## Fora do escopo

- Aviso após vencido, cobrança por WhatsApp, push, instrução de pagamento (Pix da assessoria).
- E-mail ao treinador.
- Aviso quando o contrato não tem valor.
- Qualquer mudança na experiência do atleta dentro do app.

## Critérios de aceite

1. **Given** mensalidade EM_ABERTO vencendo em 7 dias, contrato com aviso ligado e valor, atleta
   com e-mail, **when** o job roda, **then** um e-mail de aviso prévio é enviado com valor,
   vencimento e nome da assessoria, e `aviso_previo_enviado_em` é gravado.
2. **Given** o mesmo cenário no dia seguinte, **when** o job roda, **then** nenhum e-mail é
   enviado (idempotência).
3. **Given** mensalidade vencendo hoje com aviso prévio já enviado, **when** o job roda, **then**
   envia o aviso do dia e grava `aviso_vencimento_enviado_em`.
4. **Given** job parado por 5 dias e mensalidade vencendo em 3 dias sem nenhum aviso, **when**
   roda, **then** envia só o aviso prévio (recuperação dentro da janela).
5. **Given** mensalidade vencida ontem sem nenhum aviso enviado, **when** o job roda, **then**
   nada é enviado.
6. **Given** contrato com `avisoAtletaAtivo = false`, ou valor nulo, ou atleta sem e-mail,
   **then** nenhum e-mail é enviado e nenhuma coluna é gravada.
7. **Given** falha do `EmailSender` numa mensalidade, **then** a coluna não é gravada, o job
   segue para as demais e loga o erro.
8. **Given** atleta com mensalidade vencida há 3 dias, **when** o Radar é montado, **then** o
   atleta aparece com motivo MENSALIDADE_VENCIDA, severidade MEDIA, evidência "vencida há 3 dias"
   e a resposta não contém valor. Há 10 dias → ALTA.
9. **Given** atleta com mensalidade PAGA ou CANCELADA apenas, **then** não aparece por esse motivo.
10. **Given** proprietário desliga o toggle no perfil, **then** `PUT /atletas/{id}/contrato`
    persiste `avisoAtletaAtivo = false`.
11. **Given** técnico não proprietário abrindo o Radar, **then** vê o item com o motivo e a
    evidência, sem valor.

## Métrica de sucesso

Rotina do treinador: **tempo entre vencimento e baixa** cai. Medição: mediana de
`pagoEm − vencimento` das mensalidades PAGAS, comparando os 30 dias antes e depois do merge
(query direta em `tb_mensalidade`), **só para contratos com aviso ligado** — sem esse corte o
número fica diluído por quem desligou o e-mail. Para a assessoria, menos inadimplência é menos
atrito na carteira: argumento de retenção, não só de rotina. Sinal secundário: proporção de mensalidades com aviso
enviado que são baixadas até 3 dias após o vencimento.

## Riscos e mitigações

- **E-mail duplicado** (job rodando duas vezes, deploy no meio): coluna gravada só após envio e
  verificada antes; janela de um dia por aviso.
- **Atleta recebe cobrança que o treinador já resolveu por fora:** o proprietário dá baixa e o
  aviso do dia não sai (só EM_ABERTO recebe). Toggle por contrato cobre quem não quer e-mail.
- **Sender reputacional:** volume baixo (2 e-mails por mensalidade), remetente já usado nos
  convites. Sem link de descadastro em v1; o toggle é operado pelo proprietário.
- **Radar poluído:** só vencida entra, não "próximo do vencimento".

## Open Questions & Assumptions

- ✅ Treinador é avisado só pelo Radar; atleta só por e-mail (decisão 2026-09-21).
- ✅ Dois e-mails: 7 dias antes e no dia; nenhum depois (decisão 2026-09-21).
- ✅ Sem instrução de pagamento no e-mail (decisão 2026-09-21).
- **Premissa:** o `EmailSender` em produção (Railway) está configurado com SMTP real, não o
  `FileEmailSender`. Confirmar em `/implement init`.
- **Aberto:** horário do job (8h do servidor, UTC?) — alinhar com o fuso da assessoria seria
  outra change; 8h UTC = 5h BRT é cedo mas inofensivo para e-mail.
