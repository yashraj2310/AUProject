
import crypto from "crypto";
import { User } from "../models/user.models.js";
import { PasswordReset } from "../models/passwordReset.models.js";
import { sendEmail } from "../utils/sendEmail.js"; 
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export const requestPasswordReset = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new ApiError(400, "Email is required");

  const user = await User.findOne({ email });
  if (!user) throw new ApiError(404, "No account with that email");

  
  const rawCode = Math.floor(100000 + Math.random() * 900000).toString();
  
  const hashed = crypto.createHash("sha256").update(rawCode).digest("hex");

  const expires = Date.now() + 1000 * 60 * 15;

 
  await PasswordReset.findOneAndUpdate(
    { userId: user._id },
    { code: hashed, expires },
    { upsert: true, new: true }
  );

  // send the rawCode by email
  await sendEmail({
    to: user.email,
    subject: "Your Cohort password reset code",
    text: `Your reset code is ${rawCode}. It expires in 15 minutes.`,
  });

  res.json(new ApiResponse(200, {}, "Reset code sent"));
});
export const resetPassword = asyncHandler(async (req, res) => {
  const { email, code, newPassword, confirmPassword } = req.body;
  if (!email || !code || !newPassword || !confirmPassword) {
    throw new ApiError(400, "All fields are required");
  }
  if (newPassword !== confirmPassword) {
    throw new ApiError(400, "Passwords do not match");
  }

  const user = await User.findOne({ email });
  if (!user) throw new ApiError(404, "No user with that email");

  const reset = await PasswordReset.findOne({ userId: user._id });
  if (!reset || reset.expires < Date.now()) {
    throw new ApiError(400, "Reset code expired or not found");
  }

  // compare provided code to stored hash
  const hashedAttempt = crypto.createHash("sha256").update(code).digest("hex");
  if (hashedAttempt !== reset.code) {
    throw new ApiError(400, "Invalid reset code");
  }

  // OK! update password
  user.password = newPassword;
  await user.save();

  // clean up
  await reset.remove();

  res.json(new ApiResponse(200, {}, "Password has been reset"));
});