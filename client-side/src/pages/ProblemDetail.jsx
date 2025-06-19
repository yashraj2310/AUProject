import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import Editor from "@monaco-editor/react";
import { problemService } from "../services/Problem.service";
import { submissionService } from "../services/Submission.service";
import { Button, Loader } from "../components/component";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
    faListCheck, faClock, faTag, faBrain
} from '@fortawesome/free-solid-svg-icons';
import AIFeedbackModal from "../components/AIFeedbackModal";
import Microlesson from "../components/Microlesson";

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
const getResultStyle = status => {
  let key = status;
  if (status?.startsWith("Running Test Case")) key = "Running";
  return `${resultStyles.base} ${resultStyles[key] || resultStyles["Internal System Error"]}`;
};
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
  const contestId = cidParam
    || location.state?.contestId
    || new URLSearchParams(location.search).get("contestId")
    || null;

  const { status: isAuthenticated, loadingAuth } = useSelector(s => s.auth);

  const problemIdToUse = id || problemId;
  const [problem, setProblem] = useState(null);
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("cpp");
  const [currentSubmission, setCurrentSubmission] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pageError, setPageError] = useState("");
  const [loadingProblem, setLoadingProblem] = useState(true);
  const [customInput, setCustomInput] = useState("");
  // AI Help state
  const [aiFeedback, setAiFeedback] = useState("");
  const [isRequestingAIHelp, setIsRequestingAIHelp] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);

  const pollRef = useRef(null);
  const supportedLanguages = [
    { value: "cpp", label: "C++ (GCC)" },
    { value: "java", label: "Java" },
    { value: "python", label: "Python 3" },
    { value: "javascript", label: "JavaScript (Node.js)" },
  ];

  // Cleanup polling on unmount
  useEffect(() => () => clearInterval(pollRef.current), []);

  // Load problem and reset editor
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
        setAiFeedback("");
        setShowAIModal(false);
        setIsProcessing(false);
        setIsRequestingAIHelp(false);
        clearInterval(pollRef.current);

        const resp = await problemService.get(problemIdToUse);
        if (resp.data.success) {
          const p = resp.data.data;
          setProblem(p);
          const defLang = p.defaultLanguage || "cpp";
          setLanguage(defLang);
          if (p.starterCode && typeof p.starterCode === "object") {
            setCode(p.starterCode[defLang] || `// Starter code for ${defLang} not found.\n`);
          } else {
            setCode(p.starterCode || `// Write your ${defLang} solution here.\n`);
          }
        } else {
          throw new Error(resp.data.message || "Failed to load problem");
        }
      } catch (e) {
        console.error("Error loading problem:", e);
        setPageError(e.response?.data?.message || e.message);
      } finally {
        setLoadingProblem(false);
      }
    })();
  }, [problemIdToUse]);

  // When language changes
  const onLangChange = e => {
    const nl = e.target.value;
    setLanguage(nl);
    if (problem?.starterCode && typeof problem.starterCode === "object") {
      setCode(problem.starterCode[nl] || `// Starter code for ${nl} not available.\n`);
    } else {
      setCode(`// Write your ${nl} solution here.\n`);
    }
  };

  // Polling for results
  const pollForResult = useCallback(subId => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await submissionService.getSubmissionResult(subId);
        if (r.success && r.data?.verdict) {
          setCurrentSubmission(r.data);
          const finals = [
            "Accepted","Wrong Answer","Time Limit Exceeded","Memory Limit Exceeded",
            "Compilation Error","Runtime Error","Internal System Error","Partial - Sample Run",
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
  const handleExecuteCode = async type => {
    if (loadingAuth) { alert("Auth still loading"); return; }
    if (!isAuthenticated) { navigate("/login", { state: { from: location }}); return; }
    if (!code.trim()) { alert("Code cannot be empty."); return; }

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

  // AI Help
  const handleAIHelpMe = async () => {
    if (loadingAuth) { alert("Auth still loading"); return; }
    if (!isAuthenticated) { navigate("/login", { state: { from: location }}); return; }
    if (!code.trim()) { alert("Please write some code first."); return; }

    setIsRequestingAIHelp(true);
    setAiFeedback("");
    setShowAIModal(true);
    try {
      const payload = { code, problemId: problemIdToUse, language };
      const response = await submissionService.requestAIHelp(payload);
      if (response.success && response.data?.suggestions) {
        setAiFeedback(response.data.suggestions);
      } else {
        setAiFeedback(response.message || "No AI feedback available.");
      }
    } catch (e) {
      console.error(e);
      setAiFeedback(e.response?.data?.message || "Error requesting AI help.");
    } finally {
      setIsRequestingAIHelp(false);
    }
  };

  if (loadingAuth || loadingProblem) {
    return (
      <div className="flex justify-center items-center min-h-screen dark:bg-gray-900">
        <Loader />
      </div>
    );
  }
  if (pageError && !problem) {
    return <div className="p-6 text-red-500 text-center">{pageError}</div>;
  }
  if (!problem) {
    return <div className="p-6 text-center text-gray-400">Problem not found.</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-full dark:bg-gray-900 dark:text-gray-100 min-h-screen relative">
      <AIFeedbackModal
        show={showAIModal}
        isLoading={isRequestingAIHelp}
        feedback={aiFeedback}
        onClose={() => setShowAIModal(false)}
      />
      
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 transition-all duration-300 ${showAIModal ? 'blur-md filter brightness-50 pointer-events-none' : ''}`}>
        {/* ——— Left: Description ——— */}
        <div className="prose dark:prose-invert max-w-none md:pr-4 lg:overflow-y-auto lg:max-h-[calc(100vh-100px)] custom-scrollbar">
          <h1 className="text-2xl md:text-3xl font-bold mb-3">{problem.title}</h1>
          <div className="flex items-center gap-x-3 text-sm mb-3">
            <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${getDifficultyColor(problem.difficulty)} capitalize`}>
              {problem.difficulty}
            </span>
            <span><FontAwesomeIcon icon={faClock} /> {problem.cpuTimeLimit}s</span>
            <span><FontAwesomeIcon icon={faListCheck} /> {problem.memoryLimit/1024}MB</span>
          </div>
          <h3 className="text-xl font-semibold mt-6 mb-2 border-b pb-1.5 dark:border-gray-700">Description</h3>
          <div dangerouslySetInnerHTML={{ __html: problem.description }} className="text-sm leading-relaxed"/>

          {problem.tags?.length > 0 && (
            <div className="mt-6">
              <h4 className="text-md font-semibold mb-2 flex items-center">
                <FontAwesomeIcon icon={faTag} className="mr-2 text-gray-400" /> Tags
              </h4>
              <div className="flex flex-wrap gap-2">
                {problem.tags.map(tag => (
                  <span key={tag} className="px-2.5 py-1 text-xs bg-gray-700 text-gray-300 rounded-full">{tag}</span>
                ))}
              </div>
            </div>
          )}

          {problem.testCases?.filter(tc => tc.isSample).length > 0 && (
            <>
              <h3 className="text-xl font-semibold mt-8 mb-3 border-b pb-1.5 dark:border-gray-700">Sample Cases</h3>
              {problem.testCases.filter(tc => tc.isSample).map((tc,i) => (
                <div key={i} className="my-4 p-4 border rounded dark:border-gray-700 bg-gray-800/50 text-xs">
                  <p className="font-medium text-gray-300 mb-1">Sample Input {i+1}:</p>
                  <pre className="bg-gray-900/70 p-2.5 rounded mt-1 mb-2 whitespace-pre-wrap text-gray-200">{tc.input}</pre>
                  <p className="font-medium text-gray-300 mb-1 mt-3">Sample Output {i+1}:</p>
                  <pre className="bg-gray-900/70 p-2.5 rounded mt-1 whitespace-pre-wrap text-gray-200">{tc.expectedOutput}</pre>
                </div>
              ))}
            </>
          )}
            <Microlesson problemId={problemIdToUse} />
        </div>

        {/* ——— Right: Editor & Controls ——— */}
        <div className="flex flex-col lg:max-h-[calc(100vh-100px)]">
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-300 mb-1">Language:</label>
            <select
              value={language}
              onChange={onLangChange}
              disabled={isProcessing || isRequestingAIHelp}
              className="block w-full sm:w-1/2 p-2.5 text-sm border border-gray-600 rounded-md bg-gray-700 text-white"
            >
              {supportedLanguages.map(l => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>

          <div className="flex-grow mb-4 border border-gray-700 rounded-md overflow-hidden min-h-[300px]">
            <Editor
              height="100%"
              language={language}
              theme="vs-dark"
              value={code}
              onChange={v => setCode(v || "")}
              options={{
                minimap: { enabled: true, scale: 0.8 },
                fontSize: 14,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: "on",
                readOnly: isProcessing || isRequestingAIHelp,
                padding: { top: 10, bottom: 10 },
                mouseWheelZoom: true,
              }}
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-1">Custom Input (for Run Code)</label>
            <textarea
              rows={3}
              placeholder="Enter custom input here..."
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              disabled={isProcessing || isRequestingAIHelp}
              className="w-full p-2.5 bg-gray-800 border border-gray-600 rounded text-sm text-white placeholder-gray-500"
            />
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <Button
              onClick={() => handleExecuteCode('run')}
              disabled={isProcessing || isRequestingAIHelp}
              content={isProcessing && currentSubmission?.submissionType==='run' ? "Running..." : "Run Code"}
              className="bg-gray-600 hover:bg-gray-500"
            />
            <Button
              onClick={() => handleExecuteCode('submit')}
              disabled={isProcessing || isRequestingAIHelp}
              content={isProcessing && currentSubmission?.submissionType==='submit' ? "Submitting..." : "Submit Code"}
            />
            <Button
              onClick={handleAIHelpMe}
              disabled={isProcessing || isRequestingAIHelp}
              content={isRequestingAIHelp ? "Thinking..." : "Get AI Help"}
              className="bg-teal-600 hover:bg-teal-700"
              icon={<FontAwesomeIcon icon={faBrain} className="mr-2"/>}
            />
          </div>

          {currentSubmission && (
            <div className="mt-4 p-4 border rounded-md dark:border-gray-700 bg-gray-800 overflow-y-auto custom-scrollbar max-h-[calc(100vh-600px)]">
              <h3 className="text-lg font-semibold mb-2">
                Submission Status: <span className={getResultStyle(currentSubmission.verdict)}>{currentSubmission.verdict}</span>
              </h3>
              {currentSubmission.compileOutput && (
                <div className="mb-2">
                  <p className="font-medium text-sm">Compiler Output:</p>
                  <pre className="bg-gray-700/50 p-2.5 rounded text-xs max-h-40 overflow-y-auto custom-scrollbar">
                    {currentSubmission.compileOutput}
                  </pre>
                </div>
              )}
              {currentSubmission.stderr && currentSubmission.verdict !== 'Wrong Answer' && (
                <div className="mb-2">
                  <p className="font-medium text-sm">Error Details:</p>
                  <pre className="bg-red-800/30 p-2.5 rounded text-xs max-h-40 overflow-y-auto custom-scrollbar">
                    {currentSubmission.stderr}
                  </pre>
                </div>
              )}

              {currentSubmission.testCaseResults?.map((tc, i) => {
                if (tc.isCustom) {
                  return (
                    <div key={`custom-${i}`} className={getResultStyle(tc.status)}>
                      <p className="font-medium text-xs">Custom Run:</p>
                      <p className="text-xs">Status: {tc.status}</p>
                      {tc.time!=null && tc.memory!=null && (
                        <p className="text-xs">
                          (Time: {tc.time.toFixed(3)}s, Memory: {(tc.memory/1024).toFixed(2)}MB)
                        </p>
                      )}
                      <p className="font-medium text-xs mt-2">Your Input:</p>
                      <pre className="bg-gray-600 p-2 rounded mb-2 text-xs">{tc.input}</pre>
                      <p className="font-medium text-xs">Your Output:</p>
                      <pre className="bg-gray-600 p-2 rounded text-xs">{tc.actualOutput}</pre>
                    </div>
                  );
                }
                return (
                  <div key={`tc-${i}`} className={`${getResultStyle(tc.status)} mb-1`}>
                    <p className="text-xs">
                      Test Case {i+1} ({tc.isSample?"Sample":"Hidden"}): {tc.status}
                      {tc.time!=null && tc.memory!=null &&
                        ` (Time: ${tc.time.toFixed(3)}s, Memory: ${(tc.memory/1024).toFixed(2)}MB)`
                      }
                    </p>
                    {tc.isSample && tc.status==="Wrong Answer" && (
                      <div className="mt-1 text-xs">
                        <p>Input: <pre className="inline-block truncate bg-gray-600 p-1 rounded">{tc.input}</pre></p>
                        <p>Expected: <pre className="inline-block truncate bg-gray-600 p-1 rounded">{tc.expectedOutput}</pre></p>
                        <p>Got: <pre className="inline-block truncate bg-gray-600 p-1 rounded">{tc.actualOutput}</pre></p>
                      </div>
                    )}
                  </div>
                );
              })}

              {(currentSubmission.executionTime!==undefined || currentSubmission.memoryUsed!==undefined) && (
                <p className="text-sm mt-2">
                  Overall – Max Time: {currentSubmission.executionTime?.toFixed(3)}s, 
                  Max Memory: {(currentSubmission.memoryUsed/1024).toFixed(2)}MB
                </p>
              )}

              {currentSubmission.verdict==="Accepted" && currentSubmission.submissionType==="submit" && (
                <div className="mt-3 text-xs">
                  {currentSubmission.estimatedTimeComplexity && (
                    <p>Estimated Time Complexity: <span className="font-semibold">{currentSubmission.estimatedTimeComplexity}</span></p>
                  )}
                  {currentSubmission.estimatedSpaceComplexity && (
                    <p>Estimated Space Complexity: <span className="font-semibold">{currentSubmission.estimatedSpaceComplexity}</span></p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}