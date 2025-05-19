import { Router } from 'express';
import {
  getSubmissionResult,
  executeCode,
} from '../controllers/submission.controller.js';
import verifyJwt from '../middlewares/verifyJwt.js'; 

const router = Router();

router.post('/execute', verifyJwt, executeCode);
router.get('/:submissionId', verifyJwt, getSubmissionResult);

export default router;
