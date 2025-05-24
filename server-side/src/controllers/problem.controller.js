import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { Problem } from '../models/problem.model.js';

// GET /problem/get-all
export const listProblems = asyncHandler(async (req, res) => {
  const { tags, difficulty, search } = req.query; 

  let query = {};

  if (tags) {
    const tagsArray = Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim());
    if (tagsArray.length > 0) {
      query.tags = { $all: tagsArray }; 
    }
  }
  if (difficulty) {
    query.difficulty = difficulty; 
  }
  if (search) {
     query.title = { $regex: search, $options: 'i' };
  }
  const problems = await Problem.find(query)
    .select('title difficulty tags _id') 
    .sort({ createdAt: -1 }); 

  res.status(200).json(new ApiResponse(200, problems, 'Problems fetched successfully'));
});

// Controller to get all unique tags available
export const getAllUniqueTags = asyncHandler(async (req, res) => {
     const uniqueTags = await Problem.distinct('tags');
     res.status(200).json(new ApiResponse(200, uniqueTags.sort(), "Unique tags fetched successfully"));
});

// GET /problem/:id
export const getProblem = asyncHandler(async (req, res) => {
  const prob = await Problem.findById(req.params.id);
  if (!prob) throw new ApiError(404, 'Not Found');
  res.json(new ApiResponse(200, prob, 'Problem Details'));
});


