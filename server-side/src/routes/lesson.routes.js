import express from 'express';
import { getLesson } from '../controllers/lesson.controller.js';
const router = express.Router();

// GET /api/problems/:problemId/lesson
router.get('/problems/:problemId/lesson', getLesson);

export default router;
