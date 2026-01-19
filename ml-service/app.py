from fastapi import FastAPI, HTTPException
from src.model.schema import EstimateRequest, EstimateResponse
from src.model.inference import estimate_complexity

app = FastAPI(title="OJ ML Service", version="0.1.0")

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/estimate", response_model=EstimateResponse)
def estimate(req: EstimateRequest):
    try:
        return estimate_complexity(req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
