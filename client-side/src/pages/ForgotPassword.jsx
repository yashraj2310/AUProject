import { useState } from "react";
import { authService } from "../services/Auth.service.js"; // Corrected path
import { Button } from "../components/component"; // Using central export
import { Link, useNavigate } from "react-router-dom";

export default function ForgotPassword() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState({ text: "", type: "info" });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const sendCode = async (e) => {
    e.preventDefault();
    if (!email) {
      setMsg({ text: "Please enter your email.", type: "error" });
      return;
    }
    setLoading(true);
    setMsg({ text: "", type: "info" });
    try {
      await authService.requestPasswordReset({ email });
      setMsg({ text: "✅ Code sent—check your inbox (or spam).", type: "success" });
      setStep(2);
    } catch (err) {
      setMsg({ text: err.response?.data?.error || err.message || "Failed to send code.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const submitNew = async (e) => {
    e.preventDefault();
    if (!code || !newPass || !confirm) {
      setMsg({ text: "All fields are required.", type: "error" });
      return;
    }
    if (newPass.length < 6) {
      setMsg({ text: "Password must be at least 6 characters.", type: "error" });
      return;
    }
    if (newPass !== confirm) {
      setMsg({ text: "New passwords must match.", type: "error" });
      return;
    }
    setLoading(true);
    setMsg({ text: "", type: "info" });
    try {
      await authService.resetPassword({
        email,
        code,
        newPassword: newPass,
        confirmPassword: confirm,
      });
      setMsg({ text: "✅ Password reset! Redirecting to login…", type: "success" });
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setMsg({ text: err.response?.data?.error || err.message || "Failed to reset password.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const getMessageClasses = () => {
    if (!msg.text) return "hidden";
    switch (msg.type) {
      case "error":
        return "text-red-400 bg-red-900/30 border border-red-700 p-3 rounded-lg";
      case "success":
        return "text-green-400 bg-green-900/30 border border-green-700 p-3 rounded-lg";
      default:
        return "text-blue-400 bg-blue-900/30 border border-blue-700 p-3 rounded-lg";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 p-4">
      <div className="w-full max-w-md bg-gray-800 shadow-2xl rounded-xl p-8 space-y-6">
        <h2 className="text-2xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
          {step === 1 ? "Forgot Your Password?" : "Reset Your Password"}
        </h2>
        <p className="text-center text-gray-400 text-sm">
          {step === 1
            ? "No worries! Enter your email and we'll send you a reset code."
            : `Enter the code sent to ${email} and your new password.`}
        </p>

        {msg.text && (
          <div className={`text-sm ${getMessageClasses()}`}>
            {msg.text}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={sendCode} className="space-y-6">
            <div>
              <label htmlFor="email-forgot" className="text-sm font-medium block mb-2 text-gray-300">
                Email Address
              </label>
              <input
                type="email"
                id="email-forgot"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 rounded-lg outline-none bg-gray-700 border-2 border-gray-600 text-white placeholder-gray-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              content={loading ? "Sending Code…" : "Send Reset Code"}
              bg="orange-500" // Using Tailwind direct color class
              text="white"
              className="w-full py-3 text-base hover:bg-orange-600"
            />
          </form>
        ) : (
          <form onSubmit={submitNew} className="space-y-4">
            <div>
              <label htmlFor="code" className="text-sm font-medium block mb-2 text-gray-300">
                Reset Code
              </label>
              <input
                type="text"
                id="code"
                required
                placeholder="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full p-3 rounded-lg outline-none bg-gray-700 border-2 border-gray-600 text-white placeholder-gray-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
              />
            </div>
            <div>
              <label htmlFor="newPass" className="text-sm font-medium block mb-2 text-gray-300">
                New Password
              </label>
              <input
                type="password"
                id="newPass"
                required
                placeholder="••••••••"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                className="w-full p-3 rounded-lg outline-none bg-gray-700 border-2 border-gray-600 text-white placeholder-gray-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
              />
            </div>
            <div>
              <label htmlFor="confirm" className="text-sm font-medium block mb-2 text-gray-300">
                Confirm New Password
              </label>
              <input
                type="password"
                id="confirm"
                required
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full p-3 rounded-lg outline-none bg-gray-700 border-2 border-gray-600 text-white placeholder-gray-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              content={loading ? "Resetting…" : "Reset Password"}
              bg="orange-500"
              text="white"
              className="w-full py-3 text-base hover:bg-orange-600"
            />
          </form>
        )}
        <div className="text-sm text-center">
          <Link to="/login" className="font-medium text-gray-400 hover:text-orange-400 transition-colors">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}