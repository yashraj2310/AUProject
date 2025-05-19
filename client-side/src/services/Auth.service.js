
import axios from "axios";

const API = import.meta.env.VITE_SERVER_ENDPOINT;

class AuthService {
  signup = async ({ email, password, fullName, userName }) => {
    if (!email || !password || !fullName || !userName) return;
    await axios.post(
      `${API}/user/signup`,
      { email, password, fullName, userName },
      { withCredentials: true }
    );
    // auto-login after signup
    return this.login({ email, password });
  };

  login = async ({ email, password }) => {
    if (!email || !password) return;
    const { data } = await axios.post(
      `${API}/user/login`,
      { email, password },
      { withCredentials: true }
    );
    return data;
  };

  logout = async () => {
    const { data } = await axios.post(
      `${API}/user/logout`,
      {},
      { withCredentials: true }
    );
    return data;
  };

  // Step 1: ask backend to email a one-time code
  requestPasswordReset = async ({ email }) => {
    if (!email) throw new Error("Email is required");
    const { data } = await axios.post(
      `${API}/user/forgot-password`,
      { email }
    );
    return data;
  };

  // Step 2: submit code + new password
  resetPassword = async ({ email, code, newPassword, confirmPassword }) => {
    if (!email || !code || !newPassword || !confirmPassword) {
      throw new Error("All fields are required");
    }
    const { data } = await axios.post(
      `${API}/user/reset-password`,
      { email, code, newPassword, confirmPassword }
    );
    return data;
  };

  verifyLogin = async () => {
    const { data } = await axios.get(
      `${API}/user/verify-login`,
      { withCredentials: true }
    );
    return data;
  };

  getUser = async () => {
    const { data } = await axios.get(
      `${API}/user/get-user`,
      { withCredentials: true }
    );
    return data;
  };
}

export const authService = new AuthService();
