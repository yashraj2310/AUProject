import axios from "axios";
const API_SERVER_BASE =
  import.meta.env.VITE_SERVER_ENDPOINT || "http://localhost:5000";
const PROBLEMS_API_URL = `${API_SERVER_BASE}/problems`;
// getAuthConfig if needed for any protected problem routes, for now assuming list is public
// const getAuthConfig = () => ({ withCredentials: true });
export const problemService = {
  list: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.tags && filters.tags.length > 0) {
      params.append("tags", filters.tags.join(","));
    }
    if (filters.difficulty) {
      params.append("difficulty", filters.difficulty);
    }
    if (filters.search && filters.search.trim() !== "") {
      params.append("search", filters.search.trim());
    }
    return axios.get(`${PROBLEMS_API_URL}`, {
      params,
      withCredentials: true,
    });
  },
  get: (id) =>
    axios.get(`${PROBLEMS_API_URL}/${id}`, { withCredentials: true }),
  getAllUniqueTags: () => {
    return axios.get(`${PROBLEMS_API_URL}/tags`, { withCredentials: true });
  },
};
