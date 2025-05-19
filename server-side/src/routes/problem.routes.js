import { Router } from 'express';
import {
  listProblems,
  getProblem,

} from '../controllers/problem.controller.js';
import verifyJWT from '../middlewares/verifyJwt.js';

const router = Router();
router.get('/get-all', listProblems);
router.get('/:id',    verifyJWT, getProblem);

export default router;
