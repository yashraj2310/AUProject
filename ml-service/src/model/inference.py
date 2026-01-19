import os
import joblib
import numpy as np

from src.model.schema import EstimateRequest, EstimateResponse
from src.features.common import extract_features

ART_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "artifacts")
MODEL_PATH = os.path.join(ART_DIR, "complexity_model.joblib")
META_PATH = os.path.join(ART_DIR, "complexity_meta.joblib")

def _load_or_fallback():
    if os.path.exists(MODEL_PATH) and os.path.exists(META_PATH):
        model = joblib.load(MODEL_PATH)
        meta = joblib.load(META_PATH)
        return model, meta
    return None, None

def _heuristic_map(feat: dict) -> tuple[str, str, float]:
    """
    Fallback BEFORE training exists. Still 'no execution'.
    Uses structural signals to give reasonable outputs.
    """
    loop_depth = feat.get("max_loop_depth", 0)
    recursion = feat.get("has_recursion", 0)
    sort_calls = feat.get("has_sort", 0)
    uses_hash = feat.get("uses_hashmap", 0)

    # Time complexity heuristics
    if recursion and loop_depth >= 1:
        t = "O(2^N) or O(N!) (possible)"
        risk = 0.85
    elif loop_depth >= 3:
        t = "O(N^3)"
        risk = 0.80
    elif loop_depth == 2:
        t = "O(N^2)"
        risk = 0.55
    elif loop_depth == 1 and sort_calls:
        t = "O(N log N)"
        risk = 0.25
    elif loop_depth == 1:
        t = "O(N)"
        risk = 0.15
    else:
        t = "O(1) or O(log N)"
        risk = 0.05

    # Space complexity heuristics
    if feat.get("alloc_arrays", 0) >= 2 or feat.get("uses_graph", 0):
        s = "O(N)"
    elif feat.get("alloc_arrays", 0) == 1:
        s = "O(N)"
    else:
        s = "O(1)"

    if uses_hash:
        s = "O(N)"

    return t, s, float(risk)

def estimate_complexity(req: EstimateRequest) -> EstimateResponse:
    feat = extract_features(req.language, req.code)
    model, meta = _load_or_fallback()

    # If model exists, predict; else heuristics.
    if model is None:
        t, s, risk = _heuristic_map(feat)
        return EstimateResponse(
            time_complexity=t,
            space_complexity=s,
            tle_risk=risk,
            debug_features=feat
        )

    feature_names = meta["feature_names"]
    X = np.array([[feat.get(k, 0) for k in feature_names]], dtype=float)

    # labels are strings mapped via meta
    time_label = meta["time_id_to_label"][int(model["time_clf"].predict(X)[0])]
    space_label = meta["space_id_to_label"][int(model["space_clf"].predict(X)[0])]
    tle_risk = float(model["tle_clf"].predict_proba(X)[0, 1])

    runtime_ms = float(model["runtime_reg"].predict(X)[0])
    mem_kb = float(model["mem_reg"].predict(X)[0])

    return EstimateResponse(
        time_complexity=time_label,
        space_complexity=space_label,
        tle_risk=tle_risk,
        predicted_runtime_ms=runtime_ms,
        predicted_memory_kb=mem_kb,
        debug_features=feat
    )
