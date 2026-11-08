# Tasks — athlete-share-cards

## 0. Gates do Full track

- [ ] 0.1 Rodar `product-reviewer` sobre o `proposal.md` e incorporar o veredito
- [ ] 0.2 Rodar o pre-mortem (`/codex:adversarial-review`) e incorporar em "Riscos e mitigações"
- [ ] 0.3 Decidir Q1 (lib), Q2 (nota publicável), Q3 (tipografia) e Q4 (pontos de entrada); escrever o `design.md`
- [ ] 0.4 Confirmar que `logoUrl`, nome da assessoria e nome do treinador chegam ao atleta pelo contrato atual; se não, abrir task de backend

## 1. Fundação da tela

- [ ] 1.1 Rota `ATHLETE_SHARE_WORKOUT` em `constants/routes.ts` e página `features/athlete/pages/AthleteShareWorkoutPage.tsx`
- [ ] 1.2 Hook `useShareWorkout(treinoId)`: carrega treino realizado, semana, melhores esforços, prova-alvo/PMC; expõe `loading`/`error`/dados
- [ ] 1.3 Adapter `buildShareCardDataFromWorkout` (puro, testado): API → view model dos cards (aderência, tiros, zonas, assinatura, atribuição)
- [ ] 1.4 Componentes de controle: `ShareModelPicker` (radiogroup), `ShareFormatPicker`, `ShareOptionSwitch`, `ShareDestinations`; alvos ≥ 44 px
- [ ] 1.5 Testes de componente: estados loading/error/empty; modelos condicionais (CA2)
- [ ] 1.6 Validação: `npm run lint && npm run build && npm run test:run`

## 2. Componentes compartilhados dos cards

- [ ] 2.1 `GarminAttribution`: "GARMIN {deviceModel}" / "GARMIN" / nada conforme `fonteDados`; variante com frase de dado derivado
- [ ] 2.2 `ShareSignature`: logo (`logoUrl`) com sigla como fallback, nome, "Treinado por"; modos completa / só assessoria / nenhuma; tema escuro e lime
- [ ] 2.3 `ShareCardFrame`: fundo `surface-900` com brilho lime, vidro por tokens `glass-*`, tamanhos 9:16 / 4:5 / 1:1
- [ ] 2.4 Testes: CA3 e CA4
- [ ] 2.5 Validação: `npm run lint && npm run build && npm run test:run`

## 3. Modelos

- [ ] 3.1 `PlanVsActualCard` (story): manchete, perfil de etapas com pace por tiro, faixa de zonas em %
- [ ] 3.2 `SplitsCard` (feed): barras por tiro, faixa-alvo, destaque do último
- [ ] 3.3 `WeekCard` (quadrado): bento com km, barras por dia em `categorical-*` do tipo, fitness, treinos, tempo ou assinatura
- [ ] 3.4 `CoachNoteCard` (story): condicionado a nota publicável (Q2)
- [ ] 3.5 `BestEffortCard` (feed): condicionado a melhor esforço do treino
- [ ] 3.6 `RaceCountdownCard` (story): dias para a prova, barra do ciclo, CTL, projeção
- [ ] 3.7 Testes de componente por modelo com dados reais de fixture; nenhum `MOCK_*` restante
- [ ] 3.8 Validação: `npm run lint && npm run build && npm run test:run`

## 4. Geração e destinos

- [ ] 4.1 Adicionar a lib decidida em Q1 (aprovação de dependência) e `useShareImage`: aguarda `document.fonts.ready`, exporta em 1080 px, modo de exportação sem `backdrop-filter`/grão
- [ ] 4.2 Destinos: Web Share API com `files` (Stories, WhatsApp, Mais) e download (Salvar); fallback para download quando `navigator.canShare` falhar
- [ ] 4.3 Teste de componente: Salvar dispara download com dimensões corretas por formato
- [ ] 4.4 Validação: `npm run lint && npm run build && npm run test:run`

## 5. Pontos de entrada e E2E

- [ ] 5.1 Botão "Compartilhar" no detalhe do treino realizado e no card da semana (conforme Q4)
- [ ] 5.2 E2E (atravessa contrato da API e dado do atleta): abrir treino → compartilhar → trocar modelo e formato → alternar assinatura → Salvar gera PNG; treino manual não mostra atribuição Garmin
- [ ] 5.3 Validação: `npm run lint && npm run build && npm run test:run && npm run test:e2e`

## 6. Backend (só se Q2 = por nota)

- [ ] 6.1 Campo `publicavel` na nota do treinador + migration + toggle na tela do coach; default falso
- [ ] 6.2 Validação: `./mvnw clean test`
