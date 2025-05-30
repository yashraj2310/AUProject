// src/pages/ProblemDetail.jsx
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import Editor from "@monaco-editor/react";
import { problemService } from "../services/Problem.service";
import { submissionService } from "../services/Submission.service";
import { Button, Loader } from "../components/component";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faListCheck,
  faClock,
  faHourglassEnd,
  faHourglassStart,
  faHourglassHalf,
  faCalendarAlt,
  faTag,
  faExclamationCircle,
  faMagicWandSparkles,
} from "@fortawesome/free-solid-svg-icons";

const resultStyles = {
  base: "p-2 my-1 rounded text-sm",
  Accepted: "bg-green-100 dark:bg-green-800 text-green-700 dark:text-gray-100",
  "Partial - Sample Run":
    "bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-gray-200",
  "Wrong Answer": "bg-red-100 dark:bg-red-800 text-red-700 dark:text-gray-200",
  "Time Limit Exceeded":
    "bg-yellow-100 dark:bg-yellow-800 text-yellow-700 dark:text-gray-200",
  "Memory Limit Exceeded":
    "bg-yellow-100 dark:bg-yellow-800 text-yellow-700 dark:text-gray-200",
  "Compilation Error":
    "bg-orange-100 dark:bg-orange-800 text-orange-700 dark:text-gray-200",
  "Runtime Error": "bg-red-100 dark:bg-red-800 text-red-700 dark:text-gray-200",
  "Internal System Error":
    "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100",
  Skipped: "bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300",
  Queued: "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100",
  Compiling:
    "bg-indigo-100 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-200",
  Running:
    "bg-indigo-100 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-200",
  "DOCKER RUNTIME ERROR":
    "bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-gray-200",
  DOCKER_SPAWN_ERROR:
    "bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-gray-200",
  UNKNOWN_SCRIPT_OUTPUT:
    "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100",
};

const getResultStyle = (status) => {
  let key = status;
  if (status?.startsWith("Running Test Case")) key = "Running";
  return `${resultStyles.base} ${
    resultStyles[key] || resultStyles["Internal System Error"]
  }`;
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

export default function ProblemDetail() {
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    status: isAuthenticated,
    userData: user,
    loadingAuth,
  } = useSelector((s) => s.auth);

  // support both /problems/:id and /contests/:contestId/problems/:problemId
  const standaloneId = params.id;
  const nestedId = params.problemId;
  const problemId = nestedId ?? standaloneId;
  const contestId =
    params.contestId ??
    location.state?.contestId ??
    new URLSearchParams(location.search).get("contestId") ??
    null;

  const [problem, setProblem] = useState(null);
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("cpp");
  const [currentSubmission, setCurrentSubmission] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pageError, setPageError] = useState("");
  const [loadingProblem, setLoadingProblem] = useState(true);
  const [aiFeedback, setAiFeedback] = useState("");
  const [isRequestingAIHelp, setIsRequestingAIHelp] = useState(false);
  const pollIntervalRef = useRef(null);
  const [customInput, setCustomInput] = useState("");

  // clear polling on unmount
  useEffect(() => {
    return () => clearInterval(pollIntervalRef.current);
  }, []);

  // fetch problem details
  useEffect(() => {
    (async () => {
      try {
        setLoadingProblem(true);
        setPageError("");
        setCurrentSubmission(null);
        setAiFeedback("");
        setIsProcessing(false);
        setIsRequestingAIHelp(false);
        clearInterval(pollIntervalRef.current);

        const res = await problemService.get(problemId);
        if (!res.data.success) {
          throw new Error(res.data.message || "Failed to load problem");
        }
        const p = res.data.data;
        setProblem(p);
        setLanguage(p.defaultLanguage || "cpp");
        setCode(
          p.starterCode ||
            `// Start your ${p.defaultLanguage || "cpp"} code here\n`
        );
      } catch (err) {
        console.error("Error loading problem:", err);
        setPageError(
          err.response?.data?.message || err.message || "Failed to load problem"
        );
      } finally {
        setLoadingProblem(false);
      }
    })();
  }, [problemId]);

  // poll submission result
  const pollForResult = useCallback((submissionId) => {
    clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const apiResponse = await submissionService.getSubmissionResult(
          submissionId
        );
        if (apiResponse.success && apiResponse.data) {
          const sub = apiResponse.data;
          setCurrentSubmission(sub);
          const finals = [
            "Accepted",
            "Wrong Answer",
            "Time Limit Exceeded",
            "Memory Limit Exceeded",
            "Compilation Error",
            "Runtime Error",
            "Internal System Error",
            "Partial - Sample Run",
            "DOCKER RUNTIME ERROR",
            "DOCKER_SPAWN_ERROR",
            "UNKNOWN_SCRIPT_OUTPUT",
          ];
          if (finals.includes(sub.verdict)) {
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

  // run or submit code
  const handleExecuteCode = async (submissionType) => {
    if (loadingAuth) {
      alert("Authentication is still loading. Please wait.");
      return;
    }
    if (!isAuthenticated) {
      navigate("/login", { state: { from: location } });
      return;
    }
    if (!code.trim()) {
      alert("Code cannot be empty.");
      return;
    }

    setIsProcessing(true);
    setCurrentSubmission({
      verdict: "Queued...",
      testCaseResults: [],
      submissionType,
    });
    clearInterval(pollIntervalRef.current);

    const payload = { problemId, code, language, submissionType };
    if (submissionType === "run" && customInput.trim()) {
      payload.customInput = customInput;
    }
    if (contestId) payload.contestId = contestId;
    console.log("Submitting payload:", payload);

    try {
      const apiResponse = await submissionService.executeCode(payload);
      if (!apiResponse.success || !apiResponse.data?._id) {
        throw new Error(
          apiResponse.message || "Submission initialization failed"
        );
      }
      setCurrentSubmission(apiResponse.data);
      pollForResult(apiResponse.data._id);
    } catch (err) {
      console.error(`Error during ${submissionType}:`, err);
      setCurrentSubmission((prev) => ({
        ...prev,
        verdict: "Error",
        compileOutput: err.response?.data?.message || err.message,
        stderr: err.response?.data?.message || err.message,
      }));
      setIsProcessing(false);
    }
  };

  // AI help
  const handleAIHelpMe = async () => {
    if (loadingAuth) {
      alert("Authentication is still loading. Please wait.");
      return;
    }
    if (!isAuthenticated) {
      navigate("/login", { state: { from: location } });
      return;
    }
    if (!code.trim()) {
      alert("Please write some code first.");
      return;
    }
    setIsRequestingAIHelp(true);
    setAiFeedback("");
    try {
      const payload = { code, problemId, language };
      const resp = await submissionService.requestAIHelp(payload);
      setAiFeedback(
        resp.data?.suggestions || resp.message || "No suggestions available."
      );
    } catch (err) {
      console.error("AI help error:", err);
      setAiFeedback(err.response?.data?.message || err.message);
    } finally {
      setIsRequestingAIHelp(false);
    }
  };

  // render states
  if (loadingAuth || loadingProblem) {
    return (
      <div className="p-6 text-center text-gray-400">
        Loading problem and authentication...
      </div>
    );
  }
  if (pageError && !problem) {
    return <div className="p-6 text-red-500 text-center">{pageError}</div>;
  }
  if (!problem) {
    return (
      <div className="p-6 text-center text-gray-400">Problem not found.</div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-full dark:bg-gray-900 dark:text-gray-100 min-h-screen">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Problem Description */}
        <div className="prose dark:prose-invert max-w-none mb-8 md:overflow-y-auto md:max-h-[calc(100vh-120px)] md:pr-4">
          <h1 className="text-2xl md:text-3xl font-bold mb-3">
            {problem.title}
          </h1>
          <p className="text-sm mb-1">
            <strong>Difficulty:</strong>{" "}
            <span
              className={`px-2 py-0.5 rounded text-xs font-semibold ${getDifficultyColor(
                problem.difficulty
              )} capitalize`}
            >
              {problem.difficulty}
            </span>
          </p>
          <p className="text-sm mb-3">
            <strong>Time Limit:</strong> {problem.cpuTimeLimit}s,{" "}
            <strong>Memory Limit:</strong> {problem.memoryLimit / 1024}MB
          </p>
          <h3 className="text-lg font-semibold mt-4 mb-2 border-b pb-1 dark:border-gray-700">
            Description
          </h3>
          <div
            className="text-sm"
            dangerouslySetInnerHTML={{ __html: problem.description }}
          />
          {problem.testCases?.filter((tc) => tc.isSample).length > 0 && (
            <>
              <h3 className="text-lg font-semibold mt-6 mb-2 border-b pb-1 dark:border-gray-700">
                Sample Cases
              </h3>
              {problem.testCases
                .filter((tc) => tc.isSample)
                .map((tc, i) => (
                  <div
                    key={i}
                    className="my-3 p-3 border rounded dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs"
                  >
                    <p className="font-medium">Sample Input {i + 1}:</p>
                    <pre className="bg-gray-100 dark:bg-gray-700 p-2 rounded mt-1 mb-2 whitespace-pre-wrap">
                      {tc.input}
                    </pre>
                    <p className="font-medium">Sample Output {i + 1}:</p>
                    <pre className="bg-gray-100 dark:bg-gray-700 p-2 rounded mt-1 whitespace-pre-wrap">
                      {tc.expectedOutput}
                    </pre>
                  </div>
                ))}
            </>
          )}
        </div>

        {/* Editor & Controls */}
        <div>
          <div className="mb-3">
            <label
              htmlFor="language-select"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Language:
            </label>
            <select
              id="language-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={isProcessing || isRequestingAIHelp}
              className="block w-full sm:w-1/2 p-2 text-xs border border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-gray-700 text-white"
            >
              {[
                { value: "cpp", label: "C++ (GCC)" },
                { value: "java", label: "Java" },
                { value: "python", label: "Python 3" },
                { value: "javascript", label: "JavaScript (Node.js)" },
              ].map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4 h-[55vh] md:h-[calc(100vh-420px)] min-h-[250px] border border-gray-700 rounded-md overflow-hidden">
            <Editor
              height="100%"
              language={language}
              value={code}
              onChange={(v) => setCode(v || "")}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: "on",
                readOnly: isProcessing || isRequestingAIHelp,
              }}
            />
          </div>

          {/* Custom Input */}
          <div className="mb-4">
            <label
              htmlFor="custom-input"
              className="block text-xs font-medium text-gray-300 mb-1"
            >
              Custom Input (optional)
            </label>
            <textarea
              id="custom-input"
              rows={4}
              className="w-full p-2 bg-gray-800 border border-gray-600 rounded text-sm text-white"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="Enter any input you'd like to test here"
            />
          </div>

          <div className="flex items-center gap-3 mb-2">
            <Button
              onClick={() => handleExecuteCode("run")}
              disabled={
                isProcessing || isRequestingAIHelp || loadingProblem || !problem
              }
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none disabled:opacity-60"
              content={
                isProcessing && currentSubmission?.submissionType === "run"
                  ? "Running..."
                  : "Run Code"
              }
            />
            <Button
              onClick={() => handleExecuteCode("submit")}
              disabled={
                isProcessing || isRequestingAIHelp || loadingProblem || !problem
              }
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none disabled:opacity-60"
              content={
                isProcessing && currentSubmission?.submissionType === "submit"
                  ? "Submitting..."
                  : "Submit Code"
              }
            />
          </div>

          {/* AI Help */}
          <div className="my-4">
            <Button
              onClick={handleAIHelpMe}
              disabled={
                isProcessing || isRequestingAIHelp || !problem || !code.trim()
              }
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
              <h4 className="text-md font-semibold mb-2 text-purple-300">
                AI Suggestions:
              </h4>
              <pre className="text-sm text-gray-200 whitespace-pre-wrap font-sans">
                {aiFeedback}
              </pre>
            </div>
          )}

          {/* Submission Results */}
          {currentSubmission && (
            <div className="mt-4 p-3 border rounded-md dark:border-gray-700 bg-gray-800 max-h-[calc(100vh-500px)] min-h-[100px] overflow-y-auto">
              <h3 className="text-md font-semibold mb-2">
                Submission Status:{" "}
                <span
                  className={`font-bold ${getResultStyle(
                    currentSubmission.verdict
                  )
                    .split(" ")
                    .slice(1)
                    .join(" ")}`}
                >
                  {currentSubmission.verdict}
                </span>
              </h3>

              {currentSubmission.compileOutput && (
                <div className="mb-2">
                  <p className="font-medium text-xs">Compiler Output:</p>
                  <pre className="bg-gray-700 p-2 rounded text-xs max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {currentSubmission.compileOutput}
                  </pre>
                </div>
              )}

              {currentSubmission.stderr &&
                currentSubmission.verdict !== "Wrong Answer" && (
                  <div className="mb-2">
                    <p className="font-medium text-xs">Error Details:</p>
                    <pre className="bg-red-700/30 p-2 rounded text-xs max-h-32 overflow-y-auto whitespace-pre-wrap">
                      {currentSubmission.stderr}
                    </pre>
                  </div>
                )}

              {currentSubmission.testCaseResults?.map((tcResult, idx) =>
               {
                 // custom run case
                if (tcResult.isCustom) {
                  return (
                    <div key={idx} className={getResultStyle(tcResult.status)}>
                      <p className="font-medium text-xs">Custom Input:</p>
                      <pre className="bg-gray-600 p-2 rounded mb-2 whitespace-pre-wrap">{tcResult.input}</pre>
                      <p className="font-medium text-xs">Output:</p>
                      <pre className="bg-gray-600 p-2 rounded whitespace-pre-wrap">{tcResult.actualOutput}</pre>
                    </div>
                  );
                }
                return (
                <div key={idx} className={getResultStyle(tcResult.status)}>
                  Test Case {idx + 1} ({tcResult.isSample ? "Sample" : "Hidden"}
                  ): {tcResult.status}
                  {tcResult.time != null &&
                    tcResult.memory != null &&
                    ` (Time: ${tcResult.time.toFixed(3)}s, Memory: ${(
                      tcResult.memory / 1024
                    ).toFixed(2)}MB)`}
                  {tcResult.isSample && tcResult.status === "Wrong Answer" && (
                    <div className="mt-1 text-xs">
                      <p className="truncate">
                        Input:{" "}
                        <pre className="bg-gray-600 p-1 inline-block rounded">
                          {tcResult.input?.slice(0, 50)}
                          {tcResult.input?.length > 50 ? "..." : ""}
                        </pre>
                      </p>
                      <p className="truncate">
                        Expected:{" "}
                        <pre className="bg-gray-600 p-1 inline-block rounded">
                          {tcResult.expectedOutput?.slice(0, 50)}
                          {tcResult.expectedOutput?.length > 50 ? "..." : ""}
                        </pre>
                      </p>
                      <p className="truncate">
                        Got:{" "}
                        <pre className="bg-gray-600 p-1 inline-block rounded">
                          {tcResult.actualOutput?.slice(0, 50)}
                          {tcResult.actualOutput?.length > 50 ? "..." : ""}
                        </pre>
                      </p>
                    </div>
                  )}
                </div>
                );
              })}

              {currentSubmission.executionTime != null &&
                currentSubmission.memoryUsed != null &&
                ![
                  "Compilation Error",
                  "Queued",
                  "Internal System Error",
                ].includes(currentSubmission.verdict) && (
                  <p className="text-xs mt-2">
                    Overall - Max Time:{" "}
                    {currentSubmission.executionTime.toFixed(3)}s, Max Memory:{" "}
                    {(currentSubmission.memoryUsed / 1024).toFixed(2)}MB
                  </p>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
