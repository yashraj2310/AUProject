import { Router } from "express";
import {
  signup,
  login,
  logout,
  getUser,
  changePassword,
  verifyLogin,
  sendResetCode
} from "../controllers/user.controller.js";
import verifyJWT          from "../middlewares/verifyJwt.js";

// const upload = multer({ dest: "uploads/" });
const router = Router();

// Public
router.post("/signup", signup);
router.post("/login", login);
router.post('/forgot-password', sendResetCode); 
router.post("/reset-password",  changePassword);
// Protected
router.post("/logout", verifyJWT, logout);
router.get("/get-user", verifyJWT, getUser);
router.get("/verify-login", verifyJWT, verifyLogin);

export default router;
