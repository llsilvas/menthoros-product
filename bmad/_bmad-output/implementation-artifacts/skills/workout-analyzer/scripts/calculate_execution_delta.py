#!/usr/bin/env python3
"""
Calculate execution delta between planned and actual workout.

This script provides objective metrics for the LLM to analyze.
It runs independently of the main Java application.
"""

import json
import sys
from dataclasses import dataclass, asdict
from typing import Optional


@dataclass
class WorkoutDelta:
    """Métricas de delta entre planejado e realizado."""
    
    distance_delta_km: float
    distance_delta_percent: float
    rpe_delta: int
    pace_delta_seconds: Optional[float] = None
    hr_zone_match: Optional[bool] = None
    completion_percent: float = 100.0


def parse_pace(pace_str: str) -> int:
    """
    Converte pace MM:SS/km para segundos totais.
    
    Args:
        pace_str: String no formato "MM:SS/km" ou "MM:SS-MM:SS/km"
    
    Returns:
        Segundos totais
    
    Exemplo:
        "5:30/km" → 330 segundos
        "5:30-5:45/km" → 337 segundos (ponto médio)
    """
    if not pace_str or '/' not in pace_str:
        return 0
    
    # Remove "/km"
    pace = pace_str.split('/')[0]
    
    # Se é um range, usa o ponto médio
    if '-' in pace:
        lower, upper = pace.split('-')
        lower_sec = _parse_single_pace(lower)
        upper_sec = _parse_single_pace(upper)
        return int((lower_sec + upper_sec) / 2)
    
    return _parse_single_pace(pace)


def _parse_single_pace(pace: str) -> int:
    """Parse single pace string MM:SS to seconds."""
    minutes, seconds = pace.split(':')
    return int(minutes) * 60 + int(seconds)


def calculate_delta(planned: dict, actual: dict) -> WorkoutDelta:
    """
    Calcula deltas entre treino planejado e realizado.
    
    Args:
        planned: Dicionário com dados do treino planejado
        actual: Dicionário com dados do treino realizado
    
    Returns:
        WorkoutDelta com todas as métricas calculadas
    """
    # Distância
    planned_dist = planned.get('distance_km', 0)
    actual_dist = actual.get('distance_km', 0)
    
    distance_delta_km = actual_dist - planned_dist
    distance_delta_percent = (
        (distance_delta_km / planned_dist * 100) 
        if planned_dist > 0 else 0
    )
    
    completion_percent = (
        (actual_dist / planned_dist * 100) 
        if planned_dist > 0 else 100.0
    )
    
    # RPE Delta
    rpe_delta = actual.get('rpe', 0) - planned.get('expected_rpe', 0)
    
    # Pace Delta (opcional)
    pace_delta_seconds = None
    if 'target_pace' in planned and 'avg_pace' in actual:
        try:
            target_seconds = parse_pace(planned['target_pace'])
            actual_seconds = parse_pace(actual['avg_pace'])
            
            if target_seconds > 0 and actual_seconds > 0:
                pace_delta_seconds = actual_seconds - target_seconds
        except (ValueError, AttributeError):
            pass  # Mantém None se parsing falhar
    
    # Zona cardíaca (placeholder - implementar se necessário)
    hr_zone_match = None
    
    return WorkoutDelta(
        distance_delta_km=round(distance_delta_km, 2),
        distance_delta_percent=round(distance_delta_percent, 1),
        rpe_delta=rpe_delta,
        pace_delta_seconds=pace_delta_seconds,
        hr_zone_match=hr_zone_match,
        completion_percent=round(completion_percent, 1)
    )


def main():
    """
    Entry point: lê JSON do stdin, calcula deltas, escreve JSON no stdout.
    
    Formato de entrada:
    {
      "planned": {
        "distance_km": 18,
        "target_pace": "5:30-5:45/km",
        "expected_rpe": 4
      },
      "actual": {
        "distance_km": 17.8,
        "avg_pace": "5:38/km",
        "rpe": 7
      }
    }
    
    Formato de saída:
    {
      "distance_delta_km": -0.2,
      "distance_delta_percent": -1.1,
      "rpe_delta": 3,
      "pace_delta_seconds": 0.5,
      "hr_zone_match": null,
      "completion_percent": 98.9
    }
    """
    try:
        input_data = json.load(sys.stdin)
        
        planned = input_data.get('planned', {})
        actual = input_data.get('actual', {})
        
        delta = calculate_delta(planned, actual)
        
        # Output como JSON
        print(json.dumps(asdict(delta), indent=2))
        
    except json.JSONDecodeError as e:
        print(json.dumps({
            "error": "Invalid JSON input",
            "message": str(e)
        }), file=sys.stderr)
        sys.exit(1)
        
    except Exception as e:
        print(json.dumps({
            "error": "Calculation failed",
            "message": str(e)
        }), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
