import axios from 'axios';
const API = import.meta.env.VITE_SERVER_ENDPOINT;

export const problemService = {
  list:    () => axios.get(`${API}/problem/get-all`, { withCredentials:true }),
  get:     (id) => axios.get(`${API}/problem/${id}`,    { withCredentials:true }),

};
