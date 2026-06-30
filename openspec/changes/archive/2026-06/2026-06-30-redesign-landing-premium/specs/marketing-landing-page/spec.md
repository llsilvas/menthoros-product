## MODIFIED Requirements

### Requirement: Landing premium token-driven na home
O sistema SHALL renderizar na home (`/`) a landing premium (Nav, Hero, Pain, HowItWorks, Delta,
Capabilities, Fit, Trust, Faq, FinalCta, Footer), consumindo um tema MUI derivado de `premiumTokens`,
**sem hex cru** nos componentes.

#### Scenario: Home renderiza a landing premium
- **WHEN** um visitante abre `/`
- **THEN** o frontend MUST renderizar a composição premium de seções
- **AND** os componentes MUST consumir tokens/palette (nenhum hex cru)

#### Scenario: Tema premium escopado
- **WHEN** a landing renderiza
- **THEN** ela MUST usar o tema premium via `ThemeProvider` local
- **AND** as rotas autenticadas MUST manter o tema atual (sem regressão fora da landing)

#### Scenario: Disciplina de cor
- **WHEN** uma seção renderiza
- **THEN** o lime (`primary.main`) MUST aparecer apenas como marca/ação (≤3 momentos por seção)
- **AND** no gráfico de carga as séries MUST mapear CTL→`primary`, ATL→`text.secondary`, TSB→`warning`

---

## ADDED Requirements

### Requirement: Captura de lead inline integrada à waitlist
O sistema SHALL prover, na seção final (FinalCta), um formulário que registra o interessado via
`POST /api/v1/waitlist`, reusando a mesma lógica da rota `/waitlist`.

#### Scenario: Envio inline bem-sucedido
- **WHEN** o form inline é preenchido (email, nome, nº de atletas, aceite LGPD) e enviado
- **THEN** o sistema MUST fazer `POST /api/v1/waitlist`
- **AND** MUST exibir o estado de sucesso
- **AND** MUST preservar os valores em caso de erro

#### Scenario: Mapeamento de nº de atletas para faixa
- **WHEN** o número de atletas é informado
- **THEN** o sistema MUST mapear para a faixa (`1–10→ATE_10`, `11–30→DE_11_A_30`,
  `31–100→DE_31_A_100`, `>100→MAIS_DE_100`)
- **AND** MUST enviar `perfil = TREINADOR`

#### Scenario: Aceite LGPD obrigatório
- **WHEN** o checkbox de aceite LGPD não está marcado
- **THEN** o form MUST bloquear o envio
- **AND** MUST exibir aviso com link para `/privacidade`

#### Scenario: Rota /waitlist preservada
- **WHEN** um visitante acessa `/waitlist`
- **THEN** a página dedicada MUST continuar funcional, gravando no mesmo endpoint

---

### Requirement: Acessibilidade da landing
O sistema SHALL preservar foco visível, headings semânticos, FAQ navegável por teclado e respeitar
`prefers-reduced-motion`.

#### Scenario: Navegação por teclado e foco
- **WHEN** o usuário navega por teclado
- **THEN** o foco MUST ser visível (outline `primary`)
- **AND** o FAQ MUST ser operável por teclado

#### Scenario: Movimento reduzido
- **WHEN** o usuário tem `prefers-reduced-motion`
- **THEN** as animações de entrada (`Reveal`) MUST ser suprimidas/reduzidas
