import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { contestService } from '../services/Contest.service';
import { Loader } from '../components/component';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrophy, faClock, faCalendarAlt, faHourglassStart, faHourglassHalf, faHourglassEnd } from '@fortawesome/free-solid-svg-icons';

const getStatusInfo = (status) => {
    switch (status) {
        case 'Upcoming': return { color: 'text-blue-400', icon: faHourglassStart, label: 'Upcoming' };
        case 'Running': return { color: 'text-green-400', icon: faHourglassHalf, label: 'Running' };
        case 'Ended': return { color: 'text-red-400', icon: faHourglassEnd, label: 'Ended' };
        default: return { color: 'text-gray-400', icon: faClock, label: 'Unknown' };
    }
};

export default function ContestListPage() {
    const [contests, setContests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const response = await contestService.list();
                if (response.data.success) {
                    setContests(response.data.data);
                } else {
                    setError(response.data.message || "Failed to load contests.");
                }
            } catch (err) {
                setError(err.response?.data?.message || "An error occurred fetching contests.");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) return <Loader message="Loading Contests..." containerHeight="h-[calc(100vh-150px)]" />;
    if (error) return <div className="p-6 text-center text-red-400">{error}</div>;

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto">
            <h1 className="text-3xl font-bold mb-8 text-center text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
                <FontAwesomeIcon icon={faTrophy} className="mr-3" /> Contests
            </h1>
            {contests.length === 0 ? (
                <p className="text-center text-gray-400">No contests available at the moment.</p>
            ) : (
                <div className="space-y-6">
                    {contests.map(contest => {
                        const statusInfo = getStatusInfo(contest.status);
                        return (
                            <div key={contest._id} className="bg-gray-800 shadow-xl rounded-lg p-6 hover:shadow-2xl transition-shadow">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
                                    <h2 className="text-2xl font-semibold text-white mb-2 sm:mb-0">
                                        <Link to={`/contests/${contest._id}`} className="hover:text-yellow-400">
                                            {contest.title}
                                        </Link>
                                    </h2>
                                    <span className={`px-3 py-1 text-xs font-bold rounded-full ${statusInfo.color} bg-opacity-20 ${statusInfo.color.replace('text-', 'bg-').replace('-400', '-900/30')}`}>
                                        <FontAwesomeIcon icon={statusInfo.icon} className="mr-1.5" />
                                        {statusInfo.label}
                                    </span>
                                </div>
                                <div className="text-xs text-gray-400 space-y-1 mb-4">
                                    <p><FontAwesomeIcon icon={faCalendarAlt} className="mr-2 w-3"/>Starts: {new Date(contest.startTime).toLocaleString()}</p>
                                    <p><FontAwesomeIcon icon={faCalendarAlt} className="mr-2 w-3"/>Ends: {new Date(contest.endTime).toLocaleString()}</p>
                                </div>
                                {contest.description && <div dangerouslySetInnerHTML={{ __html: contest.description }} className="text-sm text-gray-300 prose prose-sm dark:prose-invert max-w-none line-clamp-3 mb-4" />}
                                <Link to={`/contests/${contest._id}`} className="inline-block mt-2 px-4 py-2 text-sm bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded-md transition-colors">
                                    View Details
                                </Link>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}