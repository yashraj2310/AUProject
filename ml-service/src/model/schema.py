from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

class EstimateRequest(BaseModel):
    code: str = Field(..., min_length=1)
    language: str  # "python" | "cpp" | "java" later
    problem_id: Optional[str] = None
    # optional user-provided hints:
    n_hint: Optional[int] = None

class EstimateResponse(BaseModel):
    time_complexity: str
    space_complexity: str
    tle_risk: float  # 0..1
    predicted_runtime_ms: Optional[float] = None
    predicted_memory_kb: Optional[float] = None
    debug_features: Optional[Dict[str, Any]] = None
