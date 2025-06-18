import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import Editor from "@monaco-editor/react"; // Using Monaco Editor
import { problemService } from "../services/Problem.service";
import { submissionService } from "../services/Submission.service";
import { Button, Loader } from "../components/component";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faListCheck, faClock, faHourglassEnd, faHourglassStart, 
  faHourglassHalf, faCalendarAlt, faTag, faExclamationCircle
} from '@fortawesome/free-solid-svg-icons';

// --- Styling Helper Functions ---
const resultStyles = {
  base: "p-2 my-1 rounded text-sm",
  Accepted: "bg-green-100 dark:bg-green-800 text-green-700 dark:text-gray-100",
  "Partial - Sample Run": "bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-gray-200",
  "Wrong Answer": "bg-red-100 dark:bg-red-800 text-red-700 dark:text-gray-200",
  "Time Limit Exceeded": "bg-yellow-100 dark:bg-yellow-800 text-yellow-700 dark:text-gray-200",
  "Memory Limit Exceeded": "bg-yellow-100 dark:bg-yellow-800 text-yellow-700 dark:text-gray-200",
  "Compilation Error": "bg-orange-100 dark:bg-orange-800 text-orange-700 dark:text-gray-200",
  "Runtime Error": "bg-red-100 dark:bg-red-800 text-red-700 dark:text-gray-200",
  "Internal System Error": "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100",
  Skipped: "bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300",
  Queued: "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100",
  Compiling: "bg-indigo-100 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-200",
  Running: "bg-indigo-100 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-200", 
  "DOCKER RUNTIME ERROR": "bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-gray-200", 
  "DOCKER_SPAWN_ERROR": "bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-gray-200",
  UNKNOWN_SCRIPT_OUTPUT: "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100",
  "Custom Output": "bg-teal-100 dark:bg-teal-800 text-teal-700 dark:text-teal-200",
};

const getResultStyle = (status) => {
  let key = status;
  if (status?.startsWith("Running Test Case")) key = "Running";
  return `${resultStyles.base} ${resultStyles[key] || resultStyles["Internal System Error"]}`;
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
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const { status: isAuthenticated, loadingAuth } = useSelector(state => state.auth);

  const problemId = params.id || params.problemId; 
  const contestId = params.contestId || location.state?.contestId || new URLSearchParams(location.search).get("contestId") || null;

  const [problem, setProblem] = useState(null);
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("cpp"); 
  const [currentSubmission, setCurrentSubmission] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pageError, setPageError] = useState("");
  const [loadingProblem, setLoadingProblem] = useState(true);

  const [aiFeedback, setAiFeedback] = useState("");
  const [isRequestingAIHelp, setIsRequestingAIHelp] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [customInput, setCustomInput] = useState("");

  const pollIntervalRef = useRef(null);

  const supportedLanguages = [
    { value: "cpp", label: "C++ (GCC)" },
    { value: "java", label: "Java" },
    { value: "python", label: "Python 3" },
    { value: "javascript", label: "JavaScript (Node.js)" },
  ];

  // Cleanup polling on unmount
  useEffect(() => () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
  }, []);

  // Load problem and reset editor to one-line prompt
  useEffect(() => {
    if (!problemId) {
      setPageError("Problem ID not found in URL.");
      setLoadingProblem(false);
      return;
    }
    (async () => {
      try {
        setLoadingProblem(true);
        setPageError("");
        setCurrentSubmission(null);
        setAiFeedback("");
        setShowAIModal(false);
        setIsProcessing(false);
        setIsRequestingAIHelp(false);
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

        const problemResponse = await problemService.get(problemId);
        if (problemResponse?.data?.success) {
          const probData = problemResponse.data.data;
          setProblem(probData);

          // default language and blank-stub
          const defaultLang = probData?.defaultLanguage || "cpp";
          setLanguage(defaultLang);
          setCode(`// Write your ${defaultLang} solution here`);
        } else {
          throw new Error(problemResponse?.data?.message || "Problem data not found");
        }
      } catch (err) {
        console.error("Error loading problem:", err);
        setPageError(err.response?.data?.message || err.message || "Failed to load problem details.");
      } finally {
        setLoadingProblem(false);
      }
    })();
  }, [problemId]);

  // When language changes, reset editor to one-line prompt
  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setLanguage(newLang);
    setCode(`// Write your ${newLang} solution here`);
  };

  // Polling logic stays the same...
  const pollForResult = useCallback((submissionId) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const apiResponse = await submissionService.getSubmissionResult(submissionId);
        if (apiResponse?.success && apiResponse.data) {
          const submissionObject = apiResponse.data;
          setCurrentSubmission(submissionObject);
          const finalVerdicts = [
            "Accepted", "Wrong Answer", "Time Limit Exceeded", "Memory Limit Exceeded",
            "Compilation Error", "Runtime Error", "Internal System Error", "Partial - Sample Run",
            "DOCKER RUNTIME ERROR", "DOCKER_SPAWN_ERROR", "UNKNOWN_SCRIPT_OUTPUT", "Custom Output"
          ];
          if (submissionObject.verdict && finalVerdicts.includes(submissionObject.verdict)) {
            clearInterval(pollIntervalRef.current);
            setIsProcessing(false);
          }
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
    if (!isAuthenticated) { navigate("/login", { state: { from: location }}); return; }
    if (!problemId || !code.trim()) { alert("Code cannot be empty."); return; }

    setIsProcessing(true);
    setCurrentSubmission({
      verdict: "Queued...",
      testCaseResults: [],
      submissionType,
      compileOutput: null,
      stderr: null
    });
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    const payload = { problemId, code, language, submissionType };
    if (submissionType === "run" && customInput.trim()) {
      payload.customInput = customInput;
    }
    if (contestId) payload.contestId = contestId;

    try {
      const apiResponse = await submissionService.executeCode(payload);
      if (apiResponse?.success && apiResponse.data) {
        const initialSubmission = apiResponse.data;
        setCurrentSubmission(initialSubmission);
        if (initialSubmission._id) {
          pollForResult(initialSubmission._id);
        } else {
          setIsProcessing(false);
          setCurrentSubmission(prev => ({
            ...prev,
            verdict: "Error",
            compileOutput: "Submission initialization failed: Missing ID."
          }));
        }
      } else {
        setIsProcessing(false);
        setCurrentSubmission(prev => ({
          ...prev,
          verdict: "Error",
          compileOutput: apiResponse?.message || "Submission failed to initialize."
        }));
      }
    } catch (err) {
      console.error(`Error during ${submissionType}:`, err);
      const errorMsg = err.response?.data?.message || `Failed to ${submissionType} code.`;
      setCurrentSubmission(prev => ({
        ...prev,
        verdict: "Error",
        compileOutput: errorMsg,
        stderr: errorMsg
      }));
      setIsProcessing(false);
    }
  };

  // ... handleAIHelpMe stays unchanged ...

  if (loadingAuth || loadingProblem) {
    return <div className="p-6 text-center text-gray-400">Loading problem and authentication...</div>;
  }

  if (pageError && !problem) {
    return <div className="p-6 text-red-500 text-center">{pageError}</div>;
  }
  if (!problem) {
    return <div className="p-6 text-center text-gray-400">Problem not found.</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-full dark:bg-gray-900 dark:text-gray-100 min-h-screen relative">
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${showAIModal ? 'blur-md pointer-events-none filter brightness-50' : ''}`}>
        {/* … left side (description) unchanged … */}

        {/* Code Editor and Submission Side */}
        <div>
          <div className="mb-3">
            <label htmlFor="language-select" className="block text-xs font-medium text-gray-300 mb-1">Language:</label>
            <select
              id="language-select"
              value={language}
              onChange={handleLanguageChange}
              disabled={isProcessing || isRequestingAIHelp}
              className="block w-full sm:w-1/2 p-2 text-xs border border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-gray-700 text-white"
            >
              {supportedLanguages.map(lang => (
                <option key={lang.value} value={lang.value}>{lang.label}</option>
              ))}
            </select>
          </div>

          <div className="mb-4 h-[55vh] md:h-[calc(100vh-420px)] min-h-[250px] border border-gray-700 rounded-md overflow-hidden">
            <Editor
              height="100%"
              language={language.toLowerCase()}
              value={code}
              onChange={(val) => setCode(val || "")}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: "on",
                readOnly: isProcessing || isRequestingAIHelp
              }}
            />
          </div>


        </div>
      </div>


    </div>
  );
}
