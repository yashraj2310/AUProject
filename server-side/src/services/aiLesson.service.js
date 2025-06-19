import { Lesson } from '../models/lesson.model.js';
import { getAIHelpFeedback } from './aiFeedback.service.js'; 

export async function generateMicrolesson({ userId, problem, userCode }) {
  const prompt = `
You are an expert algorithms instructor. 
Problem title: "${problem.title}"
Brief description: "${problem.description.slice(0,200)}..."
Tags: ${problem.tags.join(', ')}
Student's accepted code (${problem.language}):
\`\`\`
${userCode}
\`\`\`
TASK:
1. Identify the core pattern/technique (e.g., "sliding window", "two pointers").
2. Write a 3–5 minute lesson explaining how that pattern solves this problem, step by step.
3. Suggest 1–2 other Cohort problems (by title) that reinforce this pattern.

Respond in JSON:
{
  "pattern": "...",
  "summary": "...",
  "recommendations": [
    { "title": "Other Problem 1", "reason": "..."},
    { "title": "Other Problem 2", "reason": "..."}
  ]
}
  `;
  const aiRaw = await getAIHelpFeedback(prompt);
  const { pattern, summary, recommendations } = JSON.parse(aiRaw);
  const recs = await Promise.all(
    recommendations.map(async r => {
      const p = await Problem.findOne({ title: r.title }).select('_id title');
      return p ? { problemId: p._id, title: p.title } : null;
    })
  );
  const lesson = await Lesson.create({ userId, problemId: problem._id, pattern, summary, recommendations: recs.filter(x=>x) });
  return lesson;
}
