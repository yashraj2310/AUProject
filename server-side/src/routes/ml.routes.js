import { Router } from "express";
import { estimateComplexity } from "../controllers/ml.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/estimate", verifyJWT, estimateComplexity);

export default router;
