import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { Submission } from '../models/submission.model.js';
import { Problem } from '../models/problem.model.js';
import { submissionProcessingQueue } from '../queues/submissionQueue.js'; 
import { getAIHelpFeedback } from '../services/aiFeedback.service.js';


// POST /submissions/execute (Handles both "Run" and "Submit")
export const executeCode = asyncHandler(async (req, res) => {
  const { problemId, code, language, submissionType,contestId, customInput } = req.body;
  const userId = req.user?._id;

  if (!userId) throw new ApiError(401, 'User not authenticated');
  if (!problemId || !code || !language || !submissionType) {
    throw new ApiError(400, 'Problem ID, code, language, and submissionType are required');
  }
  if (!['run', 'submit'].includes(submissionType)) {
    throw new ApiError(400, 'Invalid submissionType. Must be "run" or "submit".');
  }

  const problem = await Problem.findById(problemId).select('testCases cpuTimeLimit memoryLimit defaultLanguage');
  if (!problem) throw new ApiError(404, 'Problem not found');

  const newSubmission = await Submission.create({
    problemId,
    userId,
    code,
    language: language || problem.defaultLanguage, 
    verdict: 'Queued',
    submissionType,
    customInput,
    testCaseResults: [],
    contestId, 
  });

  const jobId = `submission-${newSubmission._id}`;
  await submissionProcessingQueue.add(
    'process-submission', 
    {
      submissionId: newSubmission._id.toString(),
    },
    { jobId }
  );

  res.status(201).json(new ApiResponse(201, newSubmission, `Submission ${submissionType} queued.`));
});

// GET /submissions/:submissionId (To poll for results)
export const getSubmissionResult = asyncHandler(async (req, res) => {
  const { submissionId } = req.params;
  const userId = req.user?._id; 

  // Fetch the submission, and convert to a plain JS object for modification
  const submissionDocument = await Submission.findById(submissionId).lean(); 

  if (!submissionDocument) {
    throw new ApiError(404, 'Submission not found');
  }

  if (submissionDocument.userId.toString() !== userId.toString()) {
    throw new ApiError(403, 'Not authorized to view this submission');
  }

  // Transform testCaseResults before sending to the client
  let processedTestCaseResults = [];
  if (submissionDocument.testCaseResults && submissionDocument.testCaseResults.length > 0) {
    processedTestCaseResults = submissionDocument.testCaseResults.map(tc => {
      if (submissionDocument.submissionType === 'run' || tc.isSample) { 
        return {
          // testCaseId: tc.testCaseId, 
          status: tc.status,
          time: tc.time,
          memory: tc.memory,
          inputSize: tc.inputSize,
          ...( (tc.isSample || tc.isCustom) && { input: tc.input }), 
          ...( (tc.isSample && !tc.isCustom) && { expectedOutput: tc.expectedOutput }), 
          actualOutput: tc.actualOutput, 
        };
      } else { 
        // For hidden test cases in a "submit" type submission
        return {
          // testCaseId: tc.testCaseId,
          status: tc.status,
          time: tc.time,
          memory: tc.memory,
          inputSize: tc.inputSize,
          isSample: !!tc.isSample,
          isCustom: !!tc.isCustom,
        };
      }
    });
  }

  // Construct the response object with only necessary fields
  const responseData = {
    _id: submissionDocument._id,
    problemId: submissionDocument.problemId,
    // userId: submissionDocument.userId, 
    code: (submissionDocument.userId.toString() === userId.toString()) ? submissionDocument.code : "// Code hidden for privacy", 
    language: submissionDocument.language,
    verdict: submissionDocument.verdict,
    testCaseResults: processedTestCaseResults, 
    customInput: submissionDocument.customInput, 
    submissionType: submissionDocument.submissionType,
    createdAt: submissionDocument.createdAt,
    updatedAt: submissionDocument.updatedAt,
    compileOutput: submissionDocument.compileOutput,
    executionTime: submissionDocument.executionTime,
    memoryUsed: submissionDocument.memoryUsed,
    estimatedTimeComplexity: submissionDocument.estimatedTimeComplexity,
    estimatedSpaceComplexity: submissionDocument.estimatedSpaceComplexity,
    contestId: submissionDocument.contestId, // Include if present
  };

  res.status(200).json(new ApiResponse(200, responseData, 'Submission result fetched.'));
});


export const requestAIHelp = asyncHandler(async (req, res) => {
    const { code, problemId, language } = req.body;
    const userId = req.user?._id;

    if (!code || !problemId || !language) {
        throw new ApiError(400, "Code, problemId, and language are required for AI help.");
    }

    const problem = await Problem.findById(problemId).select('title description');
    if (!problem) {
        throw new ApiError(404, "Problem not found for AI help context.");
    }

    const recentSubmissions = await Submission.find({ userId, problemId, submissionType: 'submit' })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('verdict compileOutput stderr createdAt'); 

    const problemContext = {
        title: problem.title,
        description: problem.description, 
        language: language
    };

    const aiSuggestions = await getAIHelpFeedback(code, problemContext, recentSubmissions);

    res.status(200).json(new ApiResponse(200, { suggestions: aiSuggestions }, "AI feedback generated."));
});