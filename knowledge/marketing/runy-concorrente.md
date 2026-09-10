# Concorrente — runy (runy.app)

> Resumo: concorrente brasileiro direto do Menthoros no mercado de assessorias de
> corrida/endurance. Compete no eixo "operação da assessoria" (treino + comunicação +
> cobrança + desafios) com app nativo do atleta; o Menthoros compete no eixo "decisão do
> coach" (fila de atenção + IA explicável). Tração declarada: +150 assessorias, +10.000
> atletas. Importa para priorização, pricing e para a régua de "o que vira table stakes".

## O que é

- Plataforma de gestão para assessorias esportivas — posicionamento de landing:
  "pare de gerenciar sua assessoria por whatsapp e planilhas".
- Fundador/dev solo: Rafael Nhimi Longuinhos (mesmo perfil de capacidade do Menthoros).
- Presença: painel web (coach) + app nativo do atleta (iOS + Android, na loja).

## Feature set (verificado na landing e nas lojas, 2026-09-10)

| Área | runy | Menthoros |
|---|---|---|
| Prescrição de treino (individual/lote, templates, periodização) | ✅ | ✅ |
| Acompanhamento (gráficos, evolução, status em tempo real) | ✅ | ✅ |
| IA para prescrição/análise de treino | ✅ (beta) | ✅ (explicável, coach-in-the-loop) |
| Fila de atenção / priorização de decisão ("quem olhar primeiro") | ❌ | ✅ **diferencial** |
| Chat nativo atleta↔coach | ✅ | ⚠️ planejado (Sprint 28) |
| Gestão financeira / cobrança recorrente (Pix/cartão) | ✅ | ❌ fora de escopo |
| App nativo do atleta (loja) | ✅ | ❌ PWA planejado (`add-athlete-pwa-installable`) |
| Desafios gamificados + compartilhamento social c/ logo | ✅ | ❌ anti-escopo |
| Integrações | Garmin, Apple Watch, Polar, Strava, Amazfit, Coros (em breve) | intervals.icu, Garmin (FIT upload), Strava (deferida) |

## Pricing (benchmark de referência)

- Starter **R$ 99,90/mês** até 20 atletas; acima disso, por atleta ativo (sem mensalidade fixa).
- Teste grátis 7 dias, sem cartão.
- Oferta de migração de dados "em até 1 dia" + loja de produtos da assessoria.

## Tração / sinais

- Landing: "+150 assessorias, +10.000 atletas" (claim não verificado).
- Google Play: 1K+ downloads; iOS 17.6+, rating 4+ (categoria Health & Fitness).
- IG `@runy.app`: 1.282 seguidores, grid ~100% carrossel.

## Estratégia de conteúdo no Instagram (observado)

- **Comunidade como apelo central:** slogan "nunca corra sozinho", CTA "compartilhe o seu",
  resumo semanal de destaques do endurance (cadência semanal), desafios mensais com prêmios, e
  UGC de atleta mostrando o app e marcando a assessoria. O produto é emoldurado como hub de
  comunidade de corrida, não só ferramenta de gestão.
- **Fotografia real de corredores nos carrosséis:** os posts usam fotos de pessoas correndo
  (ambiente urbano/pista) com overlay de dados (distância, ritmo, tempo) e mensagem motivacional —
  não gráficos vetoriais nem mockup puro. Ex.: post de treino concluído vira arte "CORRIDA ·
  DISTÂNCIA 10,02 km · RITMO 06:05 · os melhores treinos são aqueles que fazem você voltar amanhã".
  Verificado visualmente (2 posts analisados).
- **Contraste com o Menthoros:** o pipeline atual do `@menthoros` gera **fundo sem pessoas**
  (gpt-image) + texto/logo overlay e gráficos vetoriais (SVG). O runy aposta em **pessoa real
  correndo** — hipótese de que fotografia humana converte mais (a validar por teste A/B; não é fato).

## Por que importa para o Menthoros

- É concorrente real e operante no **mesmo ICP** (assessorias 10–200 atletas), com tração que
  o Menthoros ainda não tem. Não é clone de Strava — é o mesmo "quem compra" (o coach/assessoria).
- **Compete em eixo diferente:** runy vende *operação* (cobrança, chat, desafios, app do atleta);
  Menthoros vende *decisão* (fila de atenção, IA explicável, TSB/CTL/decoupling). O risco
  competitivo é o runy tornar "app nativo + cobrança" a régua de table stakes e o coach comprar por
  operação antes de sentir a dor de decisão.
- **O pricing de R$ 99,90/até 20 atletas é o benchmark** para o modelo de negócio do Menthoros
  (ainda indefinido — ver `knowledge/company/company-overview.md`).

## Fontes

- https://runy.app/
- App Store (id6739982287), Google Play (com.runymobile)
- https://www.instagram.com/runy.app/

## Status: fato estabelecido (verificado na landing, lojas e IG em 2026-09-10)
