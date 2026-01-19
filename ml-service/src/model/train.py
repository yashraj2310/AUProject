import os
import joblib
import numpy as np
import pandas as pd

from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.model_selection import train_test_split

from src.features.common import extract_features

ART_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "artifacts")
os.makedirs(ART_DIR, exist_ok=True)

# Simple label sets (you can expand later)
TIME_LABELS = ["O(1) or O(log N)", "O(N)", "O(N log N)", "O(N^2)", "O(N^3)", "O(2^N) or O(N!) (possible)"]
SPACE_LABELS = ["O(1)", "O(N)"]

def build_labels_from_heuristics(feat: dict):
    # same mapping as inference fallback
    loop_depth = feat.get("max_loop_depth", 0)
    recursion = feat.get("has_recursion", 0)
    sort_calls = feat.get("has_sort", 0)
    uses_hash = feat.get("uses_hashmap", 0)

    if recursion and loop_depth >= 1:
        t = TIME_LABELS[5]
    elif loop_depth >= 3:
        t = TIME_LABELS[4]
    elif loop_depth == 2:
        t = TIME_LABELS[3]
    elif loop_depth == 1 and sort_calls:
        t = TIME_LABELS[2]
    elif loop_depth == 1:
        t = TIME_LABELS[1]
    else:
        t = TIME_LABELS[0]

    if feat.get("alloc_arrays", 0) >= 1 or uses_hash:
        s = "O(N)"
    else:
        s = "O(1)"
    return t, s

def train_from_csv(csv_path: str, out_prefix: str = "complexity"):
    """
    CSV columns expected:
    language, code, verdict, executionTime, memoryUsed
    """
    df = pd.read_csv(csv_path)
    feats = []
    time_y = []
    space_y = []
    tle_y = []
    runtime_y = []
    mem_y = []

    for _, row in df.iterrows():
        code = str(row["code"])
        language = str(row["language"])
        verdict = str(row.get("verdict", ""))

        f = extract_features(language, code)
        t_label, s_label = build_labels_from_heuristics(f)

        feats.append(f)
        time_y.append(TIME_LABELS.index(t_label))
        space_y.append(SPACE_LABELS.index(s_label))
        tle_y.append(1 if verdict == "Time Limit Exceeded" else 0)

        runtime_y.append(float(row.get("executionTime", 0.0)))
        mem_y.append(float(row.get("memoryUsed", 0.0)))

    feature_names = sorted({k for d in feats for k in d.keys()})
    X = np.array([[d.get(k, 0) for k in feature_names] for d in feats], dtype=float)

    X_train, X_test, y_time_tr, y_time_te = train_test_split(X, time_y, test_size=0.2, random_state=42)

    time_clf = RandomForestClassifier(n_estimators=300, random_state=42)
    space_clf = RandomForestClassifier(n_estimators=200, random_state=42)
    tle_clf = RandomForestClassifier(n_estimators=200, random_state=42)

    runtime_reg = RandomForestRegressor(n_estimators=300, random_state=42)
    mem_reg = RandomForestRegressor(n_estimators=300, random_state=42)

    time_clf.fit(X_train, y_time_tr)
    space_clf.fit(X, space_y)
    tle_clf.fit(X, tle_y)

    runtime_reg.fit(X, runtime_y)
    mem_reg.fit(X, mem_y)

    model = {
        "time_clf": time_clf,
        "space_clf": space_clf,
        "tle_clf": tle_clf,
        "runtime_reg": runtime_reg,
        "mem_reg": mem_reg,
    }

    meta = {
        "feature_names": feature_names,
        "time_id_to_label": {i: l for i, l in enumerate(TIME_LABELS)},
        "space_id_to_label": {i: l for i, l in enumerate(SPACE_LABELS)},
    }

    joblib.dump(model, os.path.join(ART_DIR, f"{out_prefix}_model.joblib"))
    joblib.dump(meta, os.path.join(ART_DIR, f"{out_prefix}_meta.joblib"))

    print("Saved:", os.path.join(ART_DIR, f"{out_prefix}_model.joblib"))

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    args = ap.parse_args()
    train_from_csv(args.csv)
