import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { Contest } from '../models/contest.model.js';
import { Problem } from '../models/problem.model.js'; // To populate problem details
import {User} from '../models/user.models.js'; // To populate user details
import { ContestScore } from '../models/contestScore.model.js';

export const listContests = asyncHandler(async (req, res) => {
    const contests = await Contest.find({ visibility: 'public' })
        .sort({ startTime: -1 }) 
        .select('title description startTime endTime status problems'); 

    res.status(200).json(new ApiResponse(200, contests, "Contests fetched successfully"));
});

export const getContestDetails = asyncHandler(async (req, res) => {
    const { contestId } = req.params;
    if (!contestId) {
        throw new ApiError(400, "Contest ID is required");
    }

    const contest = await Contest.findById(contestId)
        .populate({
            path: 'problems.problemId', 
            select: 'title difficulty _id tags'
        })
        .select('-participants -createdBy'); 

    if (!contest) {
        throw new ApiError(404, "Contest not found");
    }

    res.status(200).json(new ApiResponse(200, contest, "Contest details fetched successfully"));
});

export const getContestLeaderboard = asyncHandler(async (req, res) => {
    const { contestId } = req.params;
    if (!contestId) {
        throw new ApiError(400, "Contest ID is required");
    }

    // Check if contest exists and is public or user is part of it (add access control later)
    const contest = await Contest.findById(contestId).select('_id title');
    if (!contest) {
        throw new ApiError(404, "Contest not found");
    }

    const leaderboard = await ContestScore.find({ contestId })
        .sort({ totalPoints: -1, totalPenalty: 1, lastAcceptedSubmissionTime: 1 }) 
        .populate({
            path: 'userId',
            select: 'userName fullName' // Select fields you want to show for the user
        })
        .limit(100); 

    res.status(200).json(new ApiResponse(200, { contestTitle: contest.title, ranks: leaderboard }, "Leaderboard fetched"));
});