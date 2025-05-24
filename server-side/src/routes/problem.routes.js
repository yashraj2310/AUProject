import { Router } from 'express';
import {
  listProblems,
  getProblem,
  getAllUniqueTags

} from '../controllers/problem.controller.js';
import verifyJWT from '../middlewares/verifyJwt.js';

const router = Router();
router.get('/', listProblems);
router.get('/tags', getAllUniqueTags);
router.get('/:id',    verifyJWT, getProblem);

export default router;
