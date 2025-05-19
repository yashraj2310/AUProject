import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { Problem } from '../models/problem.model.js';

// GET /problem/get-all
export const listProblems = asyncHandler(async (req, res) => {
  const problems = await Problem.find().select('title difficulty');
  res.json(new ApiResponse(200, problems, 'Problems Received'));
});

// GET /problem/:id
export const getProblem = asyncHandler(async (req, res) => {
  const prob = await Problem.findById(req.params.id);
  if (!prob) throw new ApiError(404, 'Not Found');
  res.json(new ApiResponse(200, prob, 'Problem Details'));
});


