import jwt from 'jsonwebtoken';
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.models.js";
import { emailService } from "../utils/emailService.js";

const JWT_SECRET = process.env.JWT_SECRET;
const cookieOpts = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 24 * 60 * 60 * 1000, // 1 day
};

// POST /user/signup
export const signup = asyncHandler(async (req, res) => {
  const { userName, fullName, email, password } = req.body;
  if (!userName || !fullName || !email || !password) {
    throw new ApiError(400, "All fields are required");
  }

  const existing = await User.findOne({ $or: [{ userName }, { email }] });
  if (existing) {
    throw new ApiError(409, "Username or email already exists");
  }

  
  const newUser = await User.create({
    userName,
    fullName,
    email,
    password,
   
  });

  // Generate JWT and set cookie
  const token = jwt.sign({ id: newUser._id }, JWT_SECRET);
  res.cookie("token", token, cookieOpts);

  // Return user data (without password)
  const userData = {
    id: newUser._id,
    userName: newUser.userName,
    fullName: newUser.fullName,
    email: newUser.email,
  };
  res.status(201).json(new ApiResponse(201, userData, "User registered successfully"));
});

// POST /user/login
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  const user = await User.findOne({ email });

  const valid = user && await user.isPasswordCorrect(password);
  if (!valid) throw new ApiError(401, "Invalid credentials");
  const token = jwt.sign({ id: user._id }, JWT_SECRET);
  res.cookie("token", token, cookieOpts);

  const userData = {
    id: user._id,
    userName: user.userName,
    fullName: user.fullName,
    email: user.email,
  };
  res.json(new ApiResponse(200, userData, "Login successful"));
});

// POST /user/logout
export const logout = asyncHandler(async (req, res) => {
  res.clearCookie("token", cookieOpts);
  res.json(new ApiResponse(200, {}, "Logout successful"));
});

// GET /user/get-user
export const getUser = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) throw new ApiError(401, "Not authenticated");

  const { _id, userName, fullName, email } = user;
  res.json(new ApiResponse(200, { id: _id, userName, fullName, email }, "User profile fetched"));
});

// GET /user/verify-login
export const verifyLogin = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) throw new ApiError(401, "Not authenticated");

  const { _id, userName, fullName, email, avatar } = user;
  res.json(new ApiResponse(200, { id: _id, userName, fullName, email, avatar }, "User verified"));
});




// POST /user/forgot-password
export const sendResetCode = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new ApiError(400, "Email is required");

  const user = await User.findOne({ email });
  if (!user) throw new ApiError(404, "Email not found");

  // generate & save code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  user.resetCode       = code;
  user.resetCodeExpires = Date.now() + 15*60*1000; // 15 minutes
  await user.save();

  // send via SMTP
  await emailService.sendMail({
    to: email,
    subject: "Your Cohort password reset code",
    text: `Your code is ${code} — it expires in 15 minutes.`,
  });

  res.json(new ApiResponse(200, {}, "Reset code sent"));
});



async function verifyOneTimeCode(email, code) {
  const user = await User.findOne({ email }).select(
    "+resetCode +resetCodeExpires"
  );
  if (
    !user ||
    user.resetCode !== code ||
    !user.resetCodeExpires ||
    user.resetCodeExpires.getTime() < Date.now()
  ) {
    return false;
  }
  // clear them so it’s one-time only
  user.resetCode = undefined;
  user.resetCodeExpires = undefined;
  await user.save();
  return true;
}



// POST /user/reset-password
// Expects { email, code, newPassword, confirmPassword }
export const changePassword = asyncHandler(async (req, res) => {
  const { email, code, newPassword, confirmPassword } = req.body;
  if (!email || !code || !newPassword || !confirmPassword) {
    throw new ApiError(400, "All fields are required");
  }
  if (newPassword !== confirmPassword) {
    throw new ApiError(400, "Passwords do not match");
  }

  //verify the code
  const valid = await verifyOneTimeCode(email, code);
  if (!valid) {
    throw new ApiError(401, "Invalid or expired code");
  }

  // 2) find user & update password
  const user = await User.findOne({ email });
  if (!user) throw new ApiError(404, "User not found");

  user.password = newPassword;     // pre-save hook will hash it
  await user.save();

  res.json(new ApiResponse(200, {}, "Password reset successfully"));
});




