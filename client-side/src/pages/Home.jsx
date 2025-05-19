import React, { useEffect, useState } from "react";
import { problemService } from "../services/Problem.service"; // Corrected path
import { useSelector } from "react-redux";
import { useNavigate, useLocation } from "react-router-dom";
import { Button, Loader } from "../components/component"; // Using central export
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExclamationCircle, faPuzzlePiece, faTag } from "@fortawesome/free-solid-svg-icons";

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

export default function Home() {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { status } = useSelector((s) => s.auth);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const response = await problemService.list();
        setProblems(response.data?.data || []);
      } catch (err) {
        console.error("Failed to fetch problems:", err);
        setProblems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSolve = (id) => {
    if (!status) {
      navigate("/login", { state: { from: `/problems/${id}` } });
    } else {
      navigate(`/problems/${id}`);
    }
  };

  if (loading) {
    return (
      <Loader 
        message="Loading Problems..." 
        containerHeight="min-h-[calc(100vh-68px)]" // Assuming topbar height approx 68px
        className="bg-gray-900"
      />
    );
  }

  if (!problems || problems.length === 0) {
    return (
      <div className="min-h-[calc(100vh-68px)] flex flex-col items-center justify-center text-gray-300 bg-gray-900 p-6 text-center">
        <FontAwesomeIcon icon={faExclamationCircle} size="3x" className="mb-4 text-yellow-500" />
        <h2 className="text-2xl font-semibold mb-2">No Problems Found</h2>
        <p className="text-gray-400">
          It seems there are no problems available at the moment.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 min-h-[calc(100vh-68px)] p-4 sm:p-6 lg:p-8">
      <div className="max-w-screen-xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-8 text-center sm:text-left">
          Challenge Yourself
        </h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {problems.map((p) => (
            <div
              key={p._id}
              className="bg-gray-800 rounded-xl shadow-xl overflow-hidden flex flex-col transition-all duration-300 hover:shadow-2xl hover:scale-[1.02]"
            >
              <div className="p-6 flex-grow">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-xl font-semibold text-gray-100 leading-tight">
                    {p.title || "Untitled Problem"}
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${getDifficultyColor(p.difficulty)} capitalize`}
                  >
                    {p.difficulty || "N/A"}
                  </span>
                </div>
                
                <div className="mb-4">
                  <p className="text-xs text-gray-500 mb-1 font-medium flex items-center">
                    <FontAwesomeIcon icon={faTag} className="mr-1.5" /> Tags:
                  </p>
                  {(p.tags && p.tags.length > 0) ? (
                    <div className="flex flex-wrap gap-2">
                      {(p.tags || []).slice(0, 3).map(
                        (tagText, index) => (
                          <span
                            key={`${tagText}-${index}`}
                            className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded-full"
                          >
                            {tagText}
                          </span>
                        )
                      )}
                      {p.tags.length > 3 && (
                        <span className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded-full">
                          +{p.tags.length - 3} more
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-500 italic">No tags</span>
                  )}
                </div>
              </div>

              <div className="bg-gray-800/50 px-6 py-4 border-t border-gray-700">
                <Button
                  onClick={() => handleSolve(p._id)}
                  content="Solve Problem"
                  icon={faPuzzlePiece}
                  bg="blue-600"
                  text="white"
                  className="w-full hover:bg-blue-700"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}