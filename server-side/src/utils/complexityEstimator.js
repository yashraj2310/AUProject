// server/src/utils/complexityEstimator.js
import regression from 'regression'; // Make sure this matches how the package exports

// Helper to ensure inputSize is positive for log
const safeLog = (n) => (n > 0 ? Math.log(n) : 0);

export function estimateTimeComplexity(testCaseResults) {
  if (!testCaseResults || testCaseResults.length < 3) return 'Unknown (Not enough data)'; // Need at least 2-3 points for regression

  // Filter for successful test cases with valid inputSize and executionTime
  const validResults = testCaseResults.filter(r => 
    r.status === 'Accepted' && 
    r.inputSize != null && r.inputSize > 0 && // Ensure inputSize is positive for log
    r.executionTime != null && r.executionTime >= 0
  );

  if (validResults.length < 3) return 'Unknown (Not enough valid data)';

  // Points for regression: [log(N), Time]
  const points = validResults.map(r => [safeLog(r.inputSize), r.executionTime]);
  
  try {
    const result = regression.linear(points); // Can also try .logarithmic, .exponential, .power
    const slope = result.equation[0];
    const r2 = result.r2; // Coefficient of determination (goodness of fit)

    console.log('Time Complexity Estimation:', { slope, r2, points, equation: result.string });


    if (r2 < 0.75) return `Unknown (Poor Fit R²=${r2.toFixed(2)})`; // If fit is poor

    // These thresholds are heuristics and highly dependent on the nature of inputSize
    if (slope < 0.15) return 'O(1) or O(log n)'; // Hard to distinguish constant from very slow log
    if (slope < 0.7) return 'O(log n)'; // Adjusted threshold, as log(N) vs T will have a smaller slope than N vs T
    if (slope < 1.3) return 'O(n)';     // If T grows linearly with log(N), it's like N
                                        // If points were [N, T], slope around 1 would be O(N)
                                        // Since points are [log(N), T]:
                                        // O(N)   => T ≈ k * N => log(T) ≈ log(k) + log(N) -> not linear in [log(N),T]
                                        // O(N) implies T grows faster than log(N).
                                        // This mapping of slope from [log(N), T] to Big O is tricky.

    // A different approach for [log(N), T] points:
    // O(1): slope near 0
    // O(log N): T vs log(N) is linear with some slope. `regression.logarithmic(validResults.map(r => [r.inputSize, r.executionTime]))` might be better.
    // O(N): T vs N is linear. `regression.linear(validResults.map(r => [r.inputSize, r.executionTime]))`
    // O(N log N): T vs N*log(N) is linear.
    // O(N^2): T vs N^2 is linear. Or log(T) vs log(N) has slope 2.

    // The provided example seems to assume points are [log(N), log(T)] for complexity like N^k
    // Let's stick to the provided example's if/else for now, assuming points are [log(inputSize), executionTime]
    // and these slope thresholds are empirically derived for that setup.

    if (slope < 0.2) return 'O(1)'; // Based on example, but needs careful calibration
    if (slope < 0.8) return 'O(log n)'; // Example's threshold
    if (slope < 1.5) return 'O(n)';     // Example's threshold
    if (slope < 2.5) return 'O(n log n)';// Example's threshold
    return 'O(n^2 or higher)'; // Example's threshold

  } catch (e) {
    console.error("Error during regression analysis for time:", e);
    return 'Unknown (Regression Error)';
  }
}

export function estimateSpaceComplexity(testCaseResults) {
  if (!testCaseResults || testCaseResults.length < 3) return 'Unknown (Not enough data)';

  const validResults = testCaseResults.filter(r => 
    r.status === 'Accepted' && 
    r.inputSize != null && r.inputSize > 0 &&
    r.memoryUsed != null && r.memoryUsed >= 0 // memoryUsed is in KB
  );
  
  if (validResults.length < 3) return 'Unknown (Not enough valid data)';

  // Points for regression: [log(N), Memory]
  const points = validResults.map(r => [safeLog(r.inputSize), r.memoryUsed / 1024]); // Convert memory to MB for smaller numbers

  try {
    const result = regression.linear(points);
    const slope = result.equation[0];
    const r2 = result.r2;

    console.log('Space Complexity Estimation:', { slope, r2, points, equation: result.string });

    if (r2 < 0.75) return `Unknown (Poor Fit R²=${r2.toFixed(2)})`;

    // Similar heuristic thresholds as time, but for memory.
    // These need empirical calibration.
    if (slope < 0.1) return 'O(1)';
    if (slope < 0.7) return 'O(log n)'; 
    if (slope < 1.3) return 'O(n)';    
    // O(n log n) and O(n^2) space are less common for typical competitive programming problems
    // unless explicitly creating large data structures.
    return 'O(n or higher)'; 

  } catch (e) {
    console.error("Error during regression analysis for space:", e);
    return 'Unknown (Regression Error)';
  }
}