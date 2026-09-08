"""Reexecuta a fixture diagnóstica sem chamadas reais à IA ou ao banco."""

import argparse
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backend", type=Path, help="Raiz do backend já compilado")
    args = parser.parse_args()
    backend = args.backend.resolve()
    reports = sorted((backend / "target/surefire-reports").glob("TEST-*.xml"))
    classpath = None
    for report in reports:
        root = ET.parse(report).getroot()
        prop = root.find("./properties/property[@name='java.class.path']")
        if prop is not None and prop.get("value"):
            classpath = prop.get("value")
            break
    if not classpath or not (backend / "target/classes").is_dir():
        parser.error("Classes/relatórios ausentes. Compile e teste a versão sob análise antes de executar o probe.")
    source = Path(__file__).resolve().with_name("ColdStartProbe.java")
    print("Fixture sintética: exit code 1 com AssertionError é o resultado RED histórico.", flush=True)
    return subprocess.run(["java", "--class-path", classpath, str(source)], cwd=backend).returncode


if __name__ == "__main__":
    sys.exit(main())
