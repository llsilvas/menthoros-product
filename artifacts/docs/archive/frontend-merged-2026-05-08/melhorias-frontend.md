# Sugestoes de Melhorias - Frontend Menthoros

Documento gerado a partir da analise do projeto frontend do Menthoros.
Cada sugestao inclui o problema identificado, o impacto e a abordagem recomendada.

---

## 1. Tipagem TypeScript

### 1.1 Interfaces desatualizadas em relacao ao backend

**Problema:** As interfaces `TreinoPlanejado` e `EtapaTreino` estavam incompletas — campos como `tssPlanejado`, `intensidadePlanejada`, `justificativaIa`, `fonteDados`, `ordem`, `descricaoEtapa`, `fcAlvoEtapa` e `repeticoes` nao existiam. Isso forca o uso de `any` e impede o autocomplete da IDE.

**Impacto:** Bugs silenciosos ao acessar campos inexistentes, perda de type-safety, produtividade reduzida.

**Recomendacao:**
- Manter as interfaces sincronizadas com o contrato da API (Swagger/OpenAPI).
- Considerar gerar tipos automaticamente a partir do schema do backend (o projeto ja usa `npm run generate:api` para os services — estender isso para gerar tipos tambem).
- Evitar `any` — o campo `diaSemana` estava tipado como `string | any`, o que anula a verificacao do TypeScript.

### 1.2 Union types para enums do backend

**Problema:** O backend retorna campos que podem ser strings simples ou objetos com `{ value, label, description, color }`. As interfaces usam `string | { ... }` mas nao ha um tipo reutilizavel para isso.

**Recomendacao:** Criar um tipo generico `BackendEnum`:

```typescript
interface BackendEnum {
  value: string;
  label: string;
  description?: string;
  color?: string;
  order?: number;
}

type EnumField = string | BackendEnum;
```

Usar `EnumField` em todos os campos que seguem esse padrao (`statusTreino`, `fonteDados`, `diaSemana`, `tipoEtapa`).

---

## 2. Duplicacao de Codigo

### 2.1 Helpers de extracao segura (getSafeValue, getSafeNumber)

**Problema:** As funcoes `getSafeValue`, `getSafeNumber` e `getSafeBoolean` estavam duplicadas em `planosDialog.tsx` e `TreinoRealizadoDialog.tsx`. Cada dialog redeclarava as mesmas funcoes dentro do corpo do componente.

**Impacto:** Manutencao duplicada, risco de divergencia entre implementacoes.

**Acao realizada:** Extraidas para `src/utils/safeValues.ts`. Imports atualizados nos dois dialogs.

**Recomendacao adicional:** Ao criar novos componentes, sempre verificar se helpers similares ja existem em `src/utils/` antes de declarar localmente.

### 2.2 Padrao de Dialog repetitivo

**Problema:** Todos os dialogs repetem a mesma estrutura: `Dialog > DialogTitle (com close button) > DialogContent > DialogActions`. Nao ha um wrapper reutilizavel.

**Recomendacao:** Criar um componente `BaseDialog` que encapsula a estrutura comum:

```typescript
interface BaseDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  maxWidth?: 'sm' | 'md' | 'lg';
  actions?: React.ReactNode;
  children: React.ReactNode;
}
```

Isso reduz boilerplate e garante consistencia visual (posicao do botao fechar, padding, etc.).

---

## 3. Gerenciamento de Estado

### 3.1 Ausencia de state management global

**Problema:** O projeto usa apenas `useState` local e um `AuthContext`. Dados como atletas e planos sao re-carregados em cada abertura de dialog. Nao ha cache nem compartilhamento de estado entre componentes.

**Impacto:** Requisicoes redundantes ao backend, experiencia mais lenta, lógica de refresh manual (`handleSuccess` que re-fetcha dados).

**Recomendacao (por prioridade):**

1. **React Query (TanStack Query)** — solucao mais indicada para este projeto. Adiciona cache, invalidacao automatica, loading/error states, e retry. Elimina a necessidade dos hooks customizados (`usePlanoSemanal`, `useCrud`) que hoje reimplementam logica que o React Query ja resolve.

2. **Zustand** — se houver necessidade de estado global compartilhado alem de server-state (ex: configuracoes do usuario, tema, filtros persistentes).

### 3.2 Muitos `useState` individuais

**Problema:** O `TreinoRealizadoDialog` declara 15+ `useState` individuais para campos de formulario. Isso dificulta a leitura e o reset do formulario.

**Recomendacao:** Agrupar campos relacionados em um unico estado com `useReducer` ou um objeto de form state:

```typescript
const [formData, setFormData] = useState<TreinoFormData>({
  dataTreino: '',
  descricao: '',
  distanciaKm: 0,
  // ...
});
```

Ou adotar uma lib de formularios como `react-hook-form` para validacao e gerenciamento integrados.

---

## 4. Performance

### 4.1 Console.logs em producao

**Problema:** Ha dezenas de `console.log` e `console.error` espalhados nos hooks e componentes (`usePlanoSemanal.ts`, `planosDialog.tsx`, `TreinoRealizadoDialog.tsx`). Esses logs vazam dados sensiveis e poluem o console em producao.

**Impacto:** Exposicao de dados, performance degradada por serialização de objetos grandes.

**Recomendacao:**
- Remover todos os `console.log` de debug.
- Se precisar de logging, usar uma lib como `debug` ou `loglevel` com niveis configuraveis por ambiente.
- Adicionar uma regra ESLint: `"no-console": "warn"`.

### 4.2 Re-renders desnecessarios

**Problema:** Funcoes handler sao recriadas a cada render (ex: `handleGerarPlano`, `handleOpenConclusaoModal`). Em componentes com listas grandes, isso pode causar re-renders desnecessarios nos filhos.

**Recomendacao:** Usar `useCallback` para handlers passados como props para componentes filhos. O projeto ja importa `useCallback` em alguns lugares mas nao o usa de forma consistente.

### 4.3 Limpeza de estado no unmount

**Problema:** Os `useEffect` que fazem fetch nao cancelam requisicoes pendentes quando o componente desmonta ou quando o dialog fecha rapidamente.

**Recomendacao:** O projeto ja usa `CancelablePromise` na camada de API — utilizar o `.cancel()` no cleanup do `useEffect`:

```typescript
useEffect(() => {
  const promise = fetchPlanosPorAtleta(atletaId);
  return () => promise.cancel();
}, [atletaId]);
```

---

## 5. UX e Acessibilidade

### 5.1 Feedback de acoes

**Problema:** Apos gerar um plano ou marcar um treino como realizado, nao ha feedback visual de sucesso (toast/snackbar). O usuario so percebe a mudanca pela atualizacao da lista.

**Recomendacao:** Implementar um sistema de notificacoes com MUI `Snackbar` + `Alert`:

```typescript
// Contexto global de notificacoes
const { showNotification } = useNotification();
showNotification('Plano gerado com sucesso!', 'success');
```

### 5.2 Confirmacao de acoes destrutivas

**Problema:** A exclusao de planos e atletas nao possui dialog de confirmacao. O botao de delete executa a acao imediatamente.

**Recomendacao:** Adicionar um `ConfirmDialog` reutilizavel para acoes destrutivas (deletar atleta, deletar plano, cancelar plano).

### 5.3 Acessibilidade (a11y)

**Problema:** Os dialogs nao definem `aria-labelledby` nem `aria-describedby`. Icones nao possuem `aria-label`. Chips de status nao comunicam seu significado para leitores de tela.

**Recomendacao:**
- Adicionar `aria-labelledby` nos dialogs apontando para o `DialogTitle`.
- Adicionar `aria-label` em `IconButton` (ex: o botao de fechar deve ter `aria-label="Fechar"`).
- Usar `role="status"` em chips que indicam estado.

### 5.4 Loading skeleton

**Problema:** O loading atual mostra apenas um `CircularProgress` generico. Em dialogs com muito conteudo, isso causa um "salto" visual quando os dados carregam.

**Recomendacao:** Usar `Skeleton` do MUI para mostrar a estrutura do conteudo enquanto carrega, proporcionando uma experiencia mais fluida.

---

## 6. Arquitetura e Organizacao

### 6.1 Paginas placeholder

**Problema:** Cinco rotas estao com `<div>Em construcao</div>`: treinos, planos, calendario, relatorios, configuracoes. O menu lateral exibe links para paginas que nao existem.

**Recomendacao:**
- Criar paginas placeholder mais informativas com titulo, descricao e icone.
- Ou esconder itens do menu que ainda nao estao implementados, exibindo-os conforme forem desenvolvidos.

### 6.2 Estrutura de pastas

**Problema:** A pasta `src/components/features/` mistura componentes de features diferentes. O `TreinoRealizadoDialog.tsx` esta solto em `features/` enquanto o `AtletaDialog` esta em `features/atleta/` e os dialogs de planos estao em `features/planos/`.

**Recomendacao:** Organizar por dominio/feature de forma consistente:

```
src/components/features/
  atleta/
    AtletaDialog.tsx
  planos/
    planosDialog.tsx
    DetalheTreinoDialog.tsx
  treinos/
    TreinoRealizadoDialog.tsx
```

### 6.3 Nomenclatura inconsistente

**Problema:** Alguns arquivos usam PascalCase (`AtletaDialog.tsx`, `DetalheTreinoDialog.tsx`) e outros usam camelCase (`planosDialog.tsx`). Nao ha padrao definido.

**Recomendacao:** Adotar PascalCase para todos os componentes React (padrao da comunidade). Renomear `planosDialog.tsx` para `PlanosDialog.tsx`.

### 6.4 Path aliases nao utilizados

**Problema:** O `tsconfig.json` define path aliases (`@/components/*`, `@/hooks/*`, etc.) mas todos os imports usam caminhos relativos (`../../../hooks/`). Os aliases nunca sao usados.

**Recomendacao:** Decidir entre uma abordagem ou outra:
- Se usar aliases, configurar o Vite (`vite.config.ts`) para resolve-los e migrar os imports gradualmente.
- Se usar caminhos relativos, remover os aliases do `tsconfig.json` para evitar confusao.

---

## 7. Testes

### 7.1 Ausencia de testes

**Problema:** O projeto nao possui nenhum teste unitario ou de integracao. Nao ha configuracao de Jest, Vitest, Testing Library ou qualquer framework de testes.

**Impacto:** Regressoes nao detectadas, refatoracoes arriscadas, baixa confianca para deploy.

**Recomendacao:**
- Configurar **Vitest** (integra nativamente com Vite) + **React Testing Library**.
- Comecar testando os utilitarios (`safeValues.ts`, `formatting.ts`, `PlanoSemanal.ts` utility functions) — sao funcoes puras, faceis de testar.
- Em seguida, testes de componentes para os dialogs principais.
- Meta inicial: cobertura minima de 60% nos utilitarios e hooks.

---

## Prioridade sugerida de implementacao

| Prioridade | Melhoria | Justificativa |
|------------|----------|---------------|
| Alta | Remover console.logs | Seguranca e performance |
| Alta | React Query / TanStack Query | Elimina re-fetches, simplifica hooks |
| Alta | Testes unitarios (Vitest) | Seguranca para refatoracoes |
| Media | BaseDialog reutilizavel | Reduz boilerplate |
| Media | Sistema de notificacoes (Snackbar) | UX |
| Media | Confirmacao de acoes destrutivas | UX e seguranca |
| Media | Tipo generico BackendEnum | DX e type-safety |
| Baixa | Path aliases ou remocao | Consistencia |
| Baixa | Nomenclatura de arquivos | Consistencia |
| Baixa | Loading skeletons | UX |
| Baixa | Acessibilidade (a11y) | Conformidade |
