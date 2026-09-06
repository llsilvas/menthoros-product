# Design — landing-oferta-fundadora-clareza

Fonte: especificação formal recebida do founder em 2026-09-06 (v1.0), baseada em duas avaliações
manuais da landing pública. Preservado quase verbatim — é o contrato desta change.

## Base da especificação

| Informação | Origem e tratamento |
|---|---|
| Gratuidade válida apenas durante 60 dias | Confirmado pelo founder nesta conversa. Regra obrigatória. |
| Programa com 10 vagas; teste sem cartão | Oferta publicada na página. Preservar; "10 vagas" não vira contador de vagas restantes. |
| Basic por R$ 99/mês, 1 técnico, até 20 atletas | Condição publicada. Base desta versão. |
| Continuidade exige cartão; sem contratação, acesso termina | Comunicação publicada. Cobrança/acesso reais não verificados. |
| Troca de plano, início da contagem, capacidade durante o teste | Não definidos — ver D-01/D-02/D-04. Não inferir. |

As capturas da avaliação registram a interface avaliada, não comprovam regras de cobrança ou
capacidade do sistema.

## Escopo

Inclui: apresentação inicial, seção de preços, FAQ e formulário da landing pública, com validação
desktop e mobile.

Preservar: logotipo, paleta escura com verde, tipografia, painel ilustrativo, mensagem "A IA
propõe. O treinador decide.", o texto que identifica assessorias de endurance (já entregue no PR
#107), os rótulos flutuantes e o foco visível do formulário (idem).

Não inclui: checkout, cobrança, encerramento de acesso, retenção de dados, área autenticada,
reconstrução da página.

## RF-01 — Apresentação inicial (hero) · prioridade alta

- Manter a descrição atual (já no código, PR #107): "Feito para assessorias de endurance: a IA lê
  o treino de cada atleta e propõe ajustes. Você decide o que muda, sem perder tempo com planilha."
- Manter "Solicitar acesso" como ação principal, levando ao formulário existente.
- Junto à ação, comunicar: "Programa fundador · 10 vagas · 60 dias grátis, sem cartão".
- Acrescentar indicação curta de continuidade paga, com link/scroll para a seção de preços. Não
  sugerir ativação imediata ao clicar "Solicitar acesso".

## RF-02 — Oferta fundadora · prioridade alta

Substituir a comparação de planos como elemento principal por um bloco dedicado, nesta ordem:

1. Identificação do programa e quantidade de vagas.
2. Período de teste: 60 dias grátis, sem cartão.
3. Condições após o teste: Basic, preço e capacidade.
4. Explicação de que a continuidade exige contratação.
5. Ação "Solicitar acesso", levando ao mesmo formulário.

Texto proposto (baseado nas condições já publicadas):

> **Programa fundador · 10 vagas**
>
> Experimente o Menthoros por 60 dias grátis, sem cartão.
>
> Após o teste, continue no Basic por **R$ 99/mês**, com **1 técnico e até 20 atletas**. Para
> continuar, será necessário cadastrar um cartão e contratar o plano. Sem a contratação, o acesso
> será encerrado ao fim dos 60 dias.
>
> **Solicitar acesso**

O texto não deve atribuir ao teste os limites do Basic — a capacidade durante os 60 dias depende de
D-02. Revisar a formulação sobre o Basic se D-01 permitir outros caminhos de contratação.

## RF-03 — Comparação de planos · prioridade alta

- Remover o cartão "Gratuito — R$ 0/mês" da tabela e de qualquer referência a gratuidade permanente
  na página pública.
- Não substituir por outro "Gratuito" — o teste pertence à oferta fundadora (RF-02), não à tabela.
- Apresentar os planos pagos abaixo do bloco fundador, sob "Planos previstos para o lançamento
  geral".
- Manter valores e capacidades publicados, sem descontos/limites/benefícios novos:

  | Plano | Mensalidade | Atletas | Técnicos |
  |---|---|---|---|
  | Basic | R$ 99 | Até 20 | 1 |
  | Pro | R$ 199 | Até 50 | 2 |
  | Enterprise | R$ 349 | Até 100 | 5 |
  | Scale | R$ 599 | Mais de 100 | Ilimitados |

- Scale não deve prometer atletas "ilimitados" na tabela de capacidade — a página só publica
  "100+" (o "Ilimitados" da coluna Técnicos é a única exceção literal, conforme dado publicado).
- Diferenciar a oferta vigente dos planos futuros por **título, posição e explicação** — **não por
  opacidade global simulando indisponibilidade** (isso substitui a abordagem entregue no PR #107,
  que usava `opacity: 0.62` nos 4 cards não-Basic).
- Sem botões "Assinar" em planos sem contratação disponível.
- Não repetir o selo "Seu plano após o trial" na comparação — a relação com o fundador já é
  explícita no bloco principal (RF-02). Preferir "teste" a "trial" em todo texto visível.

## RF-04 — Perguntas frequentes · prioridade alta

- Atualizar "Quanto custa?" para refletir os 60 dias grátis e a continuidade paga, com as mesmas
  condições do bloco fundador (RF-02).
- Adicionar:

  > **Existe um plano gratuito permanente?**
  >
  > Não. O acesso gratuito vale somente durante os 60 dias de teste. Depois desse período, é
  > necessário contratar um plano pago para continuar usando o Menthoros.

- Prever (estrutura pronta, texto **não publicado** até D-01): "Tenho mais de 20 atletas. Como
  continuo após o teste?" — não afirmar que o Pro estará disponível imediatamente, nem que será
  obrigatório remover atletas.

## RF-05 — Expectativa após solicitar acesso (formulário) · prioridade alta

- Manter os três campos atuais, aviso de integração Garmin, consentimento e link de privacidade
  (já entregues, PR #107).
- Inserir, antes do envio, explicação breve do próximo passo: canal de retorno, prazo real,
  existência ou não de seleção.
- A frase final **depende de D-03**. Não inventar atendimento em 24/48h, WhatsApp, aprovação
  garantida, ou início imediato do teste.
- Estrutura de conteúdo a completar internamente (nenhum marcador pode chegar à página publicada):
  `"Após o envio, [próximo passo] por [canal] em [prazo real]. [Condição de seleção, se houver]."`
- Repetir "60 dias grátis, sem cartão. Continuidade mediante contratação" junto à ação, em texto
  legível (não escondido em tamanho/contraste reduzido).

## RF-06 — Estados do formulário · prioridade média

Auditar a implementação existente e corrigir só as lacunas reais (não reescrever o que já funciona):

| Estado | Comportamento esperado |
|---|---|
| Vazio, em foco, preenchido | Rótulo identificável; nome do campo permanece visível após preencher e sair (já entregue, PR #107 — `label` persistente). |
| Dado inválido | Mensagem específica associada ao campo; preserva os demais valores. |
| Enviando | Indicação "Enviando…"; evitar envio duplicado com requisição em andamento. |
| Sucesso confirmado | "Solicitação recebida" só após confirmação do serviço, seguido do próximo passo (D-03). Não confundir recebimento com aprovação. |
| Falha confirmada | Explica que o envio não foi concluído, mantém os dados, permite nova tentativa. |
| Resultado incerto por interrupção | Não afirma sucesso nem garante que nada foi recebido. Tratamento compatível com a integração existente, sem prometer deduplicação inexistente. |

Não alterar termos de consentimento nem adicionar campos nesta entrega.

## Acessibilidade, legibilidade e responsividade

- Reforçar contraste de: descrição inicial, menu, informações da oferta, rótulos fora de foco,
  avisos, consentimento.
- Camada escura suficientemente estável atrás de texto sobre imagem/vídeo (nav sobre o hero — já
  parcialmente entregue no PR #107 via scrim permanente; verificar também os frames mais claros do
  vídeo, não só o frame médio).
- Meta mínima: **4.5:1** texto comum, **3:1** texto grande (definição do critério WCAG) e **3:1**
  para informação visual não textual necessária à identificação de controles/estados. Medir cores
  efetivas (incluindo transparências) — não aprovar só pela aparência da captura.
  - Referência: [W3C — contraste de texto](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
  - Referência: [W3C — contraste não textual](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- Foco visível e ordem lógica por teclado; rótulos associados aos campos; erros e resultados
  perceptíveis por tecnologia assistiva.
- Telas estreitas: empilhar oferta e planos, sem rolagem horizontal, corte ou sobreposição; preço,
  duração e condição sempre junto à respectiva ação.
- Validar larguras 360/390/768/1440px e zoom 200%. Repetir a captura ampla (2240×1315) para
  comparação com a avaliação anterior — não usar como única referência.

Estes itens são critérios desta entrega, não uma declaração de conformidade integral com WCAG.

## Critérios de aceite

| ID | Verificação objetiva |
|---|---|
| CA-01 | A página não apresenta "Gratuito — R$ 0/mês" nem opção gratuita permanente. |
| CA-02 | Apresentação, oferta, FAQ e formulário comunicam gratuidade limitada a 60 dias, sem contradições. |
| CA-03 | A oferta fundadora precede a comparação de planos futuros e informa duração, preço de continuidade e capacidade do Basic. |
| CA-04 | As condições de contratação e término do acesso correspondem à operação real. |
| CA-05 | Planos futuros são identificados por texto e permanecem legíveis; não simulam contratação já disponível. |
| CA-06 | Todos os botões "Solicitar acesso" levam ao formulário existente, sem encobrir seu conteúdo essencial pelo cabeçalho. |
| CA-07 | O formulário informa o próximo passo com canal, prazo e seleção conforme D-03, sem marcadores internos. |
| CA-08 | Nome, Email e Número de atletas conservam identificação durante foco, preenchimento e saída; navegação por teclado funciona. |
| CA-09 | Estados de envio, sucesso e falha são verificados contra a integração; recebimento não é apresentado como aprovação. |
| CA-10 | Contrastes são medidos e registrados; capturas nos tamanhos definidos não apresentam cortes ou sobreposição. |
| CA-11 | D-01 a D-04 têm decisão registrada antes de publicar os conteúdos dependentes. Nenhuma regra pendente foi inventada. |

## Decisões pendentes (D-01 a D-04)

Responsável: produto/comercial do Menthoros.

| ID | Decisão necessária | Impacto |
|---|---|---|
| D-01 | Fundadores podem escolher Pro, Enterprise ou Scale ao fim do teste? Qual o caminho para quem tem mais de 20 atletas? | Oferta (RF-02), FAQ (RF-04), disponibilidade dos planos. |
| D-02 | Quantos atletas e técnicos podem ser usados durante os 60 dias? | Explicação do teste (RF-02); previne expectativa incorreta. |
| D-03 | O retorno ocorre por qual canal e em qual prazo? Há seleção, conversa inicial ou aprovação direta? | Texto antes do envio (RF-05) e confirmação de recebimento (RF-06). |
| D-04 | Os 60 dias começam na aprovação, na ativação da conta, ou em outro evento? | Explicação de início/término do teste (RF-02, RF-05). Não contar automaticamente a partir da solicitação. |

As pendências não impedem preparar a interface, remover a promessa de gratuidade permanente e
melhorar o contraste. Impedem publicar afirmações específicas ainda não definidas.

## Sequência sugerida de entrega (do documento original)

1. Remover a opção gratuita permanente e reorganizar o bloco fundador e os planos pagos.
2. Resolver as decisões comerciais e sincronizar apresentação, preços, FAQ e formulário.
3. Ajustar contraste e validar rótulos/estados do formulário existente.
4. Conferir responsividade, teclado e mensagens em ambiente de teste; registrar evidências de
   aceite.

## Evidências de origem

- Primeira avaliação: `avaliacao.md` (já consumida na branch `fix/landing-page-clareza`, PR #107).
- Reavaliação após alterações, apresentação atual, preços atuais, formulário preenchido sem envio —
  arquivos citados pelo founder, não anexados a este repositório; a redação desta change partiu do
  texto da especificação recebida, sem nova inspeção direta da aplicação.
