import axios from 'axios';

const API_SERVER_BASE = import.meta.env.VITE_SERVER_ENDPOINT || 'http://localhost:5000';
const CONTESTS_API_URL = `${API_SERVER_BASE}/contests`;
export const contestService = {
    list: () => {
        return axios.get(`${CONTESTS_API_URL}` );
    },
    getDetails: (contestId) => {
        return axios.get(`${CONTESTS_API_URL}/${contestId}` );
    },
    getLeaderboard: (contestId) => {
        return axios.get(`${CONTESTS_API_URL}/${contestId}/leaderboard`);
    }
};