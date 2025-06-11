#!/bin/bash

# Arguments from the worker
TIME_LIMIT_SECONDS=$1
MEMORY_LIMIT_KB=$2
SOURCE_FILE_BASENAME=$3  # e.g., "Main.cpp"

# --- Setup ---
SANDBOX_DIR="/sandbox"
SEPARATOR="---|||---"

# Create a temporary directory to avoid permission issues
RUN_DIR=$(mktemp -d)
# Ensure we clean it up on exit
trap 'rm -rf "$RUN_DIR"' EXIT

cd "$RUN_DIR"
echo "--- mounted /sandbox contents ---" >&2
ls -la "${SANDBOX_DIR}" >&2
# Copy source file
cp "${SANDBOX_DIR}/${SOURCE_FILE_BASENAME}" .

# Copy or stub out input.txt so "< input.txt" never fails
if [ -f "${SANDBOX_DIR}/input.txt" ]; then
  cp "${SANDBOX_DIR}/input.txt" input.txt
else
  touch input.txt
fi

# --- 1. Compilation ---
COMPILER_OUTPUT_FILE="compiler_errors.txt"
COMPILED_EXECUTABLE="compiled_app"

g++ -O2 -std=c++17 -Wall "${SOURCE_FILE_BASENAME}" -o "${COMPILED_EXECUTABLE}" 2> "${COMPILER_OUTPUT_FILE}"
COMPILATION_EXIT_CODE=$?

if [ $COMPILATION_EXIT_CODE -ne 0 ]; then
  echo "COMPILATION_ERROR"
  echo "0.00"
  echo "0"
  echo "${SEPARATOR}"
  echo -n "$(cat "${COMPILER_OUTPUT_FILE}")"
  exit 0
fi

# --- 2. Execution ---
USER_STDOUT_FILE="user_stdout.txt"
USER_STDERR_FILE="user_stderr.txt"
STATS_FILE="stats.txt"

(
  # Enforce memory limit
  ulimit -v "${MEMORY_LIMIT_KB}"
  # Time & run
  /usr/bin/time -f "%e %M" -o "${STATS_FILE}" \
    timeout -s KILL "${TIME_LIMIT_SECONDS}s" \
    "./${COMPILED_EXECUTABLE}" < input.txt \
      > "${USER_STDOUT_FILE}" 2> "${USER_STDERR_FILE}"
)
EXECUTION_EXIT_CODE=$?

# --- 3. Result Processing ---
EXEC_TIME_SECONDS="0.00"
PEAK_MEMORY_KB="0"

if [ -f "$STATS_FILE" ]; then
  read -r EXEC_TIME_SECONDS PEAK_MEMORY_KB < "$STATS_FILE"
  EXEC_TIME_SECONDS=${EXEC_TIME_SECONDS:-0}
  PEAK_MEMORY_KB=${PEAK_MEMORY_KB:-0}
fi

STATUS=""
FINAL_OUTPUT=""

if [ "$EXECUTION_EXIT_CODE" -eq 137 ] || [ "$EXECUTION_EXIT_CODE" -eq 124 ]; then
  STATUS="TIME_LIMIT_EXCEEDED"
  FINAL_OUTPUT=$(cat "$USER_STDERR_FILE" 2>/dev/null)
  EXEC_TIME_SECONDS=$TIME_LIMIT_SECONDS
elif [ "$PEAK_MEMORY_KB" -gt "$MEMORY_LIMIT_KB" ]; then
  STATUS="MEMORY_LIMIT_EXCEEDED"
  FINAL_OUTPUT=$(cat "$USER_STDERR_FILE" 2>/dev/null)
elif [ "$EXECUTION_EXIT_CODE" -ne 0 ]; then
  STATUS="RUNTIME_ERROR"
  FINAL_OUTPUT=$(cat "$USER_STDERR_FILE" 2>/dev/null)
else
  STATUS="EXECUTED_SUCCESSFULLY"
  FINAL_OUTPUT=$(cat "$USER_STDOUT_FILE" 2>/dev/null)
fi

# Output in the worker’s expected format
echo "${STATUS}"
echo "${EXEC_TIME_SECONDS}"
echo "${PEAK_MEMORY_KB}"
echo "${SEPARATOR}"
echo -n "${FINAL_OUTPUT}"

exit 0
