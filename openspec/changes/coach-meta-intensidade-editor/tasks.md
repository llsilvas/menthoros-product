# Tasks — coach-meta-intensidade-editor (M · Full · backend + front)

> **Bloqueada por `fix-fc-alvo-base-inconsistente`.** Aquela change estabelece a meta de intensidade
> como escolha declarada e a resolução para bpm absoluto. Começar esta antes significa expor no
> editor uma escolha que o backend ainda resolve por precedência.
>
> **Anchors verificados em 2026-08-02.** Modelo do Garmin validado na UI do Garmin Connect.
> Branch coordenada nos dois repos; **backend primeiro**.

## 0. Discovery

- [ ] **0.1 Levantar o `fcAlvoEtapa` legado** — quantas etapas existem, quantas casam com cada padrão
  do parser (`bpm`, `%`, `z1-z5`) e quantas não casam com nenhum
  - ✅ **Parte estrutural feita em 2026-08-02** (executando os regexes contra entradas plausíveis):
    aceitos são `140-150 bpm`, `140-150bpm`, `60-70%`, `60-70% FCmax`, `Z2`, `z2-z3`, `Z2-3`.
    **Viram nenhuma meta:** `140 - 150 bpm` (espaços no hífen), `150 bpm` (valor único),
    `140-150` (sem unidade), `Z2 (140-150 bpm)`, `Zona 2`, `Z2 a Z3`, texto descritivo.
    Um espaço a mais basta para a prescrição sumir
  - ⏳ **Falta a contagem contra dados reais** — o Postgres de dev estava fora do ar em 2026-08-02.
    As que não casam são as que **hoje já vão sem meta em silêncio**; o número dimensiona o problema
    e decide a estratégia do CA6
  - **Sem `head`/truncagem no levantamento** — contar antes de olhar linha a linha
- [ ] **0.2 Decidir a estratégia para o legado** — migrar, interpretar na leitura ou pedir revisão —
  [CA6]
  - ⚠️ A opção que **não** serve: abrir o editor e descartar em silêncio o que o treinador escreveu

## 1. Contrato

- [ ] **1.1 O tipo da meta entra no contrato** da etapa (input e output), em vez de o backend inferir
  de qual campo veio preenchido — [CA1]
  - Vocabulário do produto: "meta de intensidade", "sem objetivo"
- [ ] **1.2 Persistir o tipo escolhido**, distinguindo `Sem objetivo` de "não informado" — [CA2]
  - ⚠️ Ligado ao CA10 da change A: "treinador escolheu não prescrever" e "prescrição descartada por
    falta de dado" precisam continuar distinguíveis
- [ ] **1.3 Regenerar/portar o cliente OpenAPI** no front conforme a convenção do
  `apps/menthoros-front/CLAUDE.md` (fachada curada — **não** sobrescrever `src/api` com saída crua)

## 2. Editor

- [ ] **2.1 Seletor de meta de intensidade por etapa** — `Sem objetivo` (default), `Ritmo`,
  `Zona de frequência cardíaca`, `Frequência cardíaca personalizada` — [CA1]
  - Cadência e potência ficam fora: produto é corrida e não há dado de potência no domínio
- [ ] **2.2 Campos dependentes do tipo** — faixa de bpm, seletor de zona ou faixa de ritmo — [CA1]
- [ ] **2.3 Eliminar o texto livre de intensidade** — [CA3]
  - ⚠️ Hoje `TreinoEditDialog.tsx:201-209` é um `TextField` rotulado "Zona alvo" ligado a
    `fcAlvoEtapa` (`:106`). O treinador digita `"Z2"`, `"140-150 bpm"`, `"70-80% FCmax"` ou algo que
    o parser não reconhece — e este último vira **nenhuma meta**, sem aviso
- [ ] **2.4 Corrigir o rótulo enganoso** — "Zona alvo" deixa de nomear um campo que guarda alvo de
  FC — [CA7]
- [ ] **2.5 Apresentar o legado de forma compreensível** ao abrir um plano antigo — [CA6]
  - `verify:` o treinador vê o que será enviado; nada é descartado em silêncio

## 3. Verificação

- [ ] **3.1** Teste de componente: escolher cada tipo mostra os campos certos e só eles — [CA1] [CA3]
- [ ] **3.2** Teste: `Sem objetivo` salva como escolha, não como campo vazio — [CA2]
- [ ] **3.3** Teste: zona escolhida no editor chega ao push como bpm resolvido — [CA5]
  - ⚠️ Afirmar o **valor**, não a presença do campo. Foi asserção de forma, e não de valor, que
    deixou o BUG-CONF-001 e o bug de FC passarem
- [ ] **3.4** Backend: `./mvnw clean verify` verde
- [ ] **3.5** Front: `npm run lint`, `npm run build`, `npm run test:run` verdes
- [ ] **3.6 Validar ponta a ponta**: prescrever cada tipo de meta no editor e conferir no relógio

## Fora de escopo — abrir como change própria

- **Resolver alvo para bpm no push** — é a `fix-fc-alvo-base-inconsistente`.
- **Mudar o modelo de zonas** (`ZonaTreinoService` segue Friel %LTHR).
- **Cadência e potência** como metas de intensidade.
- **Ampliar o eixo de duração** para o modelo Garmin completo (`Pressionar botão Lap` etc.).
