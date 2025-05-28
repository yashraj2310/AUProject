// server/src/services/aiFeedback.service.js
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure .env is loaded relative to the project root or where aiFeedback.service.js is
dotenv.config(); // Assumes .env is in server-side root

if (!process.env.OPENAI_API_KEY) {
    console.warn("❌ OpenAI API Key is not set in environment variables. AI Feedback service will not work.");
}

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
}) : null;


export const getAIHelpFeedback = async (userCode, problemContext, recentSubmissions = []) => {
    if (!openai) {
        return "AI service is currently unavailable (API key missing). Please try again later.";
    }

    let prompt = `
        You are an expert programming assistant reviewing a student's code for a competitive programming problem.
        Problem Title: "${problemContext.title}"
        Problem Description (summary): "${problemContext.description.substring(0, 200)}..." 
        (The full description is much longer, but this gives context).

        The student's current code is:
        \`\`\`${problemContext.language || 'code'}
        ${userCode}
        \`\`\`
    `;

    if (recentSubmissions && recentSubmissions.length > 0) {
        prompt += `\n\nTheir recent submission attempts for this problem resulted in: ${recentSubmissions.map(s => s.verdict).join(', ')}.`;
        const lastError = recentSubmissions.find(s => s.compileOutput || s.stderr);
        if (lastError) {
            prompt += `\nThe last error message they received was: "${(lastError.compileOutput || lastError.stderr || '').substring(0, 300)}..."`;
        }
    }

    prompt += `
        Please provide concise, constructive feedback and hints. Focus on:
        1. Potential logical errors or edge cases they might be missing based on the code and recent errors (if any).
        2. Possible areas for improvement in terms of algorithm or approach (without giving away the direct solution).
        3. If there were compilation or runtime errors, give hints on how to debug those specific types of errors in the given language.
        4. Offer a small, actionable next step or a question to guide their thinking.
        Keep the feedback encouraging and under 150 words. Do not provide the full correct code.
    `;

    try {
        console.log("AI SERVICE: Sending prompt to OpenAI...");
        const chatCompletion = await openai.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'gpt-4', // Or 'gpt-4' if you have access and budget
            temperature: 0.5, // Lower for more focused, less creative answers
            max_tokens: 250, // Limit response length
        });

        const feedback = chatCompletion.choices[0]?.message?.content?.trim() || "No specific feedback generated.";
        console.log("AI SERVICE: Received feedback from OpenAI.");
        return feedback;
    } catch (error) {
        console.error("Error calling OpenAI API:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        return "Sorry, I couldn't generate feedback at this moment. There might be an issue with the AI service.";
    }
};