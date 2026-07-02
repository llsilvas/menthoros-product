# Java — Convenções do Backend Menthoros

> Resumo: versão de Java e convenções de linguagem que todo código novo no backend
> deve seguir. Relevante para qualquer PRD que gere trabalho de implementação
> backend — define o que é tecnicamente idiomático vs. o que quebra convenção.

## O que é

- **Java 21** (LTS), confirmado em `pom.xml` (`<java.version>21</java.version>`).
  Não confundir com menções antigas a "Java 24" que podem aparecer em documentação
  desatualizada — o `pom.xml` é a fonte de verdade.
- Build via **Maven Wrapper** (`./mvnw`), não Maven global.
- Lombok (`1.18.38`) para boilerplate de injeção de dependência, mas **não** para DTOs.

## Por que importa para o Menthoros

- **DTOs são sempre `record`, nunca `class` com Lombok.** `@Data`,
  `@NoArgsConstructor`, `@AllArgsConstructor` são proibidos em DTOs — records dão
  imutabilidade e `equals`/`hashCode`/`toString` de graça. Qualquer PRD que descreva
  um novo contrato de API deve assumir que o DTO resultante será um record imutável,
  não um objeto mutável com setters.
- **Tipos genéricos sempre declarados por completo** (`List<ProvaOutputDto>`, nunca
  `List` cru) — afeta como specs devem descrever contratos de coleção.
- **Nullability via `org.jspecify.annotations.@Nullable`** — não `javax.annotation`
  nem `jakarta.annotation`. Mistura de fontes de anotação quebra análise estática.
- **Java 21 habilita `record`, pattern matching e virtual threads** — decisões de
  arquitetura que assumam essas features (ex. um pipeline de skills baseado em
  records) são compatíveis com a versão atual; não é necessário planejar upgrade
  de linguagem para isso.

## Detalhes / modelo

### DTOs (obrigatório)
```java
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(description = "Athlete data for API response")
public record AtletaOutputDto(
    @Schema(description = "Unique athlete ID")
    UUID id,

    @NotBlank(message = "Name is required")
    @Size(max = 100)
    String nome
) {}
```

- Input DTOs (`dto/input/`): anotações de Bean Validation (`@NotNull`, `@NotBlank`, etc).
- Output DTOs (`dto/output/`): `@JsonInclude(NON_NULL)` para omitir campos nulos.

### Nullability
```java
import org.jspecify.annotations.Nullable;

public @Nullable Atleta findByIdOrNull(UUID id) { ... }
```

### Skills de domínio são records puros
Tipos de input/output de uma `DomainSkill` (`*Input`, `*Output`) também são
records — mesma regra dos DTOs — e contêm apenas os campos que a skill de fato lê,
nunca o grafo de entidade inteiro "por garantia".

## Fontes

- `apps/menthoros-backend/pom.xml` (`<java.version>21</java.version>`,
  `<lombok.version>`, `<mapstruct.version>`).
- `apps/menthoros-backend/CLAUDE.md` (seções "DTO & Records Standards",
  "Mapper Standards", "Skills Architecture Standards").

## Status: fato estabelecido
