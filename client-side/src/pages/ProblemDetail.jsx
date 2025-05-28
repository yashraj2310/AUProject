// client/src/pages/ProblemDetail.jsx
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import Editor from "@monaco-editor/react";
import { problemService } from "../services/Problem.service";
import { submissionService } from "../services/Submission.service";
import { Button, Loader } from "../components/component"; // Assuming Button and Loader are here
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
    faListCheck, faClock, faHourglassEnd, faHourglassStart, 
    faHourglassHalf, faCalendarAlt, faTag, faExclamationCircle,
    faMagicWandSparkles // For AI Help button
} from '@fortawesome/free-solid-svg-icons';

const resultStyles = {
    base: "p-2 my-1 rounded text-sm",
    Accepted: "bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-200",
    "Partial - Sample Run": "bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200",
    "Wrong Answer": "bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-200",
    "Time Limit Exceeded": "bg-yellow-100 dark:bg-yellow-800 text-yellow-700 dark:text-yellow-200",
    "Memory Limit Exceeded": "bg-yellow-100 dark:bg-yellow-800 text-yellow-700 dark:text-yellow-200",
    "Compilation Error": "bg-orange-100 dark:bg-orange-800 text-orange-700 dark:text-orange-200",
    "Runtime Error": "bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-200",
    "Internal System Error": "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100",
    Skipped: "bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300",
    Queued: "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100",
    Compiling: "bg-indigo-100 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-200",
    Running: "bg-indigo-100 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-200", 
    "DOCKER RUNTIME ERROR": "bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-200", 
    "DOCKER_SPAWN_ERROR": "bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-200",
    "UNKNOWN_SCRIPT_OUTPUT": "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100",
};

const getResultStyle = (status) => {
  if (status?.startsWith("Running Test Case")) {
    status = "Running";
  }
  return `${resultStyles.base} ${resultStyles[status] || resultStyles["Internal System Error"]}`;
};

const getDifficultyColor = (difficulty) => {
  switch (difficulty?.toLowerCase()) {
    case "easy": return "text-green-400 border-green-500 bg-green-900/30";
    case "medium": return "text-yellow-400 border-yellow-500 bg-yellow-900/30";
    case "hard": return "text-red-400 border-red-500 bg-red-900/30";
    default: return "text-gray-400 border-gray-500 bg-gray-700/30";
  }
};

export default function ProblemDetail() {
  const { id: problemId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const { status: isAuthenticated, userData: user, loadingAuth } = useSelector(state => state.auth);

  const [problem, setProblem] = useState(null);
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("cpp");
  const [currentSubmission, setCurrentSubmission] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false); // For Run/Submit
  const [pageError, setPageError] = useState("");
  const [loadingProblem, setLoadingProblem] = useState(true);
  
  const contestIdFromState = location.state?.contestId;
  const pollIntervalRef = useRef(null);

  // AI Help States
  const [aiFeedback, setAiFeedback] = useState("");
  const [isRequestingAIHelp, setIsRequestingAIHelp] = useState(false);

  const supportedLanguages = [
    { value: "cpp", label: "C++ (GCC)" },
    { value: "java", label: "Java" },
    { value: "python", label: "Python 3" },
    { value: "javascript", label: "JavaScript (Node.js)" },
  ];

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoadingProblem(true);
        setPageError("");
        setCurrentSubmission(null);
        setAiFeedback(""); 
        setIsProcessing(false);
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

        const problemResponse = await problemService.get(problemId);
        if (problemResponse && problemResponse.data && problemResponse.data.success) {
            const probData = problemResponse.data.data;
            setProblem(probData);
            setLanguage(probData?.defaultLanguage || "cpp");
            setCode(probData?.starterCode || `// Start your ${probData?.defaultLanguage || "cpp"} code here\n`);
        } else {
            throw new Error(problemResponse?.data?.message || "Problem data not found in response.");
        }
      } catch (err) {
        console.error("Error loading problem:", err);
        setPageError(err.response?.data?.message || err.message || "Failed to load problem details.");
      } finally {
        setLoadingProblem(false);
      }
    })();
  }, [problemId]);

  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setLanguage(newLang);
    const starter = problem?.starterCode || `// Start your ${newLang} code here\n`;
    setCode(starter);
  };

  const pollForResult = useCallback((submissionId) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const apiResponse = await submissionService.getSubmissionResult(submissionId);
        if (apiResponse && apiResponse.success && apiResponse.data) {
          const submissionObject = apiResponse.data;
          setCurrentSubmission(submissionObject);
          const finalVerdicts = [
             "Accepted", "Wrong Answer", "Time Limit Exceeded", "Memory Limit Exceeded",
            "Compilation Error", "Runtime Error", "Internal System Error", "Partial - Sample Run",
            "DOCKER RUNTIME ERROR", "DOCKER_SPAWN_ERROR", "UNKNOWN_SCRIPT_OUTPUT" 
          ];
          if (submissionObject.verdict && finalVerdicts.includes(submissionObject.verdict)) {
            clearInterval(pollIntervalRef.current);
            setIsProcessing(false);
          }
        } else {
          console.warn("Polling: Received non-successful or malformed data from API", apiResponse);
        }
      } catch (err) {
        console.error("Polling error:", err);
        clearInterval(pollIntervalRef.current);
        setIsProcessing(false);
      }
    }, 2500);
  }, []); 

  const handleExecuteCode = async (submissionType) => {
    if (loadingAuth) { alert("Authentication is still loading. Please wait."); return; }
    if (!isAuthenticated) { alert("Please log in to run or submit your code."); navigate("/login"); return; }
    if (!problemId || !code.trim()) { alert("Code cannot be empty."); return; }

    setIsProcessing(true);
    setCurrentSubmission({ verdict: "Queued...", testCaseResults: [], submissionType, compileOutput: null, stderr: null });
    setPageError("");
    setAiFeedback(""); 
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    const payload = { problemId, code, language, submissionType, ...(contestIdFromState && { contestId: contestIdFromState })  };
    console.log("Submitting payload:", payload);
    try {
      const apiResponse = await submissionService.executeCode(payload);
      if (apiResponse && apiResponse.success && apiResponse.data) {
        const initialSubmission = apiResponse.data;
        setCurrentSubmission(initialSubmission);
        if (initialSubmission?._id) {
          pollForResult(initialSubmission._id);
        } else {
          setIsProcessing(false);
          setCurrentSubmission(prev => ({ ...prev, verdict: "Error", compileOutput: "Submission initialization failed: Missing ID."}));
        }
      } else {
        setIsProcessing(false);
        setCurrentSubmission(prev => ({ ...prev, verdict: "Error", compileOutput: apiResponse?.message || "Submission failed to initialize."}));
      }
    } catch (err) {
      console.error(`Error during ${submissionType}:`, err);
      const errorMsg = err.response?.data?.message || `Failed to ${submissionType} code.`;
      setCurrentSubmission(prev => ({ ...prev, verdict: "Error", compileOutput: errorMsg, stderr: errorMsg }));
      setIsProcessing(false);
    }
  };

  const handleAIHelpMe = async () => {
    if (loadingAuth) { alert("Authentication is still loading. Please wait."); return; }
    if (!isAuthenticated) { alert("Please log in to use AI Help."); navigate("/login"); return; }
    if (!code.trim() || !problemId || !language) {
        alert("Please ensure you have some code in the editor and a problem loaded.");
        return;
    }
    setIsRequestingAIHelp(true);
    setAiFeedback(""); 
    try {
        const payload = { code, problemId, language }; 
        const response = await submissionService.requestAIHelp(payload);
        if (response.success && response.data?.suggestions) {
            setAiFeedback(response.data.suggestions);
        } else {
            setAiFeedback(response.message || "Could not get AI feedback at this time.");
        }
    } catch (error) {
        setAiFeedback(error.response?.data?.message || "An error occurred while requesting AI help.");
    } finally {
        setIsRequestingAIHelp(false);
    }
  };

  if (loadingAuth || loadingProblem) {
    return <div className="p-6 text-center text-gray-400">Loading problem and authentication...</div>;
  }
  
  if (pageError && !problem) return <div className="p-6 text-red-500 text-center">{pageError}</div>;
  if (!problem) return <div className="p-6 text-center text-gray-400">Problem not found.</div>;

  return (
    <div className="p-4 md:p-6 max-w-full dark:bg-gray-900 dark:text-gray-100 min-h-screen">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Problem Description Side */}
        <div className="prose dark:prose-invert max-w-none mb-8 md:overflow-y-auto md:max-h-[calc(100vh-120px)] md:pr-4">
          <h1 className="text-2xl md:text-3xl font-bold mb-3">{problem.title}</h1>
          <p className="text-sm mb-1"><strong>Difficulty:</strong> <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getDifficultyColor(problem.difficulty)} capitalize`}>{problem.difficulty}</span></p>
          <p className="text-sm mb-3"><strong>Time Limit:</strong> {problem.cpuTimeLimit}s, <strong>Memory Limit:</strong> {problem.memoryLimit / 1024}MB</p>
          <h3 className="text-lg font-semibold mt-4 mb-2 border-b pb-1 dark:border-gray-700">Description</h3>
          <div dangerouslySetInnerHTML={{ __html: problem.description }} className="text-sm"/>
          {problem.testCases?.filter(tc => tc.isSample).length > 0 && (
            <>
              <h3 className="text-lg font-semibold mt-6 mb-2 border-b pb-1 dark:border-gray-700">Sample Cases</h3>
              {problem.testCases.filter(tc => tc.isSample).map((tc, index) => (
                <div key={`sample-${index}`} className="my-3 p-3 border rounded dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs">
                    <p className="font-medium">Sample Input {index + 1}:</p>
                    <pre className="bg-gray-100 dark:bg-gray-700 p-2 rounded mt-1 mb-2 whitespace-pre-wrap">{tc.input}</pre>
                    <p className="font-medium">Sample Output {index + 1}:</p>
                    <pre className="bg-gray-100 dark:bg-gray-700 p-2 rounded mt-1 whitespace-pre-wrap">{tc.expectedOutput}</pre>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Code Editor and Submission Side */}
        <div>
          <div className="mb-3">
            <label htmlFor="language-select" className="block text-xs font-medium text-gray-300 mb-1">Language:</label>
            <select id="language-select" value={language} onChange={handleLanguageChange} disabled={isProcessing || isRequestingAIHelp}
              className="block w-full sm:w-1/2 p-2 text-xs border border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-gray-700 text-white"
            >
              {supportedLanguages.map(lang => (<option key={lang.value} value={lang.value}>{lang.label}</option>))}
            </select>
          </div>

          <div className="mb-4 h-[55vh] md:h-[calc(100vh-420px)] min-h-[250px] border border-gray-700 rounded-md overflow-hidden">
            <Editor
              height="100%" language={language} value={code} onValueChange={(newCode) => setCode(newCode || "")}
              theme="vs-dark"
              options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true, wordWrap: "on", readOnly: isProcessing || isRequestingAIHelp }}
            />
          </div>

          <div className="flex items-center gap-3 mb-2">
            <Button
              onClick={() => handleExecuteCode('run')}
              disabled={isProcessing || isRequestingAIHelp || loadingProblem || !problem}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none disabled:opacity-60"
              content={isProcessing && currentSubmission?.submissionType === 'run' ? "Running..." : "Run Code"}
            />
            <Button
              onClick={() => handleExecuteCode('submit')}
              disabled={isProcessing || isRequestingAIHelp || loadingProblem || !problem}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none disabled:opacity-60"
              content={isProcessing && currentSubmission?.submissionType === 'submit' ? "Submitting..." : "Submit Code"}
            />
          </div>
          
          <div className="my-4">
              <Button
                  onClick={handleAIHelpMe}
                  disabled={isProcessing || isRequestingAIHelp || !problem || !code.trim()}
                  content={isRequestingAIHelp ? "AI Thinking..." : "AI, Help Me!"}
                  icon={faMagicWandSparkles}
                  className="bg-purple-600 hover:bg-purple-700 text-sm w-full md:w-auto py-2 px-4"
              />
          </div>

          {isRequestingAIHelp && !aiFeedback && (
              <div className="mt-4 p-3 border rounded-md dark:border-gray-700 bg-gray-800 text-gray-400 text-sm">
                  <Loader message="AI is generating feedback..." small={true} />
              </div>
          )}
          {aiFeedback && (
              <div className="mt-4 p-4 border rounded-md dark:border-gray-600 bg-gray-700/50 max-h-60 overflow-y-auto">
                  <h4 className="text-md font-semibold mb-2 text-purple-300">AI Suggestions:</h4>
                  <pre className="text-sm text-gray-200 whitespace-pre-wrap font-sans"> 
                      {aiFeedback}
                  </pre>
              </div>
          )}
          
          {currentSubmission && (
            <div className="mt-4 p-3 border rounded-md dark:border-gray-700 bg-gray-800 max-h-[calc(100vh-500px)] min-h-[100px] overflow-y-auto">
              <h3 className="text-md font-semibold mb-2">
                Submission Status: <span className={`font-bold ${getResultStyle(currentSubmission.verdict).split(' ')[1]}`}>{currentSubmission.verdict}</span>
              </h3>
              {currentSubmission.compileOutput && (<div className="mb-2"><p className="font-medium text-xs">Compiler Output:</p><pre className="bg-gray-700 p-2 rounded text-xs max-h-32 overflow-y-auto whitespace-pre-wrap">{currentSubmission.compileOutput}</pre></div>)}
              {currentSubmission.stderr && currentSubmission.verdict !== 'Wrong Answer' && (<div className="mb-2"><p className="font-medium text-xs">Error Details:</p><pre className="bg-red-700/30 p-2 rounded text-xs max-h-32 overflow-y-auto whitespace-pre-wrap">{currentSubmission.stderr}</pre></div>)}
              {currentSubmission.testCaseResults?.map((tcResult, index) => (
                <div key={`tc-${index}`} className={`${getResultStyle(tcResult.status)} mb-1`}>
                  Test Case {index + 1} ({tcResult.isSample ? 'Sample' : 'Hidden'}): {tcResult.status}
                  {tcResult.status !== 'Skipped' && tcResult.status !== 'Compilation Error' && (tcResult.time !== undefined && tcResult.memory !== undefined) && ` (Time: ${tcResult.time?.toFixed(3)}s, Memory: ${(tcResult.memory / 1024).toFixed(2)}MB)`}
                  {tcResult.isSample && tcResult.status === "Wrong Answer" && (<div className="mt-1 text-xs"><p className="truncate">Input: <pre className="bg-gray-600 p-1 inline-block rounded">{tcResult.input?.substring(0,50)}{tcResult.input?.length > 50 ? '...' : ''}</pre></p><p className="truncate">Expected: <pre className="bg-gray-600 p-1 inline-block rounded">{tcResult.expectedOutput?.substring(0,50)}{tcResult.expectedOutput?.length > 50 ? '...' : ''}</pre></p><p className="truncate">Got: <pre className="bg-gray-600 p-1 inline-block rounded">{tcResult.actualOutput?.substring(0,50)}{tcResult.actualOutput?.length > 50 ? '...' : ''}</pre></p></div>)}
                </div>
              ))}
               {(currentSubmission.executionTime !== undefined || currentSubmission.memoryUsed !== undefined) && currentSubmission.verdict !== 'Compilation Error' && currentSubmission.verdict !== 'Queued' && currentSubmission.verdict !== 'Internal System Error' && (!currentSubmission.verdict || currentSubmission.verdict.indexOf('Running') === -1) && (<p className="text-xs mt-2">Overall - Max Time: {currentSubmission.executionTime?.toFixed(3)}s, Max Memory: {(currentSubmission.memoryUsed / 1024)?.toFixed(2)}MB</p>)}
                {currentSubmission && currentSubmission.verdict === 'Accepted' && currentSubmission.submissionType === 'submit' && (
                    <div className="mt-3 text-xs">
                        {currentSubmission.estimatedTimeComplexity && (<p>Estimated Time Complexity: <span className="font-semibold">{currentSubmission.estimatedTimeComplexity}</span></p>)}
                        {currentSubmission.estimatedSpaceComplexity && (<p>Estimated Space Complexity: <span className="font-semibold">{currentSubmission.estimatedSpaceComplexity}</span></p>)}
                    </div>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}