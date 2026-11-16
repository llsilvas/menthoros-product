# Tasks — add-translation-glossary

Repo: `apps/menthoros-backend`. Validação: `./mvnw clean test`; final `./mvnw clean verify`.
Branch: `feat/add-translation-glossary`, em worktree. **Depende de** `consolidate-llm-on-openai` mergeada.

- [ ] 1.1 Coach fecha a lista do glossário (Open Question). Verify: lista no proposal.
- [ ] 1.2 Glossário e regra de rótulos em `translate-field-prompt.txt`. Verify: teste do template.
- [ ] 2.1 Pós-processador de números e unidades, aplicado em `WorkoutAnalysisTranslator` (CA1).
      Verify: teste parametrizado vermelho antes, verde depois.
- [ ] 3.1 Checagem de cobertura de frases no script do comparativo (CA3).
- [ ] 3.2 Rodar o comparativo de novo (só `gpt-6-luna none`) e anotar ocorrências do glossário (CA2).
- [ ] 4.1 `./mvnw clean verify`; PR → `develop`.
