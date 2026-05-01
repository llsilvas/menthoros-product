# Design System Master — Menthoros

> **LÓGICA:** Ao construir uma página específica, verificar `design-system/menthoros/pages/[page].md` primeiro.
> Se existir, suas regras **substituem** este arquivo. Caso contrário, seguir este MASTER.

---

## Produto

- **Tipo:** Sports Coaching SaaS — gestão de atletas de corrida
- **Mercado:** Brasil (PT-BR)
- **Stack:** React 19 + MUI v7 + Emotion (sem Tailwind)
- **Tokens centralizados em:** `src/theme/tokens.ts`

---

## Paleta de Cores

| Token | Hex | Uso |
|---|---|---|
| `primary.dark` | `#082130` | Background base, gradiente início |
| `primary.main` | `#0e3147` | Gradiente meio, superfícies |
| `primary.light` | `#1a4a66` | Gradiente fim, bordas |
| `secondary.main` | `#b1e92d` | Accent lime — ícones ativos, labels de seção |
| `secondary.cta` | `#b3ff00` | Botões CTA primários |
| `secondary.ctaHover` | `#c8ff4d` | Hover dos CTAs |
| `text.white` | `#ffffff` | Títulos sobre fundo escuro |
| `text.muted` | `rgba(255,255,255,0.65)` | Corpo de texto sobre fundo escuro |
| `text.faint` | `rgba(255,255,255,0.35)` | Metadados, copyright |

### Gradiente de Fundo
```
linear-gradient(135deg, #082130 0%, #0e3147 50%, #1a4a66 100%)
```

### Vinheta lateral (hero banner full-width)
```
linear-gradient(90deg, #082130f2 0%, #082130aa 16%, rgba(8,33,48,0.18) 38%,
  rgba(8,33,48,0.18) 62%, #082130aa 84%, #082130f2 100%)
```

---

## Glassmorphism

| Propriedade | Valor |
|---|---|
| `backgroundColor` | `rgba(255, 255, 255, 0.07)` |
| `backdropFilter` | `blur(12px)` |
| `border` | `1px solid rgba(255, 255, 255, 0.13)` |
| `borderRadius` | `16px` |
| Hover border | `rgba(179, 255, 0, 0.28)` |
| Hover bg | `rgba(255, 255, 255, 0.11)` |

### Card com destaque lime
```
border: 2px solid #b3ff00
background: rgba(179,255,0,0.06)
```

---

## Tipografia

| Papel | Família | Peso | Tamanho típico |
|---|---|---|---|
| Display / Títulos | **Syne** | 800 | 32–72px |
| Corpo / UI | **Inter** | 300–600 | 13–19px |
| Dados numéricos | **Space Mono** | 400 | 12–18px |

### Import Google Fonts (já em `index.html`)
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
```

### Section Label padrão
```
color: #b3ff00 | fontSize: 12px | fontWeight: 600 | letterSpacing: 2px | textTransform: uppercase
```

---

## Componentes Padrão

### Botão CTA Primário
```
backgroundColor: #b3ff00
color: #082130
fontWeight: 700
borderRadius: 10px
hover: backgroundColor #c8ff4d + translateY(-1px)
boxShadow: 0 4px 20px rgba(179,255,0,0.35)
```

### Botão Ghost / Outlined
```
borderColor: rgba(255,255,255,0.28)
color: #fff
borderRadius: 10px
hover: borderColor rgba(255,255,255,0.55) + bg rgba(255,255,255,0.05)
```

### Feature Card com imagem
```
glassCard + overflow: hidden
image height: 200px | objectFit: cover
gradient overlay: linear-gradient(to bottom, rgba(8,33,48,0.05), rgba(8,33,48,0.72))
badge: bg rgba(179,255,0,0.12) | border rgba(179,255,0,0.22) | color #b3ff00
hover: translateY(-3px) + borderColor rgba(179,255,0,0.28)
```

### Badge "Powered by IA"
```
bg: rgba(8,33,48,0.72) | backdropFilter: blur(8px)
border: 1px solid rgba(179,255,0,0.3) | borderRadius: 20px
```

---

## Assets de Marca

| Arquivo | Uso |
|---|---|
| `src/assets/icons/logo_transparent.png` | Navbar da landing page (fundo transparente) |
| `src/assets/icons/menthoros_navbar.png` | Footer e dashboard header |
| `src/assets/icons/menthoros_icon.png` | Favicon / ícone app |
| `src/assets/icons/logo_menthoros.svg` | SVG complexo (uso limitado) |

### Logo no Navbar da Landing
```
src: logo_transparent.png | height: 48px
filter: drop-shadow(0 0 10px rgba(179,255,0,0.2))
acompanhado de Typography Syne 800: "MENTH" branco + "OROS" lime (#b3ff00)
```

---

## Imagens — Landing Page (`src/assets/images/landing/`)

| Arquivo | Conteúdo | Seção |
|---|---|---|
| `hero-banner.jpeg` | Panorâmica corredor + coach + robô IA | Hero (fundo full-width com vinheta) |
| `coach-dashboard.jpeg` | Treinador olhando dashboard | "Treinador no centro" |
| `metrics-analysis.jpeg` | Métricas de treino + gráficos | Feature — Análise de Performance |
| `attention-queue.jpeg` | Fila de atenção com prioridades | Feature — Gestão Operacional |
| `ai-explainer.jpeg` | Robô IA + painel recomendação | Feature — IA Explicável |
| `runner-back.jpeg` | Corredor de costas | "Como funciona" (background) |
| `runner-uniform.jpeg` | Uniforme Menthoros frente+costas | Brand banner "Smarter Training" |
| `runner-portrait.jpeg` | Atleta correndo — retrato | Avatar testimonial |
| `coach-polo.jpeg` | Treinador com polo Menthoros | Avatar testimonial |
| `team-office.jpeg` | Equipe em escritório + dashboards | CTA final (background) |

---

## Redes Sociais

| Rede | Handle | Link |
|---|---|---|
| Instagram | @Menthoros | https://instagram.com/Menthoros |

---

## Roteamento (React Router v7 — Hash-based)

| Rota | Componente | Layout |
|---|---|---|
| `/` | `LandingPage` | Standalone (sem DashboardLayout) |
| `/atletas` | `AtletasList` | `DashboardLayout` |
| `/treinos` | stub | `DashboardLayout` |
| `/planos` | stub | `DashboardLayout` |
| `/calendario` | stub | `DashboardLayout` |
| `/relatorios` | stub | `DashboardLayout` |
| `/configuracoes` | stub | `DashboardLayout` |

---

## Transições

| Tipo | Valor |
|---|---|
| Padrão | `all 0.25s ease` |
| Rápida (hover) | `all 0.2s` |
| Cor apenas | `color 0.2s` |

---

## Checklist Pré-Entrega

- [ ] Sem emojis como ícones (usar MUI Icons ou SVG)
- [ ] `cursor-pointer` em todos os elementos clicáveis
- [ ] Hover com feedback visual + transição 150–300ms
- [ ] Contraste de texto mínimo 4.5:1
- [ ] Focus states visíveis (navegação por teclado)
- [ ] `prefers-reduced-motion` respeitado
- [ ] Responsivo em 375px, 768px, 1024px, 1440px
- [ ] Sem scroll horizontal no mobile
- [ ] Alt text em todas as imagens com conteúdo
