import axios from 'axios';

const API_SERVER_BASE = import.meta.env.VITE_SERVER_ENDPOINT || 'http://localhost:5000';

const API_VERSION_PREFIX = ''; 

const SUBMISSIONS_API_URL = `${API_SERVER_BASE}${API_VERSION_PREFIX}/submissions`; 

const getAuthConfig = () => {
    const config = {
        withCredentials: true
    };
    return config;
};

export const submissionService = {
  estimateComplexity: async (payload) => {
  const res = await api.post("/ml/estimate", payload);
  return res.data;
},

  executeCode: async (payload) => {
    try {
      const response = await axios.post(
        `${SUBMISSIONS_API_URL}/execute`, 
        payload,
        getAuthConfig()
      );
      return response.data;
    } catch (error) {
      console.error("Error in submissionService.executeCode:", error.response?.data || error.message);
      throw error;
    }
  },

  getSubmissionResult: async (submissionId) => {
    try {
      const response = await axios.get(
        `${SUBMISSIONS_API_URL}/${submissionId}`, 
        getAuthConfig()
      );
      return response.data;
    } catch (error) {
      console.error(`Error in submissionService.getSubmissionResult for ID ${submissionId}:`, error.response?.data || error.message);
      throw error;
    }
  },
   requestAIHelp: async (payload) => {
        // payload: { code, problemId, language }
        try {
            const response = await axios.post(
                `${SUBMISSIONS_API_URL}/ai-help`,
                payload,
                getAuthConfig()
            );
            return response.data; 
        } catch (error) {
            console.error("Error in submissionService.requestAIHelp:", error.response?.data || error.message);
            throw error;
        }
    },
};