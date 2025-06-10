#!/bin/bash

# Arguments from the worker
TIME_LIMIT_SECONDS=$1
MEMORY_LIMIT_KB=$2
SOURCE_FILE_BASENAME=$3 # e.g., "script.js"

# --- Setup ---
SANDBOX_DIR="/sandbox"
INPUT_FILE="${SANDBOX_DIR}/input.txt"
SEPARATOR="---|||---"

# Work directly in the sandbox
cd "$SANDBOX_DIR"

# --- Execution ---
USER_STDOUT_FILE="user_stdout.txt"
USER_STDERR_FILE="user_stderr.txt"
STATS_FILE="stats.txt"

# Node.js memory is best controlled with --max-old-space-size.
# We also use ulimit as a hard-stop safety measure.
MEMORY_LIMIT_MB=$((MEMORY_LIMIT_KB / 1024))

(
  ulimit -v "${MEMORY_LIMIT_KB}";
  /usr/bin/time -f "%e %M" -o "${STATS_FILE}" \
  timeout -s KILL "${TIME_LIMIT_SECONDS}s" \
  node --max-old-space-size="${MEMORY_LIMIT_MB}" "${SOURCE_FILE_BASENAME}" < "${INPUT_FILE}" > "${USER_STDOUT_FILE}" 2> "${USER_STDERR_FILE}"
)
EXECUTION_EXIT_CODE=$?

# --- 3. Result Processing ---
EXEC_TIME_SECONDS="0.00"
PEAK_MEMORY_KB="0"

# Safely read the stats file
if [ -f "$STATS_FILE" ]; then
    read -r EXEC_TIME_SECONDS PEAK_MEMORY_KB < "$STATS_FILE"
    EXEC_TIME_SECONDS=${EXEC_TIME_SECONDS:-0}
    PEAK_MEMORY_KB=${PEAK_MEMORY_KB:-0}
fi

STATUS=""
FINAL_OUTPUT=""

# Determine the final status (identical logic to the other scripts)
if [ "$EXECUTION_EXIT_CODE" -eq 137 ] || [ "$EXECUTION_EXIT_CODE" -eq 124 ]; then
    STATUS="TIME_LIMIT_EXCEEDED"
    FINAL_OUTPUT=$(cat "$USER_STDERR_FILE")
    EXEC_TIME_SECONDS=$TIME_LIMIT_SECONDS
elif [ "$PEAK_MEMORY_KB" -gt "$MEMORY_LIMIT_KB" ]; then
    STATUS="MEMORY_LIMIT_EXCEEDED"
    FINAL_OUTPUT=$(cat "$USER_STDERR_FILE")
elif [ "$EXECUTION_EXIT_CODE" -ne 0 ]; then
    STATUS="RUNTIME_ERROR"
    FINAL_OUTPUT=$(cat "$USER_STDERR_FILE")
else
    STATUS="EXECUTED_SUCCESSFULLY"
    FINAL_OUTPUT=$(cat "$USER_STDOUT_FILE")
fi

# Print the final standardized output for the worker
echo "${STATUS}"
echo "${EXEC_TIME_SECONDS}"
echo "${PEAK_MEMORY_KB}"
echo "${SEPARATOR}"
echo -n "${FINAL_OUTPUT}"

exit 0