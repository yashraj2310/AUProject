import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { authService } from '../services/Auth.service'; 
import { Loader } from '../components/component'; 

const getStatusColor = (status) => {
    switch (status) {
        case 'Solved': return 'bg-green-100 text-green-800 dark:bg-green-700 dark:text-green-100';
        case 'Attempted': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-700 dark:text-yellow-100';
        default: return 'bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-300';
    }
};

export default function ProgressPage() {
    const [progressData, setProgressData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    
    const { status: isAuthenticated, loadingAuth } = useSelector(state => state.auth);
    const navigate = useNavigate();

    useEffect(() => {
        if (loadingAuth) {
            // Wait for authentication check to complete
            return;
        }

        if (!isAuthenticated) {
            setIsLoading(false);
            setError("Please log in to view your progress.");
            // Optional: redirect to login after a delay or show login button
            // setTimeout(() => navigate('/login'), 3000); 
            return;
        }

        const fetchProgress = async () => {
            try {
                setIsLoading(true);
                const response = await authService.getUserProgress(); // Using your service
                if (response.success) {
                    setProgressData(response.data);
                    setError('');
                } else {
                    setError(response.message || "Failed to fetch progress.");
                }
            } catch (err) {
                console.error("ProgressPage fetch error:", err);
                setError(err.response?.data?.message || err.message || "An error occurred while fetching progress.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchProgress();
    }, [isAuthenticated, loadingAuth, navigate]);

    if (isLoading || loadingAuth) {
        return <Loader message="Loading your progress..." containerHeight="h-[calc(100vh-200px)]" />;
    }

    if (error) {
        return <div className="p-6 text-center text-red-400 dark:text-red-300">{error}</div>;
    }

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-8 text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
                My Problem Solving Progress
            </h1>
            {progressData.length === 0 && (
                <p className="text-center text-gray-400">You haven't attempted any problems yet, or no problems are available.</p>
            )}
            {progressData.length > 0 && (
                <div className="overflow-x-auto bg-gray-800 shadow-xl rounded-lg">
                    <table className="min-w-full text-sm text-left text-gray-300">
                        <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                            <tr>
                                <th scope="col" className="px-6 py-3">#</th>
                                <th scope="col" className="px-6 py-3">Problem Title</th>
                                <th scope="col" className="px-6 py-3">Difficulty</th>
                                <th scope="col" className="px-6 py-3">Your Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {progressData.map((item, index) => (
                                <tr key={item.problemId} className="border-b border-gray-700 hover:bg-gray-700 transition-colors duration-150">
                                    <td className="px-6 py-4">{index + 1}</td>
                                    <th scope="row" className="px-6 py-4 font-medium text-white whitespace-nowrap">
                                        <Link to={`/problem/${item.problemId}`} className="hover:text-blue-400 hover:underline">
                                            {item.title}
                                        </Link>
                                    </th>
                                    <td className="px-6 py-4">{item.difficulty}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-3 py-1 text-xs font-bold rounded-full ${getStatusColor(item.userStatus)}`}>
                                            {item.userStatus}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}