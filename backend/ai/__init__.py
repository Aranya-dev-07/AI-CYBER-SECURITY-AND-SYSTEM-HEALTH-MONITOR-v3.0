"""
ai package

Initializes the AI package for the Lavender Trinetra system and
exposes the public interfaces of its submodules for convenient import
by main.py and other consumers.
"""

from .ai_engine import (
    AIEngine,
    AIEngineError,
    AIAnalysisResult,
    run_ai_analysis,
)
from .anomaly_engine import (
    AnomalyEngine,
    AnomalyEngineError,
    AnomalyResult,
    TrendResult,
    PredictiveAlert,
    run_anomaly_analysis,
)
from .recommendation_engine import (
    RecommendationEngine,
    RecommendationEngineError,
    RootCauseFinding,
    Recommendation,
    run_recommendation_analysis,
)

__all__ = [
    # AI Engine
    "AIEngine",
    "AIEngineError",
    "AIAnalysisResult",
    "run_ai_analysis",
    # Anomaly Engine
    "AnomalyEngine",
    "AnomalyEngineError",
    "AnomalyResult",
    "TrendResult",
    "PredictiveAlert",
    "run_anomaly_analysis",
    # Recommendation Engine
    "RecommendationEngine",
    "RecommendationEngineError",
    "RootCauseFinding",
    "Recommendation",
    "run_recommendation_analysis",
]