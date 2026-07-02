# Coach-in-the-loop — Princípio central do produto

> Resumo: O princípio inegociável do Menthoros: a IA analisa, prioriza, sugere,
> explica e rascunha — mas o coach é sempre o decisor. Nenhuma decisão de treino
> gerada por IA chega ao atleta sem ação explícita do coach.

## O que é

O Menthoros é construído sobre um modelo estrito de **coach-in-the-loop**:

- A IA pode: analisar dados, priorizar atletas, sugerir ajustes, explicar o porquê,
  rascunhar planos.
- A IA não pode: enviar qualquer decisão de treino ao atleta sem aprovação explícita
  do coach.

## Por que importa para o Menthoros

- É o diferencial de posicionamento contra geradores autônomos de plano e chatbots
  que falam direto com o atleta.
- É guardrail de segurança/responsabilidade: prescrição de treino tem risco físico;
  a responsabilidade final é do profissional.
- Define o loop de valor do produto:

```text
dados de treino do atleta
→ sinais de atenção
→ recomendação de IA explicável
→ coach revisa/edita/aprova
→ atleta recebe o plano aprovado
→ novos dados alimentam a próxima decisão
```

## Detalhes

Corolários de design:

- Toda sugestão de IA deve ser **explicável** (o coach entende o porquê antes de aprovar).
- Automação existe para remover carga operacional da rotina do coach, não para
  remover o coach da jornada do atleta.
- O mesmo princípio se aplica internamente à operação do produto:
  **founder-in-the-loop** (ver `cpo-operating-model.md`).

## Fontes

- `PROJECT.md` §1 (raiz do workspace).

## Status: fato estabelecido (princípio inegociável do produto)
