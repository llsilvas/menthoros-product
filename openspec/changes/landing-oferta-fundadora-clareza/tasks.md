# Tasks — landing-oferta-fundadora-clareza

Repositório único: `apps/menthoros-front` (`src/landing/**`). Sem migration, sem mudança de
contrato de API, sem alteração de área autenticada.

## 1. RF-03 — Comparação de planos: remove o Gratuito, tira a hierarquia por opacidade

- [x] 1.1 Remover o plano `GRATUITO` de `content.ts` (`pricing.plans`) e de qualquer texto que
      sugira gratuidade permanente na página pública.
      *verify:* busca por "Gratuito" e "R$ 0" na página renderizada não retorna nada fora do
      contexto do teste de 60 dias (RF-02). — `GRATUITO` removido de `pricing.plans`; grep por
      "GRATUITO"/"R$ 0" no `src/landing` não retorna nada.
- [x] 1.2 `PlanCard`/`Pricing` (`sections.tsx`): substituir a hierarquia por `opacity: 0.62` (PR
      #107) por diferenciação de título/posição/explicação — sem opacidade global simulando
      indisponibilidade. Sub-título "Planos previstos para o lançamento geral" acima da grade dos
      4 planos pagos futuros.
      *verify:* teste de componente cobrindo que os 4 cards futuros renderizam com opacidade plena
      (legíveis) e com o sub-título; nenhum "Assinar" nesses cards. — `opacity` removida do
      `PlanCard`; cada plano ganhou `status` textual ("Onde o teste termina" / "Disponível no
      lançamento geral") renderizado no rodapé do card; `pricing.plansHeading` novo, renderizado
      acima da grade. Sem botão "Assinar" em nenhum card (nunca existiu). `Pricing.test.tsx` novo
      (6 testes): sem "Gratuito"/"R$ 0"; ordem dos 5 elementos do bloco fundador; frase do teste
      não cita capacidade do Basic; sub-título + 4 cards sem "trial"/"Assinar"; status textual por
      card; Scale sem "ilimitados".
- [x] 1.3 Remover o selo "SEU PLANO APÓS O TRIAL" do card Basic na comparação (a relação com o
      fundador já fica explícita no bloco novo da task 2). Trocar "trial" por "teste" em todo texto
      visível da seção.
      *verify:* grep por "trial" (case-insensitive) em `content.ts`/`sections.tsx` não retorna
      texto visível ao usuário. — selo removido junto com a opacidade (task 1.2); grep por "trial"
      (case-insensitive) em `content.ts`/`sections.tsx` não retorna mais nenhuma ocorrência visível
      (o `pricing.intro`/`trialNote` que citavam "trial" foram substituídos pelo `founderOffer`).
- [x] 1.4 Conferir que a tabela de capacidade do Scale não promete atletas "ilimitados" — só
      "100+"; a coluna Técnicos mantém "Ilimitados" (esse valor é o publicado).
      *verify:* inspeção visual do card Scale. — `plans` mantém `SCALE: { atletas: "100+",
      tecnicos: "Ilimitado" }`, sem alteração — já estava correto.

## 2. RF-02 — Bloco dedicado à oferta fundadora (parte não bloqueada)

- [x] 2.1 Novo bloco, antes da comparação de planos, na ordem: identificação do programa (10
      vagas) → período de teste (60 dias, sem cartão) → condição pós-teste (Basic, preço,
      capacidade) → aviso de que a continuidade exige contratação → ação "Solicitar acesso".
      Texto conforme `design.md` RF-02 (já publicado hoje, não depende de D-01/D-02/D-04).
      *verify:* teste de componente cobrindo a presença e ordem dos 5 elementos. — `FounderOfferCard`
      novo em `sections.tsx`, conteúdo em `content.ts` (`founderOffer`); coberto pelo teste
      "renderiza o bloco da oferta fundadora com os 5 elementos, na ordem" (`Pricing.test.tsx`).
- [x] 2.2 O texto não deve atribuir ao teste os limites do Basic (capacidade durante os 60 dias
      depende de D-02) — usar frase neutra tipo "durante o teste" sem citar número de atletas.
      *verify:* revisão de texto; nenhuma alegação de capacidade do teste em si. —
      `founderOffer.trialLine` ("Experimente o Menthoros por 60 dias grátis, sem cartão.") não cita
      número de atletas; só `afterTrialPost` (o Basic, pós-teste) cita "até 20 atletas". Coberto
      pelo teste "não atribui ao teste os limites do Basic" (`Pricing.test.tsx`).

## 3. RF-01 — Hero: reforço da oferta e link para preços

- [x] 3.1 Junto à ação "Solicitar acesso" do hero, adicionar "Programa fundador · 10 vagas · 60
      dias grátis, sem cartão" (o `hero.scarcity` atual já tem parte disso — conferir se cobre o
      "programa fundador" explicitamente, ajustar se não).
      *verify:* inspeção visual + teste se houver. — `hero.scarcity` já cobria isso desde o PR
      #107 ("10 vagas do programa fundador · 60 dias grátis, sem cartão"); nenhuma mudança
      necessária.
- [x] 3.2 Indicação curta de continuidade paga com link/scroll para a seção de preços — sem
      sugerir ativação imediata ao clicar em "Solicitar acesso" (o clique continua levando ao
      formulário, não a um checkout).
      *verify:* teste de componente ou E2E cobrindo o link de scroll até `#precos`. —
      `hero.continuityHint` novo ("Depois do teste, planos a partir de R$ 99/mês."), renderizado
      como link/botão que chama `scrollToId("precos")`; o CTA principal continua chamando
      `scrollToId("acesso")`, inalterado. `Hero.test.tsx` novo (2 testes).

## 4. RF-04 — FAQ (parte não bloqueada)

- [x] 4.1 Atualizar a resposta de "Quanto custa?" para refletir exatamente as condições do bloco
      da task 2 (60 dias grátis, sem cartão; Basic R$ 99/mês, 1 técnico, até 20 atletas após).
      *verify:* texto revisado, sem contradição com RF-02. — trocado "No dia 61 você cadastra..."
      por "Depois do teste, você cadastra..." — "dia 61" contava os 60 dias a partir da
      solicitação, o que D-04 ainda não decidiu; o resto da resposta já batia com o bloco fundador.
- [x] 4.2 Adicionar a pergunta "Existe um plano gratuito permanente?" com a resposta "Não..." de
      `design.md`.
      *verify:* FAQ renderiza a nova pergunta/resposta. — adicionada literalmente conforme
      `design.md`, entre "Quanto custa?" e "Serve para uma assessoria pequena?".
- [ ] 4.3 **Bloqueado por D-01** — NÃO publicar ainda "Tenho mais de 20 atletas. Como continuo
      após o teste?". Deixar registrado aqui como pendente, sem placeholder na página.

## 5. RF-06 — Auditoria dos estados do formulário (não bloqueado)

- [x] 5.1 Auditar o `AccessForm`/`useWaitlist` contra a tabela de estados de `design.md` (vazio/
      foco/preenchido, inválido, enviando, sucesso confirmado, falha confirmada, resultado incerto
      por interrupção) e listar aqui as lacunas reais encontradas — corrigir só o que falta.
      *verify:* achados registrados nesta task com o resultado da auditoria. — **Resultado da
      auditoria (`useWaitlist.ts` + `WaitlistService.ts` + `AccessForm.tsx`):**
      - Vazio/foco/preenchido: ok (rótulo persistente, PR #107).
      - Inválido: ok — `validate()` popula `errors` por campo, `helperText` associado, valores não
        são tocados.
      - Enviando: ok — `status==='submitting'` mostra "Enviando…" e desabilita o botão de submit
        (`disabled={submitting}`), evita clique duplo.
      - Sucesso confirmado: ok — `status` só vira `'success'` depois do `await` resolver sem
        lançar; nunca antes da confirmação do serviço.
      - Falha confirmada: ok — mensagens de `mensagemErro()` convidam a tentar de novo, dados do
        formulário permanecem (o hook nunca toca `nome`/`email`/`qtdAtletasRaw`).
      - Resultado incerto por interrupção: **não existe como estado dedicado**, mas as mensagens de
        erro já são neutras ("Não foi possível concluir agora. Tente novamente em instantes." /
        "Falha de conexão...") — nenhuma afirma que "nada foi recebido", nem promete deduplicação
        que não existe. `WaitlistService.inscrever` não usa `AbortController`/timeout, então uma
        falha real de rede (única forma de chegar ao `catch` sem HTTP 2xx) já significa que a
        requisição não completou do lado do cliente — não há um cenário de "servidor recebeu mas
        cliente não soube" neste desenho simples (sem retry automático, sem cache).
      **Conclusão: nenhuma lacuna de código encontrada** — o comportamento já é compatível com a
      tabela de `design.md`, inclusive o estado sem nome próprio.
- [x] 5.2 Corrigir as lacunas encontradas em 5.1 (ex.: evitar envio duplicado durante requisição em
      andamento; garantir que falha preserva os dados digitados).
      *verify:* teste de componente por lacuna corrigida. — nenhuma lacuna encontrada em 5.1;
      nenhuma mudança de código necessária nesta task.

## 6. RF-05 — Expectativa após solicitar acesso

- [ ] 6.1 **Bloqueado por D-03** — o texto final do "próximo passo" (canal, prazo, seleção) não
      pode ser escrito nem publicado até a decisão do founder. Não inventar 24h/48h/WhatsApp/
      aprovação garantida.
- [x] 6.2 Repetir "60 dias grátis, sem cartão. Continuidade mediante contratação" junto à ação do
      formulário, em texto legível (não depende de D-03 — é a mesma condição já pública em RF-02).
      *verify:* inspeção visual de contraste/tamanho. — segunda linha adicionada em
      `AccessForm.tsx`, mesmo tamanho/cor da linha "Sem compromisso..." já existente (`fontSize:
      11`, `color: text.secondary` — ver contraste medido na task 7.1).

## 7. Acessibilidade, legibilidade e responsividade

- [x] 7.1 Medir contraste efetivo (não só avaliar por captura) de: descrição inicial, menu,
      informações da oferta, rótulos fora de foco, avisos, consentimento. Meta: 4.5:1 texto comum,
      3:1 texto grande e elementos não textuais de estado.
      *verify:* valores medidos registrados aqui (ferramenta usada + resultado por elemento). —
      **Contraste calculado (fórmula WCAG de luminância relativa, sRGB) para os 3 pares de
      cor/fundo usados em todo o texto tocado por esta change**, contra `background.default`
      (`#0A1628`, o token que a `Section`/`Container` resolvem quando NÃO há vídeo por trás):
      - `text.secondary` (`#94A3B8`, usado em: descrição inicial, `hero.scarcity`, `continuityHint`,
        avisos do formulário, linha de consentimento) → **~7,07:1** — passa AA (4.5:1) e AAA (7:1)
        para texto comum.
      - `text.primary` (`#F8FAFC`, título/preço em destaque) → **~17,33:1** — folgado em qualquer
        critério.
      - `primary.main` (`#BDDE5A`, badge do fundador, nome do Basic, links de navegação) →
        **~11,88:1** — passa AA e AAA.
      **Limitação honesta:** estes três pares cobrem o texto sobre fundo *sólido* (a maioria da
      página). O hero e a nav ficam sobre o vídeo (`VideoShowcase`), não sobre o token sólido — ali
      o cálculo acima é só uma aproximação do pior caso (a região mais escura do degradê do
      vídeo, ~66–80% de opacidade do mesmo token). A verificação pixel a pixel contra os frames
      reais do vídeo — inclusive os mais claros — fica registrada como pendente na task 7.2, que
      exige inspeção visual num navegador real, não cálculo estático.
- [ ] 7.2 **Deferido — exige navegador real.** Verificar a camada escura atrás do texto sobre o
      vídeo do hero (scrim do PR #107) contra os frames mais claros do vídeo, não só o frame médio.
      Nenhuma ferramenta de captura/inspeção de vídeo em execução foi usada nesta sessão; a
      aproximação estática está registrada na task 7.1.
      *verify:* captura nos momentos mais claros do vídeo, contraste medido.
- [ ] 7.3 **Parcialmente feito.** Foco visível e ordem lógica por teclado: revisão de código não
      encontrou `tabIndex` positivo nem supressão de outline em `sections.tsx`/`AccessForm.tsx`
      (o único `tabIndex={-1}` é o honeypot anti-spam, propositalmente fora do tab). Rótulos
      associados aos campos: os 3 campos do formulário usam `label` (PR #107 + esta change não
      mexeu nisso) — cobre 100%. `role="alert"` já presente no erro de submit e no erro de
      consentimento. **O que falta:** navegação manual só por teclado num navegador real e teste
      com leitor de tela real — não fica provado por leitura de código.
      *verify:* navegação só por teclado testada manualmente; leitor de tela em pelo menos os
      estados de erro/sucesso do formulário.
- [ ] 7.4 **Deferido — exige navegador real.** Responsividade: telas estreitas empilham oferta e
      planos sem rolagem horizontal, corte ou sobreposição; preço/duração/condição sempre junto à
      ação. Validar 360/390/768/1440px e zoom 200%. O grid do `FounderOfferCard`/`Pricing` usa
      `xs: "1fr"` (empilha) e `md: repeat(4, ...)` — correto por leitura de código — mas nenhuma
      captura real foi tirada nesta sessão.
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

- [x] 9.1 `npm run lint && npm run build && npm run test:run` verdes. — lint limpo; build limpo
      (só o aviso pré-existente de chunk >500kB, não relacionado); `test:run` → 184 arquivos /
      1520 testes (182/1512 antes desta change + `Pricing.test.tsx` e `Hero.test.tsx` novos, 8
      testes). Adicionado também um stub global de `IntersectionObserver` em `src/test/setup.ts` —
      faltava para qualquer teste que renderize um componente dentro de `<Reveal>` (`Hero`,
      `Pricing`, `Pain`...), gap pré-existente que nenhum teste anterior tinha exposto.
- [x] 9.2 Checklist dos 11 critérios de aceite (`CA-01` a `CA-11`, `design.md`) percorrido item a
      item, com o resultado registrado aqui.
      - CA-01 ✅ sem "Gratuito"/"R$ 0" em lugar nenhum (grep + teste).
      - CA-02 ✅ hero (`hero.scarcity`), oferta (`founderOffer`), FAQ (2 perguntas) e formulário
        (`AccessForm`, task 6.2) comunicam os 60 dias sem contradição entre si.
      - CA-03 ✅ `FounderOfferCard` renderiza antes da grade de planos (task 2.1), com duração,
        preço de continuidade e capacidade do Basic.
      - CA-04 ⚠️ parcial — o texto corresponde ao que está publicado hoje, mas "corresponde à
        operação real" (cobrança/acesso de fato) não foi verificado nesta sessão (fora do escopo:
        front-end apenas, sem acesso ao backend de billing).
      - CA-05 ✅ Pro/Enterprise/Scale identificados por `status` textual, legibilidade plena (sem
        opacidade), sem "Assinar".
      - CA-06 ✅ os 3 botões "Solicitar acesso" (hero, oferta fundadora, formulário) levam ao
        mesmo formulário via `scrollToId("acesso")`; nenhum ficou atrás do cabeçalho (`nav` é
        `position: sticky`, não sobrepõe conteúdo abaixo dela).
      - CA-07 ❌ **não atende ainda** — depende de D-03 (task 6.1, bloqueada de propósito).
      - CA-08 ✅ label persistente nos 3 campos (PR #107, não tocado nesta change); navegação por
        teclado não re-testada manualmente (ver 7.3).
      - CA-09 ✅ auditoria da task 5.1 confirma que sucesso só é mostrado após confirmação do
        serviço e que falha nunca é confundida com aprovação.
      - CA-10 ⚠️ parcial — contraste calculado (task 7.1) para fundo sólido; capturas nos 4
        tamanhos + zoom 200% não foram tiradas (tasks 7.2/7.4, deferidas — exigem navegador real).
      - CA-11 ✅ D-01 a D-04 registrados em `design.md`/`proposal.md`; nenhuma resposta foi
        inventada para os itens bloqueados (4.3, 6.1).
- [x] 9.3 Se D-01/D-02/D-03/D-04 seguirem pendentes no momento do PR, arquivar a change com as
      tasks 4.3/6.1/8.x explicitamente em aberto — não é bloqueio para mergear o que já está pronto
      (CA-11 cobre isso: "nenhuma regra pendente foi inventada", não "nenhuma pendência pode
      existir"). — decisão tomada: **abrir o PR agora** com as tasks 4.3, 6.1, 7.2, 7.3
      (parcial), 7.4 e 8.1–8.4 em aberto; CA-04/CA-07/CA-10 registrados como não atendidos
      integralmente. PR llsilvas/menthoros-front**#108** mergeado em `develop` em 2026-09-07,
      CI verde (lint/build/testes, E2E, GitGuardian). Arquivamento da change fica para quando as
      pendências (D-01 a D-04, tasks 8.1–8.4) forem resolvidas.
