import React, { useState } from 'react';
import { authService } from '../../services/Auth.service';
import { useDispatch } from 'react-redux';
import { login } from '../../features/authSlice.js';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../component'; 

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const userData = await authService.login({ email, password });
      dispatch(login({ userData: userData.data }));
      navigate('/');
    } catch (error) {
      console.error("Login failed:", error);
      setErrorMsg(error.response?.data?.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 p-4">
      <div className="w-full max-w-md bg-gray-800 shadow-2xl rounded-xl p-8 space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            Sign in to Cohort
          </h2>
          <p className="mt-2 text-sm text-gray-400">Welcome back! Please enter your details.</p>
        </div>

        {errorMsg && (
          <div className="text-red-400 text-sm bg-red-900/30 border border-red-700 p-3 rounded-lg">
            {errorMsg}
          </div>
        )}

        <form className="space-y-6" onSubmit={handleLogin}>
          <div>
            <label htmlFor="email" className="text-sm font-medium block mb-2 text-gray-300">
              Your Email
            </label>
            <input
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              name="email"
              id="email"
              required
              value={email}
              className="
                w-full p-3 rounded-lg outline-none
                bg-gray-700 border-2 border-gray-600 
                text-white placeholder-gray-500 
                focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                transition-colors duration-150
              "
              placeholder="name@company.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="text-sm font-medium block mb-2 text-gray-300">
              Your Password
            </label>
            <input
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              name="password"
              id="password"
              required
              value={password}
              className="
                w-full p-3 rounded-lg outline-none
                bg-gray-700 border-2 border-gray-600 
                text-white placeholder-gray-500 
                focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                transition-colors duration-150
              "
              placeholder="••••••••"
            />
          </div>

          <div className="flex items-center justify-end">
            <Link to="/forgot-password" className="text-sm text-blue-400 hover:text-blue-300 hover:underline">
              Forgot Password?
            </Link>
          </div>
          
          <Button
            type="submit"
            content={loading ? 'Logging in...' : 'Log In'}
            bg="blue-600"
            text="white"
            className="w-full py-3 text-base"
            disabled={loading}
          />

          <div className="text-sm text-center font-medium text-gray-400">
            Not registered?{' '}
            <Link to="/signup" className="text-blue-400 hover:text-blue-300 hover:underline font-semibold">
              Create account
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Login;