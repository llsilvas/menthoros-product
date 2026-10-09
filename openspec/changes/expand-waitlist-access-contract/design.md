# Design — expand-waitlist-access-contract

## D1 — Migration V101

```sql
ALTER TABLE tb_waitlist
    ADD COLUMN IF NOT EXISTS watch_brand VARCHAR(20),
    ADD COLUMN IF NOT EXISTS landing_path VARCHAR(255),
    ADD COLUMN IF NOT EXISTS referrer VARCHAR(255),
    ADD COLUMN IF NOT EXISTS policy_version VARCHAR(20);
```

Nullable, sem FK/índice, sem backfill — linhas existentes ficam com os quatro campos `NULL`
(inscrições antes desta change não têm como saber a versão da política que aceitaram
retroativamente; `watchBrand` idem). Rollback: `DROP COLUMN` nas quatro, seguro.

## D2 — `isTreinadorOuProprietario()` na entidade, não repetido 5x

```java
// Waitlist.java
public boolean isTreinadorOuProprietario() {
    return perfil == PerfilWaitlist.TREINADOR || perfil == PerfilWaitlist.PROPRIETARIO;
}
```

Os 5 call sites (`WaitlistServiceImpl`, `WaitlistNotificationListener`,
`WaitlistFunnelServiceImpl`, `FoundingInviteServiceImpl`, `WaitlistDocsNotificationServiceImpl`)
trocam `perfil == PerfilWaitlist.TREINADOR` / `getPerfil() == PerfilWaitlist.TREINADOR` por
`isTreinadorOuProprietario()`. Centralizar na entidade significa que um quarto papel futuro (se
nunca existir) muda num lugar só, não em cinco.

`WaitlistFunnelServiceImpl` e `WaitlistDocsNotificationServiceImpl` hoje acessam a entidade direto
(stream/repository), então o método fica disponível sem mudança de assinatura. Único repositório
que precisa de ajuste: `WaitlistRepository.findAllByPerfilAndDocsNotifiedAtIsNull(PerfilWaitlist)`
vira `findAllByPerfilInAndDocsNotifiedAtIsNull(List<PerfilWaitlist>)`, chamado com
`List.of(TREINADOR, PROPRIETARIO)` — não dá para expressar "treinador ou proprietário" num
derived query de um parâmetro só.

## D3 — `segment` é derivado na borda (controller/mapper), não persistido

Mesma filosofia de `UsuarioLgpdConsent` (comentário da entidade: "não existe flag equivalente...
é derivado"). Função pura, sem estado:

```java
// WaitlistSegment.java (enum) + função pura, local ao controller ou um pequeno helper estático
static WaitlistSegment derivar(PerfilWaitlist perfil, WatchBrand watchBrand) {
    if (perfil == PerfilWaitlist.ATLETA) return WaitlistSegment.ATLETA;
    return watchBrand == WatchBrand.GARMIN ? WaitlistSegment.QUALIFIED : WaitlistSegment.OTHER_BRAND;
}
```

Calculado a partir do `WaitlistInputDto` já em mãos no controller — não precisa reler do banco.
`WaitlistOutputDto` ganha `segment` (`@JsonInclude(NON_NULL)` já presente na classe).

## D4 — Upsert: `registrar` ganha um ramo de UPDATE condicional

Hoje: `existsByEmailNormalized` → se true, retorna `JA_INSCRITO` sem tocar a linha. Passa a:

```java
Optional<Waitlist> existente = waitlistRepository.findByEmailNormalized(emailNormalizado);
if (existente.isPresent()) {
    Waitlist atualizado = existente.get().toBuilder()
            .nome(dto.nome().trim())
            .telefone(dto.telefone())
            .perfil(dto.perfil())
            .qtdAtletas(dto.perfil() == PerfilWaitlist.TREINADOR || dto.perfil() == PerfilWaitlist.PROPRIETARIO ? dto.qtdAtletas() : null)
            .watchBrand(...)
            .aceiteLgpd(...)
            .policyVersion(lgpdProperties.getPolicyVersion())
            // utmSource/utmMedium/utmCampaign/utmContent: NÃO sobrescritos — ver proposal "first-touch"
            .build();
    waitlistRepository.save(atualizado);
    return Resultado.JA_INSCRITO; // contrato de status não muda; só o dado por trás muda
}
```

`existsByEmailNormalized` vira `findByEmailNormalized` (repositório já tem o índice único; troca
de `boolean` para `Optional<Waitlist>` é mudança de assinatura, não de índice). A corrida entre o
`findBy` e o `save` (dois clientes mandando o mesmo e-mail ao mesmo tempo) continua coberta pelo
`catch (DataIntegrityViolationException)` já existente — só que agora, em vez de simplesmente
engolir a exceção como `JA_INSCRITO`, o caminho de corrida *não* teria aplicado o update; aceitável
(é uma janela de milissegundos, próxima tentativa do mesmo reenvio aplica o update).

## D5 — `watchBrand` obrigatório só para treinador/proprietário, validado no serviço

Mesmo padrão já usado para `qtdAtletas` (comentário em `WaitlistInputDto`: "apenas para
treinador") — não um `@NotNull` condicional via Bean Validation (JSR-380 não suporta "obrigatório
se outro campo for X" nativamente sem validador custom), e sim uma checagem explícita em
`WaitlistServiceImpl.registrar`: se `isTreinadorOuProprietario()` e `watchBrand == null`, não falha
a requisição (a spec original trata como opcional mesmo para treinador — "relógio predominante" é
best-effort) — fica `UNKNOWN` implícito via `segment = OTHER_BRAND` quando ausente, sem lançar erro
de validação. Front decide se quer tornar obrigatório na UI; o backend aceita ausência.
