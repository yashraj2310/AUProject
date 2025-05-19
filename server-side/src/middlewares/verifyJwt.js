import jwt from "jsonwebtoken";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from '../models/user.models.js';
 

export default asyncHandler(async (req, res, next) => {
  const token = req.cookies.token;            
if (!token) throw new ApiError(401, "Unauthorized");

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new ApiError(401, "Invalid token");
  }

  const user = await User.findById(payload.id).select("-password");
  if (!user) throw new ApiError(404, "User not found");

  req.user = user;
  next();
});
