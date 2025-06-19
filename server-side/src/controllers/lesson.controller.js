import { Lesson } from '../models/lesson.model.js';

export const getLesson = async (req, res) => {
  const { problemId } = req.params;
  const userId = req.user._id;
  const lesson = await Lesson.findOne({ problemId, userId });
  if (!lesson) return res.status(204).send();
  res.json(lesson);
};
