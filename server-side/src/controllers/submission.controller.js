import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { Submission } from '../models/submission.model.js';
import { Problem } from '../models/problem.model.js';
import { submissionProcessingQueue } from '../queues/submissionQueue.js'; 

// POST /submissions/execute (Handles both "Run" and "Submit")
export const executeCode = asyncHandler(async (req, res) => {
  const { problemId, code, language, submissionType,contestId } = req.body; // submissionType: "run" or "submit"
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
    language: language || problem.defaultLanguage, // Use provided lang or problem default
    verdict: 'Queued',
    submissionType,
    testCaseResults: [],
    contestId,
  });

  // Add job to the queue
  const jobId = `submission-${newSubmission._id}`; // Unique job ID for the overall submission
  await submissionProcessingQueue.add(
    'process-submission', // Job name
    {
      submissionId: newSubmission._id.toString(),
      // Worker will fetch problem details again to ensure consistency
    },
    { jobId }
  );

  res.status(201).json(new ApiResponse(201, newSubmission, `Submission ${submissionType} queued.`));
});

// GET /submissions/:submissionId (To poll for results)
export const getSubmissionResult = asyncHandler(async (req, res) => {
  const { submissionId } = req.params;
  const userId = req.user?._id;

  const submission = await Submission.findById(submissionId);

  if (!submission) throw new ApiError(404, 'Submission not found');
  // Add authorization: only owner or admin can view
  if (submission.userId.toString() !== userId.toString() /* && !req.user.isAdmin */) {
    throw new ApiError(403, 'Not authorized to view this submission');
  }

  res.status(200).json(new ApiResponse(200, submission, 'Submission result fetched.'));
});