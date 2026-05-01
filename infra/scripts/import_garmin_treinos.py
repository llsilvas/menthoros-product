#!/usr/bin/env python3
"""
Importa treinos exportados do Garmin Connect (Activities.csv) para o banco do Menthoros.

Uso:
    python import_garmin_treinos.py --atleta-id <UUID> [opções]

Exemplos:
    # Apenas imprime o SQL gerado (sem executar)
    python import_garmin_treinos.py --atleta-id 550e8400-e29b-41d4-a716-446655440000 --dry-run

    # Executa direto no banco
    python import_garmin_treinos.py --atleta-id 550e8400-e29b-41d4-a716-446655440000

    # CSV customizado e banco em host remoto
    python import_garmin_treinos.py \\
        --atleta-id 550e8400-e29b-41d4-a716-446655440000 \\
        --csv /path/to/Activities.csv \\
        --db-host 192.168.1.10 --db-port 5432

Dependências (para conexão direta):
    pip install psycopg2-binary

Sem psycopg2, o script gera SQL para execução manual (equivale a --dry-run).

Mapeamento CSV → tb_treino_realizado:
    Tipo de atividade + Título  → tipo_treino (inferido por palavras-chave)
    Data                        → data_treino, dia_semana
    Título                      → descricao
    Distância                   → distancia_km
    Tempo                       → duracao_min (INTERVAL)
    FC Média                    → fc_media
    FC máxima                   → fc_maxima_treino
    Cadência de corrida média   → cadencia_media
    Ritmo médio                 → pace_media (INTERVAL)
    Subida total                → elevacao_ganho_metros
    Descida total               → elevacao_perda_metros
    Potência média              → potencia_media
    Training Stress Score®      → tss_calculado
    (derivado do ritmo)         → velocidade_media (km/h)
"""

import argparse
import csv
import re
import sys
import uuid
from datetime import datetime, date

try:
    import psycopg2
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False

DEFAULT_CSV = "Activities.csv"

# ---------------------------------------------------------------------------
# Inferência de TipoTreino a partir do título e tipo de atividade
# ---------------------------------------------------------------------------

def infer_tipo_treino(tipo_atividade: str, titulo: str) -> str:
    t = titulo.lower()
    tipo = tipo_atividade.lower()

    if "regenerativo" in t:
        return "REGENERATIVO"
    if "fartlek" in t:
        return "FARTLEK"
    if "tempo run" in t:
        return "TEMPO_RUN"
    if any(k in t for k in ("4x800", "800m", "intervalado")):
        return "INTERVALADO"
    if "tiro" in t and "veloc" not in t:
        return "TIRO"
    if "longo" in t:
        return "LONGO"
    if "esteira" in tipo:
        return "CONTINUO"
    return "FACIL"


# ---------------------------------------------------------------------------
# Parsers de formato brasileiro
# ---------------------------------------------------------------------------

def parse_br_float(value: str):
    """Converte "18,02" → 18.02 ou "--" → None."""
    if not value or value.strip() in ("--", ""):
        return None
    try:
        return float(value.strip().replace(".", "").replace(",", "."))
    except ValueError:
        return None


def parse_br_int(value: str):
    v = parse_br_float(value)
    return int(round(v)) if v is not None else None


def parse_pace(pace_str: str):
    """
    Converte "6:17" (min:seg por km) para "00:06:17" (formato INTERVAL do PostgreSQL).
    PostgreSQL interpreta "6:17" como 6 horas e 17 minutos, então é preciso adicionar
    os zeros dos horas.
    """
    if not pace_str or pace_str.strip() in ("--", ""):
        return None
    pace_str = re.sub(r'[,\.]\d+$', '', pace_str.strip())
    parts = pace_str.split(":")
    if len(parts) == 2:
        try:
            minutes = int(parts[0])
            seconds = int(parts[1])
            return f"00:{minutes:02d}:{seconds:02d}"
        except ValueError:
            pass
    return None


def parse_duration(duration_str: str):
    """
    Converte "01:53:15" → "01:53:15" (pronto para INTERVAL do PostgreSQL).
    Remove milissegundos caso presentes ("00:04:32,6" → "00:04:32").
    """
    if not duration_str or duration_str.strip() in ("--", ""):
        return None
    cleaned = re.sub(r'[,\.]\d+$', '', duration_str.strip())
    parts = cleaned.split(":")
    if len(parts) == 3:
        return cleaned
    return None


def parse_date(date_str: str):
    """
    Converte "2026-03-28 06:38:00" → (date(2026,3,28), datetime(...)).
    """
    dt = datetime.strptime(date_str.strip(), "%Y-%m-%d %H:%M:%S")
    return dt.date(), dt


def get_dia_semana(d: date) -> str:
    mapping = {
        0: "SEGUNDA",
        1: "TERCA",
        2: "QUARTA",
        3: "QUINTA",
        4: "SEXTA",
        5: "SABADO",
        6: "DOMINGO",
    }
    return mapping[d.weekday()]


def compute_velocidade(pace_interval: str):
    """Calcula velocidade em km/h a partir do pace no formato '00:06:17'."""
    if not pace_interval:
        return None
    parts = pace_interval.split(":")
    if len(parts) != 3:
        return None
    total_sec = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    if total_sec == 0:
        return None
    return round(3600 / total_sec, 2)


# ---------------------------------------------------------------------------
# Normalização dos nomes de colunas do CSV
# ---------------------------------------------------------------------------

# Garmin exporta com encoding variável (UTF-8 com BOM, ou Latin-1).
# Os nomes das colunas são normalizados para facilitar o acesso.
COLUMN_MAP = {
    # Português com acentos
    "tipo de atividade":           "tipo_atividade",
    "data":                        "data",
    "título":                      "titulo",
    "titulo":                      "titulo",
    "distância":                   "distancia",
    "distancia":                   "distancia",
    "calorias":                    "calorias",
    "tempo":                       "tempo",
    "fc média":                    "fc_media",
    "fc media":                    "fc_media",
    "fc máxima":                   "fc_maxima",
    "fc maxima":                   "fc_maxima",
    "cadência de corrida média":   "cadencia_media",
    "cadencia de corrida media":   "cadencia_media",
    "ritmo médio":                 "ritmo_medio",
    "ritmo medio":                 "ritmo_medio",
    "subida total":                "subida_total",
    "descida total":               "descida_total",
    "potência média":              "potencia_media",
    "potencia media":              "potencia_media",
    "training stress score®":      "tss",
    "training stress score":       "tss",
}


def normalize_headers(headers: list) -> dict:
    """Retorna mapeamento {índice: nome_normalizado} para colunas de interesse."""
    result = {}
    for i, h in enumerate(headers):
        key = h.strip().lower()
        if key in COLUMN_MAP:
            result[i] = COLUMN_MAP[key]
        else:
            result[i] = key
    return result


def get_field(row: list, header_map: dict, field_name: str, default=""):
    for idx, name in header_map.items():
        if name == field_name:
            return row[idx] if idx < len(row) else default
    return default


# ---------------------------------------------------------------------------
# Parse de uma linha do CSV
# ---------------------------------------------------------------------------

def parse_row(row: list, header_map: dict) -> dict | None:
    tipo_atividade = get_field(row, header_map, "tipo_atividade").strip()
    if tipo_atividade.lower() not in ("corrida", "corrida em esteira"):
        return None

    data_str = get_field(row, header_map, "data").strip()
    try:
        d, _ = parse_date(data_str)
    except ValueError:
        print(f"  AVISO: data inválida '{data_str}', pulando linha.", file=sys.stderr)
        return None

    titulo      = get_field(row, header_map, "titulo").strip()
    distancia   = parse_br_float(get_field(row, header_map, "distancia"))
    duracao     = parse_duration(get_field(row, header_map, "tempo"))
    fc_media    = parse_br_int(get_field(row, header_map, "fc_media"))
    fc_max      = parse_br_int(get_field(row, header_map, "fc_maxima"))
    cadencia    = parse_br_int(get_field(row, header_map, "cadencia_media"))
    potencia    = parse_br_int(get_field(row, header_map, "potencia_media"))
    tss_raw     = parse_br_float(get_field(row, header_map, "tss"))
    tss         = int(round(tss_raw)) if tss_raw is not None else None
    subida      = parse_br_int(get_field(row, header_map, "subida_total"))
    descida     = parse_br_int(get_field(row, header_map, "descida_total"))
    pace        = parse_pace(get_field(row, header_map, "ritmo_medio"))
    velocidade  = compute_velocidade(pace)

    tipo_treino = infer_tipo_treino(tipo_atividade, titulo)
    dia_semana  = get_dia_semana(d)

    # external_id garante idempotência: re-importar não duplica registros
    external_id = f"garmin_{d.isoformat()}_{titulo[:40].replace(' ', '_')}"

    return {
        "data_treino":          d.isoformat(),
        "dia_semana":           dia_semana,
        "tipo_treino":          tipo_treino,
        "descricao":            titulo,
        "duracao_min":          duracao,
        "distancia_km":         distancia,
        "fc_media":             fc_media,
        "fc_maxima_treino":     fc_max,
        "cadencia_media":       cadencia,
        "potencia_media":       potencia,
        "pace_media":           pace,
        "velocidade_media":     velocidade,
        "tss_calculado":        tss,
        "metodo_calculo_tss":   "FC" if tss else None,
        "elevacao_ganho_metros": subida,
        "elevacao_perda_metros": descida,
        "fonte_dados":          "GARMIN",
        "status":               "REALIZADO",
        "criado_por":           "GARMIN",
        "external_id":          external_id,
    }


# ---------------------------------------------------------------------------
# Geração de SQL
# ---------------------------------------------------------------------------

def sql_literal(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return str(v)
    escaped = str(v).replace("'", "''")
    return f"'{escaped}'"


def interval_literal(v) -> str:
    if v is None:
        return "NULL"
    return f"INTERVAL '{v}'"


def build_insert_sql(record: dict, atleta_id: str) -> str:
    """
    Gera um INSERT que busca o tenant_id diretamente da tb_atleta,
    garantindo consistência sem precisar passá-lo manualmente.
    Usa WHERE NOT EXISTS para idempotência quando não há índice UNIQUE ainda.
    """
    row_id = str(uuid.uuid4())
    now    = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    return f"""\
INSERT INTO tb_treino_realizado (
    id, data_treino, dia_semana, tipo_treino, descricao,
    duracao_min, distancia_km, fc_media, fc_maxima_treino, cadencia_media,
    potencia_media, pace_media, velocidade_media, tss_calculado,
    metodo_calculo_tss, elevacao_ganho_metros, elevacao_perda_metros,
    fonte_dados, status, criado_por, external_id,
    atleta_id, tenant_id, criado_em, atualizado_em
)
SELECT
    '{row_id}',
    '{record["data_treino"]}',
    '{record["dia_semana"]}',
    '{record["tipo_treino"]}',
    {sql_literal(record["descricao"])},
    {interval_literal(record["duracao_min"])},
    {sql_literal(record["distancia_km"])},
    {sql_literal(record["fc_media"])},
    {sql_literal(record["fc_maxima_treino"])},
    {sql_literal(record["cadencia_media"])},
    {sql_literal(record["potencia_media"])},
    {interval_literal(record["pace_media"])},
    {sql_literal(record["velocidade_media"])},
    {sql_literal(record["tss_calculado"])},
    {sql_literal(record["metodo_calculo_tss"])},
    {sql_literal(record["elevacao_ganho_metros"])},
    {sql_literal(record["elevacao_perda_metros"])},
    'GARMIN', 'REALIZADO', 'GARMIN',
    {sql_literal(record["external_id"])},
    a.id, a.tenant_id, '{now}', '{now}'
FROM tb_atleta a
WHERE a.id = '{atleta_id}'
  AND NOT EXISTS (
      SELECT 1 FROM tb_treino_realizado
      WHERE external_id = {sql_literal(record["external_id"])}
  );"""


# ---------------------------------------------------------------------------
# Leitura do CSV
# ---------------------------------------------------------------------------

def read_csv(csv_path: str) -> tuple[list, dict]:
    """
    Tenta ler o CSV com UTF-8-sig (BOM), depois UTF-8, depois Latin-1.
    Retorna (linhas, mapa_de_headers).
    """
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            with open(csv_path, newline="", encoding=encoding) as f:
                reader = csv.reader(f)
                rows   = list(reader)
            if rows:
                header_map = normalize_headers(rows[0])
                return rows[1:], header_map
        except (UnicodeDecodeError, FileNotFoundError):
            continue
    print(f"ERRO: Não foi possível ler '{csv_path}'.", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Inserção direta via psycopg2
# ---------------------------------------------------------------------------

def insert_direct(records: list, atleta_id: str, args) -> None:
    conn = psycopg2.connect(
        host=args.db_host,
        port=int(args.db_port),
        dbname=args.db_name,
        user=args.db_user,
        password=args.db_password,
    )
    cur = conn.cursor()

    cur.execute("SELECT tenant_id FROM tb_atleta WHERE id = %s", (atleta_id,))
    row = cur.fetchone()
    if not row:
        print(f"ERRO: Atleta não encontrado: {atleta_id}", file=sys.stderr)
        conn.close()
        sys.exit(1)

    tenant_id = str(row[0])
    print(f"  tenant_id: {tenant_id}", file=sys.stderr)

    inserted = skipped = errors = 0
    now = datetime.now()

    for record in records:
        try:
            cur.execute(
                """
                INSERT INTO tb_treino_realizado (
                    id, data_treino, dia_semana, tipo_treino, descricao,
                    duracao_min, distancia_km, fc_media, fc_maxima_treino, cadencia_media,
                    potencia_media, pace_media, velocidade_media, tss_calculado,
                    metodo_calculo_tss, elevacao_ganho_metros, elevacao_perda_metros,
                    fonte_dados, status, criado_por, external_id,
                    atleta_id, tenant_id, criado_em, atualizado_em
                )
                SELECT %s, %s, %s, %s, %s,
                       %s::interval, %s, %s, %s, %s,
                       %s, %s::interval, %s, %s,
                       %s, %s, %s,
                       'GARMIN', 'REALIZADO', 'GARMIN', %s,
                       %s, %s, %s, %s
                WHERE NOT EXISTS (
                    SELECT 1 FROM tb_treino_realizado WHERE external_id = %s
                )
                """,
                (
                    str(uuid.uuid4()),
                    record["data_treino"],
                    record["dia_semana"],
                    record["tipo_treino"],
                    record["descricao"],
                    record["duracao_min"],
                    record["distancia_km"],
                    record["fc_media"],
                    record["fc_maxima_treino"],
                    record["cadencia_media"],
                    record["potencia_media"],
                    record["pace_media"],
                    record["velocidade_media"],
                    record["tss_calculado"],
                    record["metodo_calculo_tss"],
                    record["elevacao_ganho_metros"],
                    record["elevacao_perda_metros"],
                    record["external_id"],
                    atleta_id,
                    tenant_id,
                    now,
                    now,
                    record["external_id"],   # para o WHERE NOT EXISTS
                ),
            )
            if cur.rowcount > 0:
                inserted += 1
                print(f"  [OK]   {record['data_treino']}  {record['tipo_treino']:<12}  {record['descricao'][:50]}")
            else:
                skipped += 1
                print(f"  [SKIP] {record['data_treino']}  {record['descricao'][:50]}  (já existe)")
        except Exception as e:
            errors += 1
            conn.rollback()
            print(f"  [ERRO] {record['data_treino']}  {record['descricao'][:40]}: {e}", file=sys.stderr)
            continue

    conn.commit()
    cur.close()
    conn.close()
    print(f"\nResultado: {inserted} inseridos | {skipped} já existiam | {errors} erros", file=sys.stderr)


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Importa treinos do Garmin CSV para o Menthoros",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--atleta-id",  required=True, help="UUID do atleta destino")
    parser.add_argument("--csv",        default=DEFAULT_CSV, help=f"Caminho do arquivo CSV (padrão: {DEFAULT_CSV})")
    parser.add_argument("--dry-run",    action="store_true", help="Imprime o SQL sem executar no banco")
    parser.add_argument("--db-host",    default="centerbeam.proxy.rlwy.net", help="Host PostgreSQL (padrão: centerbeam.proxy.rlwy.net)")
    parser.add_argument("--db-port",    default="10783",            help="Porta PostgreSQL (padrão: 10783)")
    parser.add_argument("--db-name",    default="railway",          help="Nome do banco (padrão: railway)")
    parser.add_argument("--db-user",    default="postgres",         help="Usuário (padrão: postgres)")
    parser.add_argument("--db-password", default="xBtIKIorgCmbhmEoyTFGOSVyrGjyclaX", help="Senha")

    args = parser.parse_args()

    try:
        uuid.UUID(args.atleta_id)
    except ValueError:
        print(f"ERRO: --atleta-id inválido: '{args.atleta_id}'", file=sys.stderr)
        sys.exit(1)

    print(f"Lendo CSV: {args.csv}", file=sys.stderr)
    rows, header_map = read_csv(args.csv)
    print(f"Total de linhas no CSV: {len(rows)}", file=sys.stderr)

    records = []
    for row in rows:
        r = parse_row(row, header_map)
        if r:
            records.append(r)

    print(f"Treinos válidos para importar: {len(records)}", file=sys.stderr)

    if not records:
        print("Nenhum treino para importar.", file=sys.stderr)
        sys.exit(0)

    use_dry_run = args.dry_run or not HAS_PSYCOPG2

    if use_dry_run:
        if not HAS_PSYCOPG2 and not args.dry_run:
            print(
                "INFO: psycopg2 não encontrado. Gerando SQL para execução manual.\n"
                "      Instale com: pip install psycopg2-binary",
                file=sys.stderr,
            )

        print("-- ==============================================================")
        print("-- Importação de treinos do Garmin → Menthoros")
        print(f"-- Atleta ID : {args.atleta_id}")
        print(f"-- CSV       : {args.csv}")
        print(f"-- Total     : {len(records)} treinos")
        print(f"-- Gerado em : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("-- ==============================================================")
        print()
        for record in records:
            print(build_insert_sql(record, args.atleta_id))
            print()
    else:
        print(f"Conectando em {args.db_host}:{args.db_port}/{args.db_name}...", file=sys.stderr)
        insert_direct(records, args.atleta_id, args)


if __name__ == "__main__":
    main()
