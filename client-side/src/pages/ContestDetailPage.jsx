// client/src/pages/ContestDetailPage.jsx
import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { contestService } from '../services/Contest.service';
import { Loader, Button } from '../components/component';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faListCheck, faClock, faHourglassEnd, faHourglassStart, 
    faHourglassHalf, faCalendarAlt, faMedal 
} from '@fortawesome/free-solid-svg-icons';
import { useSelector } from 'react-redux';

const getStatusInfo = (status) => {
    switch (status) {
        case 'Upcoming': return { color: 'text-blue-400', icon: faHourglassStart, label: 'Upcoming' };
        case 'Running': return { color: 'text-green-400', icon: faHourglassHalf, label: 'Running' };
        case 'Ended': return { color: 'text-red-400', icon: faHourglassEnd, label: 'Ended' };
        default: return { color: 'text-gray-400', icon: faClock, label: 'Unknown' };
    }
};

const getDifficultyColor = (difficulty) => {
  switch (difficulty?.toLowerCase()) {
    case "easy":
      return "text-green-400 border-green-500 bg-green-900/30";
    case "medium":
      return "text-yellow-400 border-yellow-500 bg-yellow-900/30";
    case "hard":
      return "text-red-400 border-red-500 bg-red-900/30";
    default:
      return "text-gray-400 border-gray-500 bg-gray-700/30";
  }
};

export default function ContestDetailPage() {
    const { contestId } = useParams();
    const [contest, setContest] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const { status: isAuthenticated } = useSelector(state => state.auth);
    const navigate = useNavigate();

    useEffect(() => {
        (async () => {
            if (!contestId) {
                setError("Contest ID is missing.");
                setLoading(false);
                return;
            }
            setLoading(true);
            try {
                const response = await contestService.getDetails(contestId);
                if (response.data.success) {
                    const contestData = response.data.data;
                    if (contestData && contestData.problems) {
                        contestData.problems = contestData.problems.filter(p => p.problemId !== null);
                    }
                    setContest(contestData);
                } else {
                    setError(response.data.message || "Failed to load contest details.");
                }
            } catch (err) {
                setError(err.response?.data?.message || "An error occurred fetching contest details.");
            } finally {
                setLoading(false);
            }
        })();
    }, [contestId]);

    const handleSolveProblem = (problemId) => {
        if (!isAuthenticated) {
            navigate(
              `/contests/${contestId}/problems/${problemId}`, 
              { state: { from: `/contests/${contestId}` } }
            );
            return;
        }
        navigate(
          `/contests/${contestId}/problems/${problemId}`, 
          { state: { contestId, contestTitle: contest?.title } }
        );
    };

    if (loading) return <Loader message="Loading Contest Details..." containerHeight="h-[calc(100vh-150px)]" />;
    if (error)   return <div className="p-6 text-center text-red-400">{error}</div>;
    if (!contest) return <div className="p-6 text-center text-gray-400">Contest not found or failed to load.</div>;

    const statusInfo = getStatusInfo(contest.status);
    const now = new Date();
    const canParticipate = now >= new Date(contest.startTime) && now <= new Date(contest.endTime);

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto">
            <div className="bg-gray-800 shadow-xl rounded-lg p-6 mb-8">
                <div className="flex flex-col sm:flex-row justify-between items-start mb-3">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-1">{contest.title}</h1>
                        <span className={`px-3 py-1 text-xs font-bold rounded-full ${statusInfo.color} bg-opacity-20 ${statusInfo.color.replace('text-', 'bg-').replace('-400', '-900/30')}`}>
                            <FontAwesomeIcon icon={statusInfo.icon} className="mr-1.5" />
                            {statusInfo.label}
                        </span>
                    </div>
                    {(contest.status === 'Running' ) && (
                        <Link to={`/contests/${contestId}/leaderboard`} className="mt-3 sm:mt-0">
                            <Button 
                                content="Leaderboard" 
                                icon={faMedal}
                                className="bg-yellow-500 hover:bg-yellow-600 text-black text-sm px-3 py-1.5" 
                            />
                        </Link>
                    )}
                </div>
                <div className="text-xs text-gray-400 space-y-1 mb-4">
                    <p>
                      <FontAwesomeIcon icon={faCalendarAlt} className="mr-2 w-3"/>
                      Starts: {new Date(contest.startTime).toLocaleString()}
                    </p>
                    <p>
                      <FontAwesomeIcon icon={faCalendarAlt} className="mr-2 w-3"/>
                      Ends: {new Date(contest.endTime).toLocaleString()}
                    </p>
                </div>
                {contest.description && (
                  <div 
                    dangerouslySetInnerHTML={{ __html: contest.description }} 
                    className="text-sm text-gray-300 prose prose-sm dark:prose-invert max-w-none mb-4" 
                  />
                )}
            </div>

            <h2 className="text-2xl font-semibold text-white mb-6 flex items-center">
                <FontAwesomeIcon icon={faListCheck} className="mr-3 text-blue-400"/>
                Contest Problems
            </h2>
            
            {contest.status === 'Upcoming' && (
                <div className="p-6 bg-gray-800 rounded-lg text-center text-gray-400">
                    <FontAwesomeIcon icon={faClock} size="2x" className="mb-3" />
                    <p>Problems will be visible once the contest starts.</p>
                </div>
            )}

            {(contest.status === 'Running' || contest.status === 'Ended') && contest.problems?.length === 0 && (
                <p className="text-gray-400">No problems listed for this contest yet.</p>
            )}

            {(contest.status === 'Running' || contest.status === 'Ended') && contest.problems?.length > 0 && (
                <div className="space-y-4">
                    {contest.problems.map((contestProblem, idx) => (
                        <div 
                          key={contestProblem.problemId._id} 
                          className="bg-gray-800 p-4 rounded-lg shadow-md flex justify-between items-center"
                        >
                            <div>
                                <h3 className="text-lg font-medium text-white">
                                    <Link 
                                      to={`/contests/${contestId}/problems/${contestProblem.problemId._id}`}
                                      state={{ contestId, contestTitle: contest.title }}
                                      className="hover:text-blue-400"
                                    >
                                       {idx + 1}. {contestProblem.problemId.title}
                                    </Link>
                                </h3>
                                <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${getDifficultyColor(contestProblem.problemId.difficulty)} capitalize`}>
                                    {contestProblem.problemId.difficulty}
                                </span>
                            </div>
                            {contest.status === 'Running' && canParticipate && (
                                <Button 
                                    onClick={() => handleSolveProblem(contestProblem.problemId._id)}
                                    content="Solve"
                                    className="bg-green-600 hover:bg-green-700 text-sm px-3 py-1.5"
                                />
                            )}
                            {contest.status === 'Ended' && (
                                <Link 
                                  to={`/contests/${contestId}/problems/${contestProblem.problemId._id}`} 
                                  state={{ contestId, contestTitle: contest.title, viewingMode: 'contestEnded' }}
                                >
                                  <Button content="View Problem" className="bg-gray-600 hover:bg-gray-500 text-sm px-3 py-1.5"/>
                                </Link>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
