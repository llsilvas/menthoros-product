# Tasks — assessoria-settings-ui

## Backend (3 tasks)

- [ ] 1.1 **DTO `AssessoriaUpdateDto`:** record com `nome`, `logoUrl`, `corPrimaria`, `corSecundaria` (todos opcionais — PATCH semântico).
- [ ] 1.2 **Endpoint `PUT /api/v1/assessoria/me`:** coach logado → resolve tenant → atualiza `Assessoria` (apenas campos não-nulos). Retorna `AssessoriaOutputDto` atualizado.
- [ ] 1.3 **Testes:** `AssessoriaControllerTest` — atualiza nome, atualiza cores, tenant-scoped (coach A não edita assessoria B).

## Frontend (4 tasks)

- [ ] 2.1 **Página `CoachAssessoriaSettingsPage`** (`/coach/settings/assessoria`): seções de formulário.
- [ ] 2.2 **Seção "Identidade visual":** input nome, upload logo (preview), color pickers (cor primária/secundária), preview ao vivo do header da assessoria com as cores.
- [ ] 2.3 **Seção "Plano e uso":** cards informativos — plano atual (BASIC/PRO/ENTERPRISE), atletas (X de Y), técnicos (X de Y). Read-only.
- [ ] 2.4 **Testes:** renderiza campos, upload logo, color picker, salva e vê preview.

## Verificação (2 tasks)

- [ ] 3.1 Logo e cores atualizadas refletem no header da plataforma (tenant-scoped).
- [ ] 3.2 Camada `AssessoriaService` já existe — verificar que `PUT /api/v1/assessoria/me` usa o serviço existente, não duplica lógica.

## Sizing: S (~7 tasks)
