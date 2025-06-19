import { Router } from 'express';
import { getLesson } from '../controllers/lesson.controller.js';

const router = Router();

// GET /problems/:problemId/lesson
router.get('/:problemId/lesson', getLesson);

export default router;
