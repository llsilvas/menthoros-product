# North Star — Otimizar a rotina do coach

> Resumo: Define o North Star do Menthoros, a métrica que o mede, a métrica da fase atual
> (turma fundadora) e os quatro critérios que toda feature deve atender. É o filtro nº 1 de
> priorização de qualquer proposta de produto.

## O que é

O North Star do Menthoros é **otimizar a rotina do coach**.

Toda feature deve melhorar pelo menos um destes quatro critérios:

1. **Economizar tempo do coach**;
2. **Melhorar a qualidade das decisões**;
3. **Ajudar o coach a atender mais atletas sem perder personalização**;
4. **Tornar risco/progresso do atleta mais fácil de ver e agir**.

## Métrica do North Star (ratificada pelo founder em 2026-11-20)

**Minutos de revisão do coach por atleta por semana, com aderência do atleta igual ou melhor.**

- **Direção:** cair. Menos minutos por atleta é o que permite ao coach atender mais atletas
  (critérios 1 e 3).
- **Trava:** a aderência do atleta não pode cair. Minuto economizado com aderência pior não
  conta como avanço (critério 2).
- **Sinais de apoio**, sempre lidos junto com a métrica:
  - % de sugestões aceitas sem edição (tendência de alta) — nunca reportado sozinho, sempre com
    sinal de desfecho;
  - retenção de 90 dias dos atletas;
  - atletas por coach.

Origem: métrica candidata da bússola (`strategic-compass.md` §7, 2026-09-23), que deixou de ser
lente e passou a ser gate nesta data.

### Como medir — estado em 2026-11-20

| Componente | Estado | Fonte |
|---|---|---|
| Decisão do coach (aceito / editado / rejeitado) | Capturado | `add-coach-suggestion-decision-audit` (arquivada 2026-10-09) |
| Diff da edição do coach | Capturado | `add-coach-suggestion-edit-delta` (arquivada 2026-10-22) |
| Aderência do atleta | Capturado | spec `athlete-adherence` |
| **Minutos de revisão por atleta** | **Não medido** | `SugestaoCoach` grava `reviewedAt`, mas não o instante em que o coach abre a sugestão — lacuna |
| Baseline | **Inexistente** | Sem assessoria de fora ativa (ver métrica de fase) |

Rótulo: a métrica é **decisão vigente**; a forma de medir o tempo de revisão é **hipótese** — um
proxy inicial possível é o intervalo entre a abertura da sugestão (a capturar) e o `reviewedAt`
já gravado, a confirmar contra o código antes de virar change.

## Métrica de fase — turma fundadora

Vale enquanto a turma fundadora estiver nos 60 dias de teste. Não substitui o North Star: sem
assessoria ativada não existe revisão para medir.

**Ativação da assessoria:** a assessoria tem **≥ 5 atletas conectados na primeira semana** e o
coach **revisa a primeira proposta em até 7 dias**.

| Indicador | Meta | Estado |
|---|---|---|
| Convidados que revisam a primeira proposta em 7 dias | ≥ 60% | Não medido |
| Assessorias com ≥ 5 atletas conectados na semana 1 | Toda fundadora | Não medido |
| Conversão em Basic no dia 60 | ≥ 7 de 10 (plano de growth, 2026-11-19) | Nenhuma fundadora chegou ao dia 60 |

Leitura de base (2026-11-19, lista de produção informada pelo founder): 3 treinadores de fora,
nenhum ativo; 5 atletas de fora, 3 sem retorno depois do cadastro. Em 2026-11-10, 8 de 10
atletas não tinham nenhum treino realizado ingerido.

**Regra de desempate da fase:** entre duas propostas de ROI parecido, vence a que encurta o
caminho do coach até a primeira proposta revisada.

**Expira:** na revisão do dia 60 da turma fundadora. Depois disso, a métrica do North Star é a
única.

## Por que importa para o Menthoros

- É o critério de corte do funil de produto: proposta que não atende a nenhum dos quatro
  critérios não é priorizada (ver `cpo-operating-model.md`).
- Protege o produto de virar "dashboard passivo de métricas" — o valor está em responder às
  perguntas operacionais diárias do coach: quem precisa de atenção, por quê, e o que fazer a
  seguir.
- Dá à priorização um número: toda proposta declara de que modo mexe nos minutos de revisão por
  atleta ou na aderência. "Tem IA" não é resposta.

## Detalhes

As quatro perguntas operacionais que toda tela coach-facing deve ajudar a responder:

1. Quem precisa de atenção primeiro?
2. Por que este atleta precisa de atenção?
3. O que devo fazer a seguir?
4. O que deve chegar ao atleta depois que eu aprovar?

## Questões abertas

- Instrumentar o tempo de revisão por atleta (nenhuma change cobre isso hoje).
- Linha de conversão do dia 60: o Founder Pack de 2026-10-31 fixou "4 de 10 pagam" como linha de
  sucesso; o plano de growth de 2026-11-19 usa "≥ 7 de 10" como meta. Decidir qual vale como gate
  da decisão de fim de programa.

## Histórico

- 2026-11-20 — founder ratifica a métrica da bússola como métrica do North Star e adiciona a
  métrica de fase (ativação da turma fundadora).
- 2026-07-02 — versão inicial: frase-guia e quatro critérios, sem métrica.

## Fontes

- `PROJECT.md` §1 (raiz do workspace) — origem da frase-guia e dos critérios.
- `openspec/config.yaml` — filosofia de produto canônica.
- `knowledge/product/strategic-compass.md` §7 — origem da métrica.
- Vault `60-Growth/Decisoes de Growth - 2026-11-19.md` e `10-Product/Founder Pack - Menthoros 2026-10.md`
  — leitura de uso em produção e metas da turma fundadora.

## Status: fato estabelecido (decisão de produto vigente, ratificada em 2026-11-20); forma de medir o tempo de revisão = hipótese
