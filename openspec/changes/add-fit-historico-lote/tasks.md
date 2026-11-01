# Tasks — add-fit-historico-lote

Backend valida com `./mvnw clean verify`. O front está na change `add-fit-historico-lote-front`.

## 0. Gates

- [ ] 0.1 Cláusula de LGPD no contrato assessoria–atleta cobrindo o upload de histórico pelo
  treinador (base legal decidida em 2026-11-01). **Gate de release**, não de implementação: o
  endpoint pode ser construído antes, mas não usado com atleta real sem a cláusula em vigor.
- [ ] 0.2 Pilot (1–2 assessorias): registrar se o atleta entrega os `.fit` e se o passo de extrair o
  `.zip` atrapalha. O resultado decide o gatilho do front (ver `proposal.md`).

## 1. Backend — endpoint do treinador

- [ ] 1.1 `POST /api/v1/coach/atletas/{atletaId}/treinos/importar-fit` (D3): `@PreAuthorize`
  TECNICO/ADMIN, `@RequireTenant(resourceParamIndex = 0)` com `atletaId` como **primeiro parâmetro**,
  `@Operation`/`@ApiResponses` (201/200/403/422), chama `FitUploadService.importar`; reaproveita
  `TreinoRealizadoOutputDto`.
  `@WebMvcTest` isolado dos códigos e dos papéis: 422 (CA3), 403 para `ATLETA` (CA5), 401 sem
  token e `ADMIN` permitido; rodado sozinho (ver memória sobre verify local x CI).
  verify: `./mvnw test -Dtest=<ControllerTest>` verde.
- [ ] 1.2 Log de auditoria (atletaId, tenantId, novo/existente), sem nome de arquivo nem conteúdo.
  Teste separado: o serviço é chamado com o `atletaId` do path (não do JWT).
  verify: teste do controller verde.
- [ ] 1.3 IT (Testcontainers, HTTP com o aspecto `@RequireTenant` ativo) com `.fit` de fixture:
  importa 1 arquivo (CA1), reenvia (CA2), atleta de outro tenant devolve 403 e nada é gravado (CA4);
  CA7 com fixture de mais de 30 dias e sem RPE: nenhuma interação com o roteador de modelo e nenhuma
  `AnaliseWorkout` criada; mede o tempo de 50 arquivos em sequência **e do reenvio dos mesmos 50**;
  registra o resultado em "Notas". Teste de corrida (dois envios simultâneos do mesmo
  arquivo): asserta uma linha só e reenvio devolvendo 200; registra em "Notas" o status real do
  perdedor (não prometido).
  verify: `./mvnw verify -Dit.test=<IT>` verde.
- [ ] 1.4 Teste de dedup (CA8, premissa): treino importado por `.fit` e `registrar` com o mesmo
  `externalId` e `fonte_dados = GARMIN` não duplica. Ao implementar `garmin-activity-ingestion`,
  conferir que o `externalId` dela bate com este formato (registrar lá, não aqui).
  verify: teste verde.
- Validação: `./mvnw clean verify`.

## 2. Fechamento

- [ ] 2.1 Teste manual com os `.fit` de um atleta Garmin real (pós-cláusula, task 0.1); registrar o
  tempo ponta a ponta (pedido ao atleta → histórico no motor) para a métrica de sucesso.

## Notas

### Uso pelo pilot (sem front)

Um arquivo por requisição, em sequência (cada treino novo recalcula a carga do atleta):

```bash
for f in ./fits/*.fit; do
  curl -s -o /dev/null -w "%{http_code} $f\n" -X POST \
    -H "Authorization: Bearer $TOKEN" -F "arquivo=@$f" \
    "$API/api/v1/coach/atletas/$ATLETA_ID/treinos/importar-fit"
done
```

`201` = importado, `200` = já existia, `422` = arquivo inválido. Reexecutar o loop é seguro.

### Limpeza de importação errada (risco aceito, só ops)

O treino do `.fit` grava `fonte_dados = GARMIN` e `criado_por` igual ao da ingestão direta, então
**não dá para separar por fonte**. Delimitar por `atleta_id` e intervalo de `data_treino`, e conferir
antes com `SELECT`:

```sql
SELECT id, data_treino, external_id FROM tb_treino_realizado
WHERE tenant_id = :tenant AND atleta_id = :atleta
  AND external_id IS NOT NULL AND data_treino BETWEEN :de AND :ate;
```

Antes de apagar: a FK de reconciliação (`V18`) não declara `ON DELETE`, então treino reconciliado
bloqueia o `DELETE`. Depois de apagar, a carga diária do atleta precisa ser recalculada (apagar o
treino não a recalcula). Rodar com um segundo par de olhos; não é procedimento de rotina.

### Medições

- (preencher com o tempo medido na 1.3)
