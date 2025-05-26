import { Router } from "express";
import { listContests, getContestDetails, getContestLeaderboard } from "../controllers/contest.controller.js";

const router = Router();

router.get('/', listContests);

router.get('/:contestId', getContestDetails);
router.get('/:contestId/leaderboard', getContestLeaderboard);


export default router;