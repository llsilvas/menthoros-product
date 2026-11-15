**Tamanho:** M · **Trilha:** Full

> **Ticket 2** do épico `add-season-plan-macrocycle` — o **tracer bullet**: o caminho mais curto e
> completo (banco, motor, API, aba) de "o treinador gera uma temporada e a vê". Proposal, design e
> decisões vivem no épico.

## Status

- ready-for-agent (2026-11-15): bloqueado por `add-season-plan-model-integrity` (ticket 1).

## Why

Até aqui o treinador não vê nada da temporada. Este ticket entrega a primeira volta inteira, com o motor
na versão mais simples, para que cada ticket seguinte só acrescente comportamento a um caminho que já
funciona e já é testado de ponta a ponta.

## What Changes

Tasks do épico: **1.3b, 1.5, 1.6 (repositório do template), 1.9, 2.1, 2.2, 2.3 (rampa, sem descargas),
2.6 (sem o caso de calibração), 4.1, 4.2, 4.12, 4.12a, 4.12b (403 do `ATLETA`), 4.13, 4.14, 7.1, 7.3,
7.4, 7.7 (estados sem prova, prova sem temporada, proposta, carregando, erro), 7.12, 7.13, 7.15**, e a
parte da seção 9 que cabe à aba.

- Template de metodologia: só o default global (Q7)
- Motor mínimo: distribui as fases (Base, Construção, Pico, Polimento, Semana da prova) pelas semanas
  mínimas 8/10/12/16 (Q4) e calcula volume e `tssAlvo` com rampa limitada. Taper, longão, descargas e
  marcos ficam para o ticket 3
- `POST` de geração (manual, D3) e `GET` da temporada do atleta, só para `TECNICO`/`ADMIN`, filtrados por
  assessoria; flag `macrociclo.enabled` (404 quando desligada)
- Aba Temporada no perfil do atleta, só leitura: KPIs e tabela de semanas, no layout que estiver em
  `develop`

## Critérios de aceite

- **Dado** um atleta com prova-alvo a 20 semanas e sem temporada, **quando** o treinador clica "Gerar
  temporada", **então** nasce uma temporada em proposta com 20 semanas da temporada, cada uma com fase,
  `volumeAlvoKm` e `tssAlvo`, e a aba mostra a tabela.
- **Dado** o mesmo atleta, template e baseline, **quando** a geração roda duas vezes, **então** os valores
  são idênticos.
- **Dado** um atleta sem prova-alvo, **quando** o treinador abre a aba, **então** vê o estado vazio que
  orienta a cadastrar a prova.
- **Dado** um usuário `ATLETA`, **quando** chama a geração ou a leitura do treinador, **então** recebe 403.
- **Dado** uma temporada da assessoria A, **quando** um treinador da assessoria B a consulta, **então** não
  a encontra.
- **Dado** erro na consulta, **quando** abre a aba, **então** vê o erro com "Tentar de novo", nunca o
  estado vazio.
- **Dado** `macrociclo.enabled=false`, **quando** qualquer endpoint é chamado, **então** responde 404 e a
  aba não aparece.

## Métrica de sucesso

A do épico. Este ticket só habilita a medição de adoção (temporadas geradas por atleta com prova-alvo).

## Open Questions & Assumptions

- Se `redesign-coach-athlete-profile` ainda não estiver em `develop`, a aba entra como seção no layout
  atual; o redesenho reorganiza depois.

## Bloqueado por

- `add-season-plan-model-integrity` (ticket 1).
