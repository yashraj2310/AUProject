// server/src/controllers/lesson.controller.js
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { Lesson } from '../models/lesson.model.js';

export const getLesson = asyncHandler(async (req, res) => {
  const { problemId } = req.params;
  const userId = req.user._id;

  const lesson = await Lesson.findOne({ problemId, userId }).lean();
  if (!lesson) {
    // no lesson yet
    return res.status(204).json(new ApiResponse(204, null));
  }

  // wrap it exactly the same way your other controllers do
  return res.json(new ApiResponse(200, lesson));
});
