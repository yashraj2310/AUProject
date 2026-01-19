import { Router } from "express";
import { estimateComplexity } from "../controllers/ml.controller.js";
import verifyJwt from "../middlewares/verifyJwt.js";

const router = Router();

router.post("/estimate", verifyJwt, estimateComplexity);

export default router;
