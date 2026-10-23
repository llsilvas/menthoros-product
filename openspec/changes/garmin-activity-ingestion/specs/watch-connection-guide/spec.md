# Spec Delta — watch-connection-guide

## ADDED Requirements

### Requirement: Estado da conexão Garmin visível ao treinador
Para atleta de canal Garmin, a linha "Relógio" do treinador e o chip de sincronização SHALL
mostrar o estado da conexão Garmin: ativa, revogada, ou sem permissão de exportar atividade,
e a data da última atividade recebida. O texto SHALL permanecer neutro de marca no chip e SHALL
NOT afirmar que um treino chegou ao relógio.

#### Scenario: Conexão ativa com atividade recente
- **WHEN** o treinador abre o perfil de um atleta Garmin que teve atividade ingerida ontem
- **THEN** a linha "Relógio" mostra Garmin, canal direto, conexão ativa e "última atividade: ontem"

#### Scenario: Sem permissão de exportar
- **WHEN** o atleta não concedeu a permissão de exportar atividade
- **THEN** a linha mostra "o atleta precisa autorizar o envio de atividades no Garmin Connect"

#### Scenario: Conexão revogada
- **WHEN** a conexão foi revogada pelo atleta ou pelo Garmin
- **THEN** a linha mostra "conexão revogada" e o chip indica que não há sincronização
