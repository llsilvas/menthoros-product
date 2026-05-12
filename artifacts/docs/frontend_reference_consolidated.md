# Frontend - Referência de Implementação e Melhorias

**Documento Consolidado de Etapas e Melhorias Frontend**
**Data:** 12 de março de 2026 (Consolidado: 08 de maio de 2026)
**Status:** ✅ ENTREGUE - Consolida etapas realizadas + sugestões de melhorias

---

## 📑 Índice

1. **Etapas Realizadas** - O que já foi implementado
2. **Sugestões de Melhorias** - Próximas ações recomendadas
3. **Checklist de Implementação** - Tasks pendentes

---

## 📋 SEÇÃO 1: Etapas Realizadas dos Treinos

### Resumo das Alterações no Backend

O backend agora suporta **etapas detalhadas** dentro de cada treino realizado. Um treino realizado pode conter N etapas (aquecimento, tiros, recuperacao, etc.), permitindo análise granular da execução.

### O que Mudou:
- `TreinoRealizadoInputDto` agora aceita um campo **opcional** `etapasRealizadas: EtapaRealizadaInputDto[]`
- `TreinoRealizadoOutputDto` agora retorna `etapasRealizadas: EtapaRealizadaOutputDto[]`
- Nova entidade `EtapaRealizada` com tabela `tb_etapa_realizada`
- Campos `null` são omitidos na resposta (`@JsonInclude(NON_NULL)`)

### Endpoints Impactados

**POST `/{treinoPlanejadoId}/marcar-realizado`**
Marca um treino planejado como realizado. Agora aceita etapas opcionalmente.

**POST `/{atletaId}/lancar-treino`**
Lança um treino manual (sem treino planejado). Agora aceita etapas opcionalmente.

> **Ambos os endpoints retornam `201 Created`** com o `TreinoRealizadoOutputDto` completo (incluindo etapas).

---

## 💡 SEÇÃO 2: Sugestões de Melhorias Frontend

### 1. Tipagem TypeScript

#### 1.1 Interfaces Desatualizadas

**Problema:** As interfaces `TreinoPlanejado` e `EtapaTreino` estavam incompletas — campos como `tssPlanejado`, `intensidadePlanejada`, `justificativaIa`, `fonteDados`, `ordem`, `descricaoEtapa`, `fcAlvoEtapa` e `repeticoes` não existiam. Isso força o uso de `any` e impede o autocomplete da IDE.

**Impacto:** Bugs silenciosos ao acessar campos inexistentes, perda de type-safety, produtividade reduzida.

**Recomendação:**
- Manter as interfaces sincronizadas com o contrato da API (Swagger/OpenAPI)
- Considerar gerar tipos automaticamente a partir do schema do backend (o projeto já usa `npm run generate:api` para os services — estender isso para gerar tipos também)
- Evitar `any` — o campo `diaSemana` estava tipado como `string | any`, o que anula a verificação do TypeScript

#### 1.2 Interfaces Sugeridas

```typescript
// types/TreinoPlanejado.ts
interface EtapaTreino {
  id: number;
  ordem: number;
  descricaoEtapa: string;
  duracao: number;  // em minutos
  intensidadePlanejada: 'LEVE' | 'MODERADA' | 'FORTE' | 'MÁXIMA';
  fcAlvoEtapa: { min: number; max: number };
  repeticoes?: number;
  tssPlanejado: number;
  justificativaIa: string;
  fonteDados: 'IA' | 'MANUAL' | 'GARMIN';
}

interface TreinoPlanejado {
  id: number;
  atletaId: number;
  diaSemana: 'SEGUNDA' | 'TERÇA' | 'QUARTA' | 'QUINTA' | 'SEXTA' | 'SÁBADO' | 'DOMINGO';
  semanaPlanejamento: number;
  objetivoTreino: string;
  duracao: number;
  intensidadePlanejada: 'LEVE' | 'MODERADA' | 'FORTE' | 'MÁXIMA';
  fcAlvoTreino: { min: number; max: number };
  tssPlanejado: number;
  etapas: EtapaTreino[];
  status: 'PLANEJADO' | 'REALIZADO' | 'CANCELADO';
}
```

### 2. Gerenciamento de Estado (Context API)

#### 2.1 TreinoContext Faltando

**Problema:** O projeto não tem um contexto centralizado para dados de treino. Isso força prop drilling e torna difícil compartilhar estado entre componentes.

**Impacto:** Código difícil de manter, mudanças em um componente cascateiam para vários outros.

**Recomendação:**
```typescript
// contexts/TreinoContext.tsx
interface TreinoContextType {
  treinosPlanejados: TreinoPlanejado[];
  treinosRealizados: TreinoRealizado[];
  selectedTreino: TreinoPlanejado | null;
  isLoading: boolean;
  error: string | null;
  
  fetchTreinosPlanejados: (atletaId: number) => Promise<void>;
  fetchTreinosRealizados: (atletaId: number) => Promise<void>;
  selectTreino: (treino: TreinoPlanejado) => void;
  marcarTreinoRealizado: (data: TreinoRealizadoInputDto) => Promise<void>;
}

export const TreinoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Implementação...
};
```

### 3. Componentes de Etapas

#### 3.1 Falta Componente de Visualização de Etapas

**Problema:** Não há componente para exibir as etapas de um treino de forma clara.

**Recomendação:**
```typescript
// components/TreinoEtapas.tsx
interface TreinoEtapasProps {
  etapas: EtapaTreino[];
  isRealizado?: boolean;
  etapasRealizadas?: EtapaRealizada[];
}

export const TreinoEtapas: React.FC<TreinoEtapasProps> = ({ 
  etapas, 
  isRealizado, 
  etapasRealizadas 
}) => {
  return (
    <div className="etapas-container">
      {etapas.map((etapa, idx) => (
        <div key={etapa.id} className="etapa-card">
          <h4>Etapa {etapa.ordem}: {etapa.descricaoEtapa}</h4>
          <p>Duração: {etapa.duracao}min | Intensidade: {etapa.intensidadePlanejada}</p>
          <p>FC Alvo: {etapa.fcAlvoEtapa.min}-{etapa.fcAlvoEtapa.max} bpm</p>
          
          {isRealizado && etapasRealizadas?.[idx] && (
            <div className="etapa-realizada">
              <p>FC Realizada: {etapasRealizadas[idx].fcMedia} bpm</p>
              <p>Duração Realizada: {etapasRealizadas[idx].duracaoRealizada}min</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
```

### 4. Formulário de Entrada de Treino Realizado

#### 4.1 Falta Validação de Entrada

**Problema:** O formulário não valida campos obrigatórios nem formatos.

**Recomendação:**
```typescript
// hooks/useValidateTreinoRealizado.ts
export const useValidateTreinoRealizado = () => {
  const validate = (data: TreinoRealizadoInputDto) => {
    const errors: Record<string, string> = {};
    
    if (!data.dataRealizado) errors.dataRealizado = 'Data é obrigatória';
    if (data.duracaoRealizada <= 0) errors.duracaoRealizada = 'Duração deve ser positiva';
    if (data.fcMedia && (data.fcMedia < 40 || data.fcMedia > 220)) {
      errors.fcMedia = 'FC deve estar entre 40 e 220';
    }
    
    return Object.keys(errors).length === 0 ? null : errors;
  };
  
  return { validate };
};
```

### 5. Melhorias de UX

#### 5.1 Falta Feedback Visual

**Problema:** Ao submeter um treino, o usuário não vê loading state ou confirmação.

**Recomendação:**
- Adicionar skeleton loaders enquanto carrega dados
- Toast notificações ao criar treino com sucesso
- Animações ao transicionar entre estados

---

## ✅ SEÇÃO 3: Checklist de Implementação

### Tipagem TypeScript
- [ ] Sincronizar interfaces com Swagger/OpenAPI
- [ ] Remover todos os `any` types
- [ ] Adicionar testes de tipo (TypeScript strict mode)
- [ ] Gerar tipos automaticamente do backend (swagger-to-ts)

### Gerenciamento de Estado
- [ ] Criar TreinoContext
- [ ] Implementar TreinoProvider
- [ ] Remover prop drilling desnecessário
- [ ] Adicionar testes de context

### Componentes
- [ ] Criar TreinoEtapas component
- [ ] Criar EtapaCard component
- [ ] Criar TreinoRealizadoForm com validação
- [ ] Adicionar testes de componentes

### Validação
- [ ] Implementar validação em hooks customizados
- [ ] Validar em tempo real enquanto digita
- [ ] Mostrar erros inline nos campos
- [ ] Desabilitar submit enquanto há erros

### UX/UI
- [ ] Adicionar skeleton loaders
- [ ] Implementar toast notifications
- [ ] Adicionar animações de transição
- [ ] Melhorar responsive design para mobile

### Testes
- [ ] Unit tests para validators
- [ ] Component tests com React Testing Library
- [ ] Integration tests com MSW (Mock Service Worker)
- [ ] E2E tests com Cypress/Playwright

---

## 📊 Comparação: Antes vs Depois

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Tipagem** | `any` types | Tipos completos |
| **Estado** | Prop drilling | Context API |
| **Etapas UI** | Não existe | TreinoEtapas component |
| **Validação** | Manual | Hooks customizados |
| **Feedback** | Nenhum | Toast + Loading |
| **Testes** | Não existem | Coverage > 80% |

---

## 🎯 Prioridade de Implementação

### 🔴 CRÍTICO (Semana 1)
1. Sincronizar interfaces TypeScript
2. Criar TreinoContext
3. Componente TreinoEtapas básico

### 🟡 IMPORTANTE (Semana 2)
1. Formulário com validação
2. Toast notifications
3. Skeleton loaders

### 🟢 NICE-TO-HAVE (Semana 3+)
1. Testes unitários
2. Animações
3. Melhorias de mobile

---

## 📚 Documentação de Referência

- `types/TreinoPlanejado.ts` - Interface principal
- `contexts/TreinoContext.tsx` - State management
- `components/TreinoEtapas.tsx` - Visualização de etapas
- `hooks/useValidateTreinoRealizado.ts` - Validação

---

## 🎉 Status Final

**DOCUMENTO CONSOLIDADO ENTREGUE**

✅ Etapas Realizadas Documentadas
✅ Sugestões de Melhorias Detalhadas
✅ Código de Exemplo Pronto
✅ Checklist de Implementação

**Próximos Passos:**
1. Code review das sugestões com o time
2. Priorizar melhorias
3. Iniciar implementação na próxima sprint

---

**Consolidado em:** 08 de maio de 2026
**Arquivos mergeados:** frontend_etapas_realizadas_reference.md + melhorias-frontend.md
**Status:** ✅ ENTREGUE
