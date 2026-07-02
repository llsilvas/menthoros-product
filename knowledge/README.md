# Knowledge Base — O Cérebro do Menthoros

Esta pasta é a base de conhecimento central do Menthoros: o contexto de domínio,
decisões e vocabulário que qualquer pessoa ou agente precisa entender antes de
propor, avaliar ou implementar algo no produto.

`knowledge/` é referência (o que é verdade sobre o domínio, o negócio e o produto).
`openspec/`, `prd/` e `adr/` são ação/decisão (o que estamos construindo e por quê).
Uma PRD ou change deve **citar** `knowledge/`, não duplicar seu conteúdo.

## Áreas

| Pasta | Conteúdo |
|---|---|
| `product/` | Princípios de produto, personas, North Star, posicionamento, vocabulário de produto |
| `company/` | Missão, modelo de negócio, mercado-alvo, estágio da empresa, restrições estratégicas |
| `coaching/` | Metodologia de treinamento, modelos de treinador (ex. Friel), práticas de prescrição |
| `physiology/` | Fisiologia do exercício, zonas de FC, carga de treino (CTL/ATL/TSB), conceitos científicos |
| `engineering/` | Decisões de arquitetura, convenções técnicas duráveis, trade-offs de plataforma |
| `marketing/` | Posicionamento de mercado, mensagem, ICP, canais, tom de voz |
| `ux/` | Padrões de interação, heurísticas de design, pesquisa de usuário, princípios de UI |

## Convenções

- Um arquivo por tópico coeso, nomeado em kebab-case (`fc-limiar-zones.md`, `friel-periodization-model.md`).
- Cada arquivo deve começar com um resumo de 2-3 linhas do que ele cobre e por que importa para decisões de produto.
- Citar fontes externas quando o conteúdo vier de literatura/pesquisa (ex. livros, papers, benchmarks de mercado).
- Marcar claramente o que é fato estabelecido vs. hipótese/opinião da equipe.
- Atualizar em vez de duplicar: se um conceito já existe em outro arquivo, linkar em vez de reescrever.
- Esta pasta não substitui o OpenSpec — specs de capability ficam em `openspec/specs/`, não aqui. `knowledge/` é o "porquê"/contexto; `openspec/` é o "o quê" versionado como contrato.

## Quando usar cada pasta

- Fazendo uma PRD e precisa entender o modelo de periodização do Friel? → `coaching/`
- Decidindo como calcular TSB para um novo relatório? → `physiology/`
- Escrevendo copy para a landing page? → `marketing/`
- Revisando um novo fluxo de tela para o coach? → `ux/`
- Justificando uma escolha de arquitetura (ex. por que RAG e não fine-tuning)? → `engineering/`
- Explicando por que o Menthoros existe e para quem? → `company/` + `product/`

## Manutenção

Ao final de uma discovery, pesquisa de mercado, ou decisão técnica relevante, extrair
o conhecimento durável (não o artefato de decisão em si) para o arquivo apropriado em
`knowledge/`. A PRD/ADR/change referencia o arquivo de `knowledge/`; não copia o conteúdo.

Revisar `knowledge/` na mesma cadência da revisão periódica do OpenSpec (antes de cada
sprint): conteúdo desatualizado ou contraditório deve ser corrigido ou removido.

Last reviewed on: 2026-07-01
