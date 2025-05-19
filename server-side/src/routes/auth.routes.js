
import { Router } from "express";
import { requestPasswordReset } from "../controllers/auth.controller.js";
import { resetPassword } from "../controllers/auth.controller.js";
export const authRouter = Router();

authRouter.post("/password-reset/request", requestPasswordReset);
authRouter.post("/password-reset/confirm", resetPassword);