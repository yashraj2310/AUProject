import axios from "axios";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Submission } from "../models/submission.model.js";

export const estimateComplexity = asyncHandler(async (req, res) => {
  const { code, language, submissionId, problemId } = req.body;

  if (!code || !language) throw new ApiError(400, "code and language are required");

  const mlUrl = process.env.ML_SERVICE_URL;
  if (!mlUrl) throw new ApiError(500, "ML_SERVICE_URL not configured");

  const { data } = await axios.post(`${mlUrl}/estimate`, {
    code,
    language,
    problem_id: problemId || null,
  });

  // Optional: store results if a submissionId is provided
  if (submissionId) {
    await Submission.findByIdAndUpdate(submissionId, {
      estimatedTimeComplexity: data.time_complexity,
      estimatedSpaceComplexity: data.space_complexity,
    });
  }

  res.status(200).json(new ApiResponse(200, data, "Complexity estimated successfully"));
});
