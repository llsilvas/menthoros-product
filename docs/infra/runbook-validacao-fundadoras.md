# Runbook — Validação ponta a ponta: assessoria do zero (develop → produção)

**Criado:** 2026-09-05 · **Executores:** founder (browser/e-mail/decisões) + agente (CLI/SQL/verificações)

## Objetivo

Uma única passada que consolida todas as validações operacionais adiadas, usando **os próprios
fluxos do produto como seed**: limpar a base, criar uma assessoria do zero pelo convite de
fundadora, popular com atletas pelo convite novo por token, e exercitar os roteiros pendentes.
O seed É o teste.

**Fecha (registrar a data em cada `tasks.md` arquivado ao concluir):**

| Origem | Tasks |
|---|---|
| `convite-assessorias-fundadoras` (ativa) | 0.1–0.3, 5.1, 5.2, 5.3 |
| `add-athlete-invite-token-link` (arquivada 09-05) | 4.2 (smoke), 4.3 (auditoria de órfãos) |
| `harden-backend-db-resilience` (arquivada 09-04) | 4.2 (smoke logs/pool) |
| `atleta-cadastra-prova` + `prova-no-plano-semanal` (arquivadas) | 6.1 + 7.1 (roteiro combinado) |

**Decisões (2026-09-05):** ensaio completo em **develop**, depois roteiro enxuto em **produção**
(que sai limpa para o lançamento). Limpeza inclui **Postgres E Keycloak** (usuários e
organizations de teste) — assessoria do zero de verdade.

Legenda: **[F]** = founder executa · **[A]** = agente executa · 🛑 = gate de confirmação explícita
antes de prosseguir (operação destrutiva).

---

## Fase 0 — Pré-condições (uma vez, antes de tudo)

- [ ] 0.1 **[F]** Usuário do founder com role `ADMIN` no Keycloak de **produção** — é quem emite o
      convite de fundadora (`POST /api/admin/waitlist/{id}/convite`). Criar via console admin do
      Keycloak (exceção documentada? NÃO — usuário não é config de realm; o `sync-realm.sh` não
      gerencia usuários) ou via `kcadm`. Registrar o e-mail usado aqui: ______
- [x] 0.2 **[A/F]** Vars `SMTP_HOST/PORT/USER/PASSWORD/STARTTLS/FROM` no serviço
      `menthoros-backend` do ambiente `production` (por referência das `KC_SMTP_*`, porta **2587**
      — ver `docs/infra/keycloak-smtp-resend.md`). Verificar: `railway variables --service
      menthoros-backend --kv | grep SMTP` no env production.
- [ ] 0.3 **[F]** Resend: domínio verificado e segundo cliente SMTP permitido no plano.
- [x] 0.4 **[A]** (develop feito 2026-09-05: `~/backups/menthoros/backup-develop-20260905-1615.dump`) Backups frescos dos dois Postgres antes de qualquer limpeza:
      `pg_dump "$DATABASE_PUBLIC_URL" -Fc -f backup-<env>-$(date +%Y%m%d).dump` (guardar fora do
      workspace). 🛑 **Nenhuma fase de limpeza começa sem o backup do ambiente correspondente.**

---

## Fase A — Ensaio completo em develop

### A1. Limpeza da base develop 🛑

- [x] A1.1 **[A]** Backup (0.4) confirmado para develop.
- [x] A1.2 **[A]** ✅ 2026-09-05 (0 assessorias/usuários/atletas, 90 migrations preservadas) — Postgres: truncar todas as tabelas de aplicação preservando o Flyway:

```sql
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables
           WHERE schemaname = 'public' AND tablename LIKE 'tb\_%' ESCAPE '\'
  LOOP
    EXECUTE format('TRUNCATE TABLE %I CASCADE', t);
  END LOOP;
END $$;
-- conferir: SELECT count(*) FROM tb_assessoria;  -- 0
```

- [x] A1.3 **[F]** ✅ 2026-09-05 (com o incidente do realm master — ver aviso abaixo) — Keycloak develop: remover TODOS os usuários do realm `menthoros` e todas as
      Organizations (console admin → Users / Organizations). O realm em si (clients, roles,
      scopes) fica — é gerido pelo `sync-realm.sh` e não é tocado.
      ⚠️ **NÃO tocar no realm `master`** — apagar o `admin` de lá derruba o acesso ao console
      inteiro (aconteceu no ensaio de 2026-09-05). Restart simples NÃO recria o admin.
      Recuperação (uma linha; o deslocamento da porta de management evita "Address already in
      use" com o servidor vivo, e as flags `:env` evitam prompt interativo):

```bash
# Método validado (2026-09-05): container LOCAL apontando para o banco do Keycloak do ambiente —
# sem conflito de porta com o servidor vivo (o bootstrap-admin via ssh no container falha com
# "Address already in use"). Credenciais: KC_BOOTSTRAP_ADMIN_PASSWORD do serviço + senha do Postgres.
docker run --rm \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD="<do serviço>" \
  -e KC_DB=postgres -e KC_DB_URL="jdbc:postgresql://<host-publico-postgres>:<porta>/keycloak-db" \
  -e KC_DB_USERNAME=postgres -e KC_DB_PASSWORD="<senha-postgres>" \
  quay.io/keycloak/keycloak:26.6 bootstrap-admin user \
  --username:env KC_BOOTSTRAP_ADMIN_USERNAME --password:env KC_BOOTSTRAP_ADMIN_PASSWORD
```
- [x] A1.4 **[A]** ✅ — Restart do backend develop (`railway redeploy`) — caches de tenant/atleta zerados.
- [x] A1.5 **[F]** ✅ (usuário `menthoros`, role ADMIN; lição: criar JÁ com credencial) — Recriar o usuário ADMIN do founder no Keycloak develop (equivalente ao 0.1).

### A2. Assessoria do zero — fluxo de fundadora (fecha 5.1/5.2)

- [x] A2.1 **[F]** ✅ (`carmaniacs1@hotmail.com`) — Inscrever um "coach de teste" na waitlist pela landing de develop
      (`app-develop.menthoros.com`), perfil TREINADOR, e-mail real que você acessa.
- [x] A2.2 **[A]** ✅ (202; `sent_at` preenchido — e-mail real pelo Resend) — Logado como ADMIN, emitir o convite (UI da waitlist ou
      `POST /api/admin/waitlist/{id}/convite` com o JWT do DevTools).
- [x] A2.3 **[F]** ✅ (assessoria **Teste-RUN**, plano GRATUITO; exigiu o fix #98) — E-mail chega pelo Resend → abrir o link → aceitar: nome da assessoria + senha →
      "Assessoria criada".
- [x] A2.4 **[F]** ✅ dispensado nesta passada (convite convertido; comportamento coberto por teste; o reenvio do convite de ATLETA invalidou os anteriores na prática) — Reenvio invalida o anterior: emitir de novo, conferir que o link antigo → tela
      de convite inválido (404). *(Expiração: opcional — exige ajustar `FOUNDING_INVITE_VALIDITY_DAYS`.)*
- [x] A2.5 **[F]** ✅ — Login do coach novo → consentimento LGPD → wizard de boas-vindas → dashboard.
      **Primeiro JWT já com tenant e roles — sem operação manual em lugar nenhum.**

### A3. Popular atletas — convite por token (fecha invite 4.2)

- [x] A3.1 **[F]** ✅ (Leandro Silva, Erivaldo, Hugo) — Como coach, cadastrar 3 atletas (nome + e-mail; pelo menos 2 com e-mails reais
      distintos que você acesse).
- [x] A3.2 **[F]** ✅ (Erivaldo aceito com e-mail DIVERGENTE — o cenário do incidente — vinculado; painel `/me/*` 200; exigiu fixes #99 e SMTP do realm) — Convidar o atleta 1 → e-mail chega → aceitar **trocando o e-mail** (o cenário do
      incidente de 2026-09-04) → conta criada com aviso de verificação → login → **painel carrega**
      (`/me/home` 200) → onboarding/calibração oferecido → completar calibração.
- [x] A3.3 **[F]** ✅ (Leandro Silva, e-mail igual, verificado, login direto) — Convidar o atleta 2 → aceitar com o e-mail do convite → login direto (sem
      verificação pendente) → painel ok.
- [x] A3.4 **[F]** ✅ (link reaberto pós-aceite → 410 com orientação de login) — Duplo clique no aceite ou reuso do link → mensagem "convite não é mais válido /
      faça login" (410), sem segunda conta.
- [x] A3.5 **[A]** ✅ (único órfão = Hugo, deliberado; e-mail do Erivaldo autocorrigido pelo sync no login) — Auditoria: `SELECT id, nome, email FROM tb_atleta WHERE usuario_id IS NULL;`
      → deve retornar **apenas o atleta 3** (nunca convidado). Zero órfão inesperado.

### A4. Roteiro combinado de provas (fecha 6.1 + 7.1)

- [ ] A4.1 **[F]** Como atleta 1: cadastrar uma **maratona em 8 semanas** → como coach: item
      `CRITICA` no Inbox com "8 de 16 semanas" → perfil mostra a prova → "Ciente" → item some.
- [ ] A4.2 **[F]** Atleta muda a data da prova → item volta ao Inbox.
- [ ] A4.3 **[F]** Coach gera a semana que contém a prova → treino `PROVA` garantido no dia.
- [ ] A4.4 **[F]** Aprovar a semana; atleta cadastra prova NA semana corrente já aprovada → plano
      reabre (`AGUARDANDO_REVISAO`), atleta vê o `PROVA`, coach vê o chip "Reaberto: prova
      inserida" e reaprova.
- [ ] A4.5 **[F]** Atleta registra o treino `PROVA` → a prova fecha com `tempoRealizado`.

### A5. Smoke técnico (fecha harden 4.2)

- [x] A5.1 **[A]** ✅ parcial (zero DEBUG, sem flood durante A2/A3; reconferir durante A4) — Durante o A3/A4: `railway logs --service menthoros-backend` — **zero linha
      DEBUG**, sem flood, INFO de "Usuário sincronizado" só em escrita real.
- [ ] A5.2 **[A]** `hikaricp.connections.active` no Prometheus (ou `pg_stat_activity`) respirando
      com folga durante a navegação do painel.
- [ ] A5.3 **[A]** Geração de plano dos atletas calibrados sem `VALIDAÇÃO FALHOU` recorrente
      (contraprova do plano degenerado de 2026-09-04: atleta calibrado → plano ok).

### A6. Registro

- [ ] A6.1 **[A]** Marcar as tasks fechadas nos `tasks.md` (ativos e arquivados) com a data, e
      anotar aqui qualquer defeito achado: ______

---

## Procedimento de suporte — atleta digitou e-mail errado no aceite

Visto no ensaio (2026-09-05): o atleta trocou o e-mail no aceite para um endereço inexistente e
ficou preso na verificação (o link nunca chega). Conserto no console admin do Keycloak, realm
`menthoros` → Users → usuário → Details: corrigir o **Email**, ligar **Email verified**, remover a
required action de verificação se houver. O `tb_usuario` local se autocorrige no próximo login
(sync por diff do JWT). O vínculo com o Atleta não é afetado — ele é pelo token, não pelo e-mail.

## Fase B — Produção (roteiro enxuto; sai limpa para o lançamento)

Pré-requisito: Fase A concluída **sem defeito aberto**. 🛑 Cada passo destrutivo reconfirma.

- [x] B1 **[A]** ✅ 2026-09-07 (railway 383K + keycloak-db 247K em ~/backups/menthoros) — Backup de produção (0.4) confirmado.
- [x] B2 **[A/F]** ✅ 2026-09-07 — ⚠️ **LIÇÃO: a `tb_waitlist` de produção carrega LEADS REAIS e
      foi truncada junto** (o TRUNCATE varre todas as `tb_*`); restaurada do backup do dia com
      `pg_restore --data-only --table=tb_waitlist` minutos depois, sem perda (2 inscritos;
      `tb_founding_invite` estava vazia — nenhum token real morreu). Em qualquer repetição:
      **restaurar a waitlist do backup imediatamente após o TRUNCATE**, ou excluí-la do loop.
      Limpeza: mesmo A1.2 (SQL) + A1.3 (Keycloak produção — remove a assessoria-demo,
      seus usuários e a Organization) + A1.4 (redeploy) + 0.1 (ADMIN do founder recriado). 🛑
      **Confirmar nominalmente antes do TRUNCATE em produção.**
- [x] B3 **[A]** ✅ 2026-09-07 (default já era false; var explícita setada, deploy ok) — `COACH_SIGNUP_ENABLED=false` no serviço backend de produção (fecha 5.3) →
      `/cadastro` sem token mostra "O cadastro é por convite".
- [ ] B4 **[F]** Roteiro enxuto: waitlist → convite de fundadora → aceite → login → 1 atleta
      cadastrado e convidado pelo canal novo → aceite → painel do atleta carrega.
- [ ] B5 **[A]** Auditoria de órfãos em produção (fecha invite 4.3): `usuario_id IS NULL` → só
      atletas deliberadamente sem convite. Logs limpos (harden validada em produção).
- [ ] B6 **[A]** Registro final nos `tasks.md` + `SPRINTS.md` (as validações saem do Radar).

---

## Fora do escopo desta passada (continuam no Radar)

- bpm no relógio com conta real do intervals.icu (5.3/3c.5 de `fix-fc-alvo-base-inconsistente`) —
  exige conta real conectada; agrupar quando houver.
- `resetPasswordAllowed` (recomendado ligar ANTES do lançamento — coach sem recuperação de senha).
- Gate A1 de custo LLM (`weekly-review-llm-focus`) — precisa de tráfego real com a flag ligada.

---

## Registro de achados do ensaio (Fase A, 2026-09-05)

Cinco defeitos reais de lançamento, nenhum visível para as suítes (padrão comum: caminho testado
com mock, nunca executado inteiro contra Postgres/contexto/ambiente reais):

1. **Chave de idempotência do convite de fundadora nunca coube na coluna** (`<hash>:<n>` = 66+
   chars em varchar(64)) — o aceite de fundadora NUNCA funcionou; 409 com mensagem enganosa.
   Backend PR **#98** (V92 + IT de regressão).
2. **LazyInitializationException na emissão do convite de atleta** (assessoria por proxy LAZY em
   serviço sem transação) — 500 no primeiro convite real. Backend PR **#99** (+ IT da emissão).
3. **Login pós-aceite voltava para /cadastro com convite consumido** — "convite inválido" para quem
   acabou de criar a conta. Front PR **#106**.
4. **Realm develop sem SMTP** — verificação de e-mail nunca saía (`Invalid sender address 'null'`);
   aceite com e-mail trocado ficava preso. Corrigido pelo `sync-realm.sh` (canônico).
5. **Preflight do `sync-realm.sh` quebrava com senha com caracteres especiais** (curl sem
   URL-encode). Infra PR **#15**.

Operacionais: admin do realm master apagado na limpeza (recuperação documentada no A1.3);
credencial `KC_ADMIN_PASSWORD` do backend divergente do admin real (alinhada por referência à
`KC_BOOTSTRAP_ADMIN_PASSWORD`); atleta com e-mail digitado errado no aceite (procedimento de
suporte documentado acima).
