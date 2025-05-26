// client/src/pages/LeaderboardPage.jsx
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { contestService } from '../services/Contest.service';
import { Loader } from '../components/component';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMedal, faUser, faTasks, faStopwatch } from '@fortawesome/free-solid-svg-icons';

export default function LeaderboardPage() {
    const { contestId } = useParams(); // Get contestId from URL
    const [leaderboardData, setLeaderboardData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!contestId) {
            setError("Contest ID is missing.");
            setLoading(false);
            return;
        }
        (async () => {
            setLoading(true);
            try {
                const response = await contestService.getLeaderboard(contestId);
                if (response.data.success) {
                    setLeaderboardData(response.data.data);
                } else {
                    setError(response.data.message || "Failed to load leaderboard.");
                }
            } catch (err) {
                setError(err.response?.data?.message || "An error occurred fetching the leaderboard.");
            } finally {
                setLoading(false);
            }
        })();
    }, [contestId]);

    if (loading) return <Loader message="Loading Leaderboard..." containerHeight="h-[calc(100vh-150px)]" />;
    if (error) return <div className="p-6 text-center text-red-400">{error}</div>;
    if (!leaderboardData || !leaderboardData.ranks || leaderboardData.ranks.length === 0) {
        return <div className="p-6 text-center text-gray-400">Leaderboard for "{leaderboardData?.contestTitle || 'this contest'}" is currently empty or unavailable.</div>;
    }
    
    const { contestTitle, ranks } = leaderboardData;

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-8 text-center text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">
                <FontAwesomeIcon icon={faMedal} className="mr-3" /> Leaderboard: {contestTitle}
            </h1>
            <div className="overflow-x-auto bg-gray-800 shadow-xl rounded-lg">
                <table className="min-w-full text-sm text-left text-gray-300">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                        <tr>
                            <th scope="col" className="px-6 py-3 w-16 text-center">Rank</th>
                            <th scope="col" className="px-6 py-3"><FontAwesomeIcon icon={faUser} className="mr-2"/>Participant</th>
                            <th scope="col" className="px-6 py-3 text-center"><FontAwesomeIcon icon={faTasks} className="mr-2"/>Points</th>
                            <th scope="col" className="px-6 py-3 text-center"><FontAwesomeIcon icon={faStopwatch} className="mr-2"/>Penalty</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ranks.map((entry, index) => (
                            <tr key={entry.userId?._id || index} className="border-b border-gray-700 hover:bg-gray-700 transition-colors duration-150">
                                <td className="px-6 py-4 text-center font-semibold">{index + 1}</td>
                                <td className="px-6 py-4 font-medium text-white">
                                    {entry.userId?.userName || 'Unknown User'} 
                                    {/* You might want a link to user profile here later */}
                                </td>
                                <td className="px-6 py-4 text-center">{entry.totalPoints}</td>
                                <td className="px-6 py-4 text-center">{entry.totalPenalty}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}