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
// PerfilWaitlist.java
public static boolean isTreinadorOuProprietario(PerfilWaitlist perfil) {
    return perfil == TREINADOR || perfil == PROPRIETARIO;
}

// Waitlist.java
public boolean isTreinadorOuProprietario() {
    return PerfilWaitlist.isTreinadorOuProprietario(perfil);
}
```

**Revisão pós-code-review:** a primeira versão só tinha o método de instância em `Waitlist`, e
`WaitlistServiceImpl.registrar` (que no caminho de criação só tem o `dto.perfil()`, a entidade
ainda não existe) repetia a comparação inline — duas fontes de verdade para a mesma regra. O
helper estático em `PerfilWaitlist` é a fonte única; o método de instância delega nele.

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

## D4 — Upsert: `registrar` ganha um ramo de UPDATE condicional, com campos sensíveis congelados

Hoje: `existsByEmailNormalized` → se true, retorna `JA_INSCRITO` sem tocar a linha. Passa a:

```java
Optional<Waitlist> existente = waitlistRepository.findByEmailNormalized(emailNormalizado);
if (existente.isPresent()) {
    boolean treinadorOuProprietario = existente.get().isTreinadorOuProprietario();
    Waitlist atualizado = existente.get().toBuilder()
            .nome(dto.nome().trim())
            .telefone(dto.telefone())
            .qtdAtletas(treinadorOuProprietario ? dto.qtdAtletas() : null)
            .watchBrand(treinadorOuProprietario ? dto.watchBrand() : null)
            .landingPath(dto.landingPath())
            .referrer(dto.referrer())
            // perfil/aceiteLgpd/policyVersion/UTM: NÃO sobrescritos — ver "Revisão de segurança" abaixo
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

**Revisão de segurança (achado do QA gate, High):** a primeira versão deste design também
sobrescrevia `perfil`, `aceiteLgpd` e `policyVersion` no upsert. O security review apontou que
`POST /api/v1/waitlist` é público e não verifica posse do e-mail — qualquer requisição que
soubesse/adivinhasse o e-mail de outra pessoa poderia, através do reenvio, forjar o aceite de LGPD
dela (o DTO já exige `aceiteLgpd=true`, então bastava reenviar) ou trocar o perfil dela, o que por
sua vez dispararia e-mails de aviso indesejados (`WaitlistDocsNotificationServiceImpl`) ou alteraria
sua elegibilidade no funil/convite da turma fundadora sem o conhecimento da pessoa. **Corrigido:**
`perfil`, `aceiteLgpd` e `policyVersion` de uma linha existente nunca são tocados pelo upsert — só
são gravados na criação. O condicional de `qtdAtletas`/`watchBrand` passou a usar
`existente.isTreinadorOuProprietario()` (perfil já congelado), não `dto.perfil()` (que um atacante
controla livremente).

## D5 — `watchBrand` obrigatório só para treinador/proprietário, validado no serviço

Mesmo padrão já usado para `qtdAtletas` (comentário em `WaitlistInputDto`: "apenas para
treinador") — não um `@NotNull` condicional via Bean Validation (JSR-380 não suporta "obrigatório
se outro campo for X" nativamente sem validador custom), e sim uma checagem explícita em
`WaitlistServiceImpl.registrar`: se `isTreinadorOuProprietario()` e `watchBrand == null`, não falha
a requisição (a spec original trata como opcional mesmo para treinador — "relógio predominante" é
best-effort) — fica `UNKNOWN` implícito via `segment = OTHER_BRAND` quando ausente, sem lançar erro
de validação. Front decide se quer tornar obrigatório na UI; o backend aceita ausência.

## D6 — `landingPath` restrito a caminho relativo (achado do QA gate, Medium)

`landingPath` é texto livre persistido por um endpoint anônimo, sem consumidor hoje (não aparece
em nenhum DTO de saída/admin) — mas é exatamente o tipo de risco latente que vira stored-XSS no
dia em que um painel futuro renderizar o valor sem escapar. `@Pattern(regexp = "^/[\\w\\-/]*$")`
em `WaitlistInputDto.landingPath` restringe a um caminho relativo same-site (ex.: `/waitlist`),
suficiente para o propósito do campo (saber de qual página da SPA veio a inscrição) sem aceitar
HTML/script/URLs externas. `referrer` não ganhou a mesma restrição — é um campo que precisa
aceitar URLs externas arbitrárias (o referrer HTTP real do navegador); a mitigação ali é
escapar/não confiar no valor quando (se) algum consumidor futuro o renderizar.
