import React, { useEffect, useState, useCallback } from "react";
import { problemService } from "../services/Problem.service";
import { useSelector } from "react-redux";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { Button, Loader } from "../components/component";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilter, faTimes, faSearch, faPuzzlePiece, faTag, faExclamationCircle } from "@fortawesome/free-solid-svg-icons";

const getDifficultyColor = (difficulty) => {
  switch (difficulty?.toLowerCase()) {
    case "easy": return "text-green-400 border-green-500 bg-green-900/30";
    case "medium": return "text-yellow-400 border-yellow-500 bg-yellow-900/30";
    case "hard": return "text-red-400 border-red-500 bg-red-900/30";
    default: return "text-gray-400 border-gray-500 bg-gray-700/30";
  }
};

export default function Home() {
  const [problems, setProblems] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [error, setError] = useState('');

  const { status: isAuthenticated } = useSelector((s) => s.auth); 
  const navigate = useNavigate();
  const location = useLocation();

  const fetchProblems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const filters = {};
      if (selectedTags.length > 0) filters.tags = selectedTags;
      if (selectedDifficulty) filters.difficulty = selectedDifficulty;
      if (searchTerm.trim()) filters.search = searchTerm.trim();
      
      const response = await problemService.list(filters);
      setProblems(response.data?.data || []);
    } catch (err) {
      console.error("Failed to fetch problems:", err);
      setError(err.response?.data?.message || "Could not load problems.");
      setProblems([]);
    } finally {
      setLoading(false);
    }
  }, [selectedTags, selectedDifficulty, searchTerm]);

  useEffect(() => {
     (async () => {
         setTagsLoading(true);
         try {
             const response = await problemService.getAllUniqueTags();
             if (response.data.success) {
                 setAllTags(response.data.data || []);
             }
         } catch (err) {
             console.error("Failed to fetch tags:", err);
         } finally {
             setTagsLoading(false);
         }
     })();
  }, []);

  useEffect(() => {
    fetchProblems();
  }, [fetchProblems]); // useCallback ensures fetchProblems has stable identity

  const handleTagToggle = (tag) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleDifficultyChange = (e) => {
     setSelectedDifficulty(e.target.value);
  };
  
  const handleSearchChange = (e) => {
     setSearchTerm(e.target.value);
  };


  const clearFilters = () => {
    setSelectedTags([]);
    setSelectedDifficulty('');
    setSearchTerm('');
  };

  const handleSolve = (id) => {
    if (!isAuthenticated) { 
      navigate("/login", { state: { from: location } });
    } else {
      navigate(`/problems/${id}`); 
    }
  };
  
  return (
    <div className="flex flex-col md:flex-row bg-gray-900 min-h-[calc(100vh-68px)]"> {}
      {/* Sidebar for Filters */}
      <aside className="w-full md:w-64 lg:w-72 bg-gray-800/70 backdrop-blur-sm p-4 md:p-6 space-y-6 md:sticky md:top-[68px] md:h-[calc(100vh-68px)] md:overflow-y-auto border-r border-gray-700"> {/* Sticky sidebar */}
        <h2 className="text-xl font-semibold text-white flex items-center">
          <FontAwesomeIcon icon={faFilter} className="mr-2" /> Filters
        </h2>

        {/* Search Filter */}
        <div>
          <label htmlFor="search-problem" className="block text-sm font-medium text-gray-300 mb-1">Search Title</label>
          <div className="relative">
             <input 
                 type="text" 
                 id="search-problem"
                 placeholder="e.g., Two Sum"
                 value={searchTerm}
                 onChange={handleSearchChange}
                 className="w-full p-2 pl-8 text-sm rounded-md bg-gray-700 border border-gray-600 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
             />
             <FontAwesomeIcon icon={faSearch} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-500 h-3.5 w-3.5" />
          </div>
        </div>

        {/* Difficulty Filter */}
        <div>
          <label htmlFor="difficulty-filter" className="block text-sm font-medium text-gray-300 mb-1">Difficulty</label>
          <select 
             id="difficulty-filter" 
             value={selectedDifficulty} 
             onChange={handleDifficultyChange}
             className="w-full p-2 text-sm rounded-md bg-gray-700 border border-gray-600 text-white focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">All</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
        </div>

        {/* Tags Filter */}
        {tagsLoading ? (
            <p className="text-xs text-gray-400">Loading tags...</p>
        ) : allTags.length > 0 ? (
         <div>
             <h3 className="text-sm font-medium text-gray-300 mb-2">Tags</h3>
             <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1 custom-scrollbar"> {/* Custom scrollbar class if needed */}
             {allTags.map(tag => (
                 <button
                 key={tag}
                 onClick={() => handleTagToggle(tag)}
                 className={`w-full text-left px-3 py-1.5 text-xs rounded-md transition-colors duration-150 
                             ${selectedTags.includes(tag) 
                             ? 'bg-blue-500 text-white hover:bg-blue-600' 
                             : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                 >
                 {tag}
                 </button>
             ))}
             </div>
         </div>
        ) : (
            <p className="text-xs text-gray-400">No tags available.</p>
        )}

         {(selectedTags.length > 0 || selectedDifficulty || searchTerm) && (
             <Button
                 onClick={clearFilters}
                 content="Clear All Filters"
                 icon={faTimes}
                 bg="red-600"
                 text="white"
                 className="w-full text-sm mt-4 hover:bg-red-700"
             />
         )}
      </aside>

      {/* Main Content Area for Problems */}
      <main className="flex-grow p-4 sm:p-6 lg:p-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-8 text-center md:text-left">
          Challenge Yourself
        </h1>
        {loading ? (
          <Loader message="Loading Problems..." containerHeight="h-64" />
        ) : error ? (
          <div className="text-center text-red-400 p-10 bg-gray-800 rounded-lg">{error}</div>
        ) : problems.length === 0 ? (
         <div className="min-h-[calc(100vh-250px)] flex flex-col items-center justify-center text-gray-300 p-6 text-center">
             <FontAwesomeIcon icon={faExclamationCircle} size="3x" className="mb-4 text-yellow-500" />
             <h2 className="text-2xl font-semibold mb-2">No Problems Match Your Filters</h2>
             <p className="text-gray-400">Try adjusting or clearing your filters, or check back later for new problems!</p>
         </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6"> {/* Adjusted grid for better fit with sidebar */}
            {problems.map((p) => (
              <div
                key={p._id}
                className="bg-gray-800 rounded-xl shadow-xl overflow-hidden flex flex-col transition-all duration-300 hover:shadow-2xl hover:scale-[1.01]"
              >
                <div className="p-6 flex-grow">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-xl font-semibold text-gray-100 leading-tight">
                      <Link to={`/problems/${p._id}`} className="hover:text-blue-400 hover:underline">
                        {p.title || "Untitled Problem"}
                      </Link>
                    </h3>
                    <span
                      className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${getDifficultyColor(p.difficulty)} capitalize`}
                    >
                      {p.difficulty || "N/A"}
                    </span>
                  </div>
                  
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 mb-1.5 font-medium flex items-center">
                      <FontAwesomeIcon icon={faTag} className="mr-1.5 h-3 w-3" /> Tags:
                    </p>
                    {(p.tags && p.tags.length > 0) ? (
                      <div className="flex flex-wrap gap-1.5">
                        {p.tags.slice(0, 3).map(
                          (tagText, index) => (
                            <span key={`${p._id}-tag-${index}`} className="px-2 py-0.5 text-[11px] bg-gray-700 text-gray-300 rounded-full">
                              {tagText}
                            </span>
                          )
                        )}
                        {p.tags.length > 3 && (
                          <span className="px-2 py-0.5 text-[11px] bg-gray-700 text-gray-300 rounded-full">
                            +{p.tags.length - 3} more
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500 italic">No tags assigned</span>
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
                    className="w-full hover:bg-blue-700 text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}