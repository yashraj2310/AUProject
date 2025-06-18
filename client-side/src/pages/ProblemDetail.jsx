import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import Editor from "@monaco-editor/react";
import { problemService } from "../services/Problem.service";
import { submissionService } from "../services/Submission.service";
import { Button } from "../components/component";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faListCheck, faClock, faHourglassEnd, faHourglassStart, 
  faHourglassHalf, faCalendarAlt, faTag, faExclamationCircle
} from '@fortawesome/free-solid-svg-icons';

// Styling for verdict badges
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
const getResultStyle = status => {
  let key = status;
  if (status?.startsWith("Running Test Case")) key = "Running";
  return `${resultStyles.base} ${resultStyles[key] || resultStyles["Internal System Error"]}`;
};

// Difficulty pill colors
const getDifficultyColor = diff => {
  switch (diff?.toLowerCase()) {
    case "easy":   return "text-green-400 border-green-500 bg-green-900/30";
    case "medium": return "text-yellow-400 border-yellow-500 bg-yellow-900/30";
    case "hard":   return "text-red-400 border-red-500 bg-red-900/30";
    default:       return "text-gray-400 border-gray-500 bg-gray-700/30";
  }
};

export default function ProblemDetail() {
  const { id, problemId, contestId: cidParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const contestId = cidParam || location.state?.contestId || new URLSearchParams(location.search).get("contestId") || null;

  const { status: isAuthenticated, loadingAuth } = useSelector(s => s.auth);

  const problemIdToUse = id || problemId;
  const [problem, setProblem] = useState(null);
  const [code, setCode]       = useState("");
  const [language, setLanguage] = useState("cpp");
  const [currentSubmission, setCurrentSubmission] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pageError, setPageError]       = useState("");
  const [loadingProblem, setLoadingProblem] = useState(true);
  const [customInput, setCustomInput]   = useState("");

  const pollRef = useRef(null);
  const supportedLanguages = [
    { value: "cpp", label: "C++ (GCC)" },
    { value: "java", label: "Java" },
    { value: "python", label: "Python 3" },
    { value: "javascript", label: "JavaScript (Node.js)" },
  ];

  // Cleanup polling on unmount
  useEffect(() => () => clearInterval(pollRef.current), []);

  // Load problem & reset editor
  useEffect(() => {
    if (!problemIdToUse) {
      setPageError("Problem ID not found in URL.");
      setLoadingProblem(false);
      return;
    }
    (async () => {
      try {
        setLoadingProblem(true);
        setPageError("");
        setCurrentSubmission(null);
        clearInterval(pollRef.current);

        const resp = await problemService.get(problemIdToUse);
        if (resp.data.success) {
          const p = resp.data.data;
          setProblem(p);
          const defLang = p.defaultLanguage || "cpp";
          setLanguage(defLang);
          setCode(`// Write your ${defLang} solution here`);
        } else {
          throw new Error(resp.data.message || "Failed to load problem");
        }
      } catch (e) {
        console.error(e);
        setPageError(e.response?.data?.message || e.message);
      } finally {
        setLoadingProblem(false);
      }
    })();
  }, [problemIdToUse]);

  // Change language handler
  const onLangChange = e => {
    const nl = e.target.value;
    setLanguage(nl);
    setCode(`// Write your ${nl} solution here`);
  };

  // Polling for verdict
  const pollForResult = useCallback(subId => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await submissionService.getSubmissionResult(subId);
        if (r.success && r.data?.verdict) {
          setCurrentSubmission(r.data);
          const finals = [
            "Accepted", "Wrong Answer", "Time Limit Exceeded", "Memory Limit Exceeded",
            "Compilation Error", "Runtime Error", "Internal System Error", "Partial - Sample Run",
            "DOCKER RUNTIME ERROR","DOCKER_SPAWN_ERROR","UNKNOWN_SCRIPT_OUTPUT","Custom Output"
          ];
          if (finals.includes(r.data.verdict)) {
            clearInterval(pollRef.current);
            setIsProcessing(false);
          }
        }
      } catch (e) {
        console.error("Polling error", e);
        clearInterval(pollRef.current);
        setIsProcessing(false);
      }
    }, 2500);
  }, []);

  // Run or Submit
  const handleExecute = async type => {
    if (loadingAuth) return alert("Auth loading…");
    if (!isAuthenticated) return navigate("/login", { state: { from: location }});
    if (!code.trim()) return alert("Code cannot be empty.");

    setIsProcessing(true);
    setCurrentSubmission({ verdict: "Queued...", testCaseResults: [], submissionType: type });
    clearInterval(pollRef.current);

    const payload = { problemId: problemIdToUse, code, language, submissionType: type };
    if (type === "run" && customInput.trim()) payload.customInput = customInput;
    if (contestId) payload.contestId = contestId;

    try {
      const resp = await submissionService.executeCode(payload);
      if (resp.success && resp.data._id) {
        setCurrentSubmission(resp.data);
        pollForResult(resp.data._id);
      } else {
        throw new Error(resp.message || "Submission failed");
      }
    } catch (e) {
      console.error(e);
      setCurrentSubmission(prev => ({
        ...prev,
        verdict: "Error",
        compileOutput: e.response?.data?.message || e.message
      }));
      setIsProcessing(false);
    }
  };

  if (loadingAuth || loadingProblem) {
    return <div className="p-6 text-center text-gray-400">Loading…</div>;
  }
  if (pageError && !problem) {
    return <div className="p-6 text-red-500 text-center">{pageError}</div>;
  }
  if (!problem) {
    return <div className="p-6 text-center text-gray-400">Problem not found.</div>;
  }

  return (
    <div className="p-4 md:p-6 dark:bg-gray-900 dark:text-gray-100 min-h-screen">
      <div className="grid md:grid-cols-2 gap-6">
        {/* ——— Left: Description & Samples ——— */}
        <div className="prose dark:prose-invert mb-8">
          <h1 className="text-2xl font-bold">{problem.title}</h1>
          <div className="flex items-center gap-4 mb-4">
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getDifficultyColor(problem.difficulty)}`}>
              {problem.difficulty}
            </span>
            <span className="text-sm">
              <FontAwesomeIcon icon={faClock} /> {problem.cpuTimeLimit}s &nbsp;
              <FontAwesomeIcon icon={faListCheck} /> {problem.memoryLimit/1024}MB
            </span>
          </div>

          <h2 className="text-lg font-semibold">Description</h2>
          <div dangerouslySetInnerHTML={{ __html: problem.description }} />

          {problem.testCases?.some(tc => tc.isSample) && (
            <>
              <h2 className="text-lg font-semibold mt-6">Sample Cases</h2>
              {problem.testCases.filter(tc => tc.isSample).map((tc,i) => (
                <div key={i} className="p-3 border rounded mb-4 bg-gray-50 dark:bg-gray-800">
                  <p className="font-medium">Input:</p>
                  <pre className="bg-gray-100 dark:bg-gray-700 p-2 rounded">{tc.input}</pre>
                  <p className="font-medium mt-2">Output:</p>
                  <pre className="bg-gray-100 dark:bg-gray-700 p-2 rounded">{tc.expectedOutput}</pre>
                </div>
              ))}
            </>
          )}
        </div>

        {/* ——— Right: Editor & Controls ——— */}
        <div>
          <label className="block text-xs font-medium mb-1">Language:</label>
          <select
            value={language}
            onChange={onLangChange}
            disabled={isProcessing}
            className="mb-4 w-full sm:w-1/2 p-2 bg-gray-700 text-white rounded"
          >
            {supportedLanguages.map(l => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>

          <div className="h-64 md:h-[50vh] border border-gray-700 rounded mb-4 overflow-hidden">
            <Editor
              height="100%"
              language={language}
              theme="vs-dark"
              value={code}
              onChange={v => setCode(v || "")}
              options={{
                minimap: { enabled: false },
                readOnly: isProcessing,
                automaticLayout: true,
                wordWrap: "on"
              }}
            />
          </div>

          <textarea
            rows={3}
            placeholder="Custom Input (for Run Code)"
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            disabled={isProcessing}
            className="w-full p-2 mb-4 bg-gray-800 text-white rounded"
          />

          <div className="flex gap-3 mb-4">
            <Button
              onClick={() => handleExecute("run")}
              disabled={isProcessing}
              content={isProcessing ? "Running…" : "Run Code"}
            />
            <Button
              onClick={() => handleExecute("submit")}
              disabled={isProcessing}
              content={isProcessing ? "Submitting…" : "Submit Code"}
            />
          </div>

          {currentSubmission && (
            <div className="p-3 border rounded bg-gray-800 overflow-auto">
              <h3 className="font-semibold mb-2">
                Status: <span className={getResultStyle(currentSubmission.verdict)}>{currentSubmission.verdict}</span>
              </h3>
              {currentSubmission.compileOutput && (
                <div className="mb-2">
                  <p className="font-medium text-xs">Compiler Output:</p>
                  <pre className="bg-gray-700 p-2 rounded text-xs whitespace-pre-wrap">{currentSubmission.compileOutput}</pre>
                </div>
              )}
              {currentSubmission.stderr && (
                <div className="mb-2">
                  <p className="font-medium text-xs">Error Details:</p>
                  <pre className="bg-red-900 p-2 rounded text-xs whitespace-pre-wrap">{currentSubmission.stderr}</pre>
                </div>
              )}
              {currentSubmission.testCaseResults?.map((tc, i) => (
                <div key={i} className={getResultStyle(tc.status)}>
                  <p className="text-xs">
                    Test {i+1} ({tc.isSample?"Sample":"Hidden"}): {tc.status}
                    {tc.time!=null && ` – ${tc.time.toFixed(3)}s, ${(tc.memory/1024).toFixed(2)}MB`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
