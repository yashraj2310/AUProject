import React, { useState } from "react";
import { authService } from "../../services/Auth.service"; 
import { Link, useNavigate } from "react-router-dom";
import { Button } from '../component'; 

function Signup() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);
    try {
      await authService.signup({
        email,
        password,
        fullName,
        userName: fullName,
      });
      navigate("/login");
    } catch (error) {
      console.error("Signup failed:", error);
      setErrorMsg(error.response?.data?.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 p-4">
      <div className="w-full max-w-md bg-gray-800 shadow-2xl rounded-xl p-8 space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-teal-500">
            Register to Cohort
          </h2>
          <p className="mt-2 text-sm text-gray-400">Join our community and start your journey.</p>
        </div>

        {errorMsg && (
          <div className="text-red-400 text-sm bg-red-900/30 border border-red-700 p-3 rounded-lg">
            {errorMsg}
          </div>
        )}

        <form className="space-y-6" onSubmit={handleRegister}>
          <div>
            <label htmlFor="fullName" className="text-sm font-medium block mb-2 text-gray-300">
              Display Name
            </label>
            <input
              required
              onChange={(e) => setFullName(e.target.value)}
              type="text"
              name="fullName"
              id="fullName"
              value={fullName}
              className="
                w-full p-3 rounded-lg outline-none
                bg-gray-700 border-2 border-gray-600 
                text-white placeholder-gray-500 
                focus:border-green-500 focus:ring-1 focus:ring-green-500
                transition-colors duration-150
              "
              placeholder="Your Name"
            />
          </div>

          <div>
            <label htmlFor="email-signup" className="text-sm font-medium block mb-2 text-gray-300">
              Email
            </label>
            <input
              required
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              name="email"
              id="email-signup"
              value={email}
              className="
                w-full p-3 rounded-lg outline-none
                bg-gray-700 border-2 border-gray-600 
                text-white placeholder-gray-500 
                focus:border-green-500 focus:ring-1 focus:ring-green-500
                transition-colors duration-150
              "
              placeholder="name@provider.com"
            />
          </div>

          <div>
            <label htmlFor="password-signup" className="text-sm font-medium block mb-2 text-gray-300">
              Password
            </label>
            <input
              required
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              name="password"
              id="password-signup"
              value={password}
              className="
                w-full p-3 rounded-lg outline-none
                bg-gray-700 border-2 border-gray-600 
                text-white placeholder-gray-500 
                focus:border-green-500 focus:ring-1 focus:ring-green-500
                transition-colors duration-150
              "
              placeholder="••••••••"
            />
          </div>
          
          <Button
            type="submit"
            content={loading ? "Registering..." : "Register"}
            bg="green-600"
            text="white"
            className="w-full py-3 text-base"
            disabled={loading}
          />

          <div className="text-sm text-center font-medium text-gray-400">
            Already have an account?{" "}
            <Link to="/login" className="text-green-400 hover:text-green-300 hover:underline font-semibold">
              Log In
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Signup;