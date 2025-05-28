import { Router } from 'express';
import {
  getSubmissionResult,
  executeCode,
  requestAIHelp
} from '../controllers/submission.controller.js';
import verifyJwt from '../middlewares/verifyJwt.js'; 

const router = Router();

router.post('/execute', verifyJwt, executeCode);
router.get('/:submissionId', verifyJwt, getSubmissionResult);
router.post('/ai-help', verifyJwt, requestAIHelp); 

export default router;
