import mongoose from 'mongoose';

const LessonSchema = new mongoose.Schema({
  userId:      { type: mongoose.Types.ObjectId, ref: 'User', required: true },
  problemId:   { type: mongoose.Types.ObjectId, ref: 'Problem', required: true },
  pattern:     { type: String, required: true },     
  summary:     { type: String, required: true },     
  recommendations: [{                             
    problemId: { type: mongoose.Types.ObjectId, ref: 'Problem' },
    title:     String
  }],
  createdAt:   { type: Date, default: Date.now }
});

export const Lesson = mongoose.model('Lesson', LessonSchema);
