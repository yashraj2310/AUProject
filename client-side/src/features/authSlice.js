import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  status: false,      // Will represent isAuthenticated
  userData: null,     // Will store the user object from backend
  loadingAuth: true,  // True while checking initial session, then false
  
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    login: (state, action) => {
     
      state.status = true;
      state.userData = action.payload.userData; // This should be the actual user object
      
      state.loadingAuth = false; // Login implies auth check is done
    },
    logout: (state) => {
      state.status = false;
      state.userData = null;
     
      state.loadingAuth = false; // Logout implies auth check is done
    },
    
    setUserSession: (state, action) => {
      // Expects action.payload to be { userData: userObjectOrNull, accessToken: "..." (optional) }
      if (action.payload.userData) {
        state.status = true;
        state.userData = action.payload.userData;
       
      } else {
        state.status = false;
        state.userData = null;
       
      }
      state.loadingAuth = false; // Mark that initial auth check is complete
    },
   
  },
});

export const { login, logout, setUserSession /*, setAuthLoading*/ } = authSlice.actions;
export default authSlice.reducer;