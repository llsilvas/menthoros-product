# Tasks — landing-oferta-fundadora-clareza

Repositório único: `apps/menthoros-front` (`src/landing/**`). Sem migration, sem mudança de
contrato de API, sem alteração de área autenticada.

## 1. RF-03 — Comparação de planos: remove o Gratuito, tira a hierarquia por opacidade

- [ ] 1.1 Remover o plano `GRATUITO` de `content.ts` (`pricing.plans`) e de qualquer texto que
      sugira gratuidade permanente na página pública.
      *verify:* busca por "Gratuito" e "R$ 0" na página renderizada não retorna nada fora do
      contexto do teste de 60 dias (RF-02).
- [ ] 1.2 `PlanCard`/`Pricing` (`sections.tsx`): substituir a hierarquia por `opacity: 0.62` (PR
      #107) por diferenciação de título/posição/explicação — sem opacidade global simulando
      indisponibilidade. Sub-título "Planos previstos para o lançamento geral" acima da grade dos
      4 planos pagos futuros.
      *verify:* teste de componente cobrindo que os 4 cards futuros renderizam com opacidade plena
      (legíveis) e com o sub-título; nenhum "Assinar" nesses cards.
- [ ] 1.3 Remover o selo "SEU PLANO APÓS O TRIAL" do card Basic na comparação (a relação com o
      fundador já fica explícita no bloco novo da task 2). Trocar "trial" por "teste" em todo texto
      visível da seção.
      *verify:* grep por "trial" (case-insensitive) em `content.ts`/`sections.tsx` não retorna
      texto visível ao usuário.
- [ ] 1.4 Conferir que a tabela de capacidade do Scale não promete atletas "ilimitados" — só
      "100+"; a coluna Técnicos mantém "Ilimitados" (esse valor é o publicado).
      *verify:* inspeção visual do card Scale.

## 2. RF-02 — Bloco dedicado à oferta fundadora (parte não bloqueada)

- [ ] 2.1 Novo bloco, antes da comparação de planos, na ordem: identificação do programa (10
      vagas) → período de teste (60 dias, sem cartão) → condição pós-teste (Basic, preço,
      capacidade) → aviso de que a continuidade exige contratação → ação "Solicitar acesso".
      Texto conforme `design.md` RF-02 (já publicado hoje, não depende de D-01/D-02/D-04).
      *verify:* teste de componente cobrindo a presença e ordem dos 5 elementos.
- [ ] 2.2 O texto não deve atribuir ao teste os limites do Basic (capacidade durante os 60 dias
      depende de D-02) — usar frase neutra tipo "durante o teste" sem citar número de atletas.
      *verify:* revisão de texto; nenhuma alegação de capacidade do teste em si.

## 3. RF-01 — Hero: reforço da oferta e link para preços

- [ ] 3.1 Junto à ação "Solicitar acesso" do hero, adicionar "Programa fundador · 10 vagas · 60
      dias grátis, sem cartão" (o `hero.scarcity` atual já tem parte disso — conferir se cobre o
      "programa fundador" explicitamente, ajustar se não).
      *verify:* inspeção visual + teste se houver.
- [ ] 3.2 Indicação curta de continuidade paga com link/scroll para a seção de preços — sem
      sugerir ativação imediata ao clicar em "Solicitar acesso" (o clique continua levando ao
      formulário, não a um checkout).
      *verify:* teste de componente ou E2E cobrindo o link de scroll até `#precos`.

## 4. RF-04 — FAQ (parte não bloqueada)

- [ ] 4.1 Atualizar a resposta de "Quanto custa?" para refletir exatamente as condições do bloco
      da task 2 (60 dias grátis, sem cartão; Basic R$ 99/mês, 1 técnico, até 20 atletas após).
      *verify:* texto revisado, sem contradição com RF-02.
- [ ] 4.2 Adicionar a pergunta "Existe um plano gratuito permanente?" com a resposta "Não..." de
      `design.md`.
      *verify:* FAQ renderiza a nova pergunta/resposta.
- [ ] 4.3 **Bloqueado por D-01** — NÃO publicar ainda "Tenho mais de 20 atletas. Como continuo
      após o teste?". Deixar registrado aqui como pendente, sem placeholder na página.

## 5. RF-06 — Auditoria dos estados do formulário (não bloqueado)

- [ ] 5.1 Auditar o `AccessForm`/`useWaitlist` contra a tabela de estados de `design.md` (vazio/
      foco/preenchido, inválido, enviando, sucesso confirmado, falha confirmada, resultado incerto
      por interrupção) e listar aqui as lacunas reais encontradas — corrigir só o que falta.
      *verify:* achados registrados nesta task com o resultado da auditoria.
- [ ] 5.2 Corrigir as lacunas encontradas em 5.1 (ex.: evitar envio duplicado durante requisição em
      andamento; garantir que falha preserva os dados digitados).
      *verify:* teste de componente por lacuna corrigida.

## 6. RF-05 — Expectativa após solicitar acesso

- [ ] 6.1 **Bloqueado por D-03** — o texto final do "próximo passo" (canal, prazo, seleção) não
      pode ser escrito nem publicado até a decisão do founder. Não inventar 24h/48h/WhatsApp/
      aprovação garantida.
- [ ] 6.2 Repetir "60 dias grátis, sem cartão. Continuidade mediante contratação" junto à ação do
      formulário, em texto legível (não depende de D-03 — é a mesma condição já pública em RF-02).
      *verify:* inspeção visual de contraste/tamanho.

## 7. Acessibilidade, legibilidade e responsividade

- [ ] 7.1 Medir contraste efetivo (não só avaliar por captura) de: descrição inicial, menu,
      informações da oferta, rótulos fora de foco, avisos, consentimento. Meta: 4.5:1 texto comum,
      3:1 texto grande e elementos não textuais de estado.
      *verify:* valores medidos registrados aqui (ferramenta usada + resultado por elemento).
- [ ] 7.2 Verificar a camada escura atrás do texto sobre o vídeo do hero (scrim do PR #107) contra
      os frames mais claros do vídeo, não só o frame médio.
      *verify:* captura nos momentos mais claros do vídeo, contraste medido.
- [ ] 7.3 Foco visível e ordem lógica por teclado em toda a página pública; rótulos associados aos
      campos (já entregue no PR #107 — conferir se cobre 100% dos campos); erros/resultados
      perceptíveis por tecnologia assistiva (`role="alert"`, já presente no formulário — conferir
      escopo).
      *verify:* navegação só por teclado testada manualmente; leitor de tela em pelo menos os
      estados de erro/sucesso do formulário.
- [ ] 7.4 Responsividade: telas estreitas empilham oferta e planos sem rolagem horizontal, corte ou
      sobreposição; preço/duração/condição sempre junto à ação. Validar 360/390/768/1440px e zoom
      200%.
      *verify:* capturas nas 4 larguras + zoom 200%, sem corte/sobreposição.

## 8. Decisões pendentes — acompanhamento

- [ ] 8.1 Registrar aqui a decisão do founder para D-01 (fundador pode escolher Pro/Enterprise/
      Scale? caminho para >20 atletas?) quando vier, e desbloquear a task 4.3.
- [ ] 8.2 Registrar D-02 (capacidade durante os 60 dias) quando vier, e revisar a task 2.2 se a
      frase neutra precisar virar afirmação específica.
- [ ] 8.3 Registrar D-03 (canal/prazo/seleção do retorno) quando vier, e desbloquear a task 6.1.
- [ ] 8.4 Registrar D-04 (início da contagem dos 60 dias) quando vier, e revisar tasks 2 e 6 se
      precisarem citar o evento de início.

## 9. Validação final

- [ ] 9.1 `npm run lint && npm run build && npm run test:run` verdes.
- [ ] 9.2 Checklist dos 11 critérios de aceite (`CA-01` a `CA-11`, `design.md`) percorrido item a
      item, com o resultado registrado aqui.
- [ ] 9.3 Se D-01/D-02/D-03/D-04 seguirem pendentes no momento do PR, arquivar a change com as
      tasks 4.3/6.1/8.x explicitamente em aberto — não é bloqueio para mergear o que já está pronto
      (CA-11 cobre isso: "nenhuma regra pendente foi inventada", não "nenhuma pendência pode
      existir").
