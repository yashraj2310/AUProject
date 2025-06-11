#!/bin/bash

# Arguments from the worker
TIME_LIMIT_SECONDS=$1
MEMORY_LIMIT_KB=$2
SOURCE_FILE_BASENAME=$3  # e.g. "Main.java"

# --- Setup ---
CLASS_NAME=$(basename "${SOURCE_FILE_BASENAME}" .java)  # strips “.java”
SANDBOX_DIR="/sandbox"
SEPARATOR="---|||---"

# 1) Create & prepare a private working dir
RUN_DIR=$(mktemp -d)
trap 'rm -rf "$RUN_DIR"' EXIT
chmod 755 "$RUN_DIR"

# 2) Copy source (fail early if missing)
cp "${SANDBOX_DIR}/${SOURCE_FILE_BASENAME}" "${RUN_DIR}/" \
  || {
    echo "COMPILATION_ERROR"
    echo "0.00"
    echo "0"
    echo "${SEPARATOR}"
    echo "Error: source file ${SOURCE_FILE_BASENAME} not found"
    exit 0
  }

# 3) Copy or stub input.txt
if [ -f "${SANDBOX_DIR}/input.txt" ]; then
  cp "${SANDBOX_DIR}/input.txt" "${RUN_DIR}/input.txt"
else
  touch "${RUN_DIR}/input.txt"
fi

# 4) Switch into the temp dir
cd "$RUN_DIR"

# --- 1. Compilation ---
COMPILER_OUTPUT_FILE="compiler_errors.txt"
javac "${SOURCE_FILE_BASENAME}" 2> "${COMPILER_OUTPUT_FILE}"
COMPILATION_EXIT_CODE=$?

if [ $COMPILATION_EXIT_CODE -ne 0 ]; then
  echo "COMPILATION_ERROR"
  echo "0.00"
  echo "0"
  echo "${SEPARATOR}"
  cat "${COMPILER_OUTPUT_FILE}"
  exit 0
fi

# --- 2. Execution ---
USER_STDOUT_FILE="user_stdout.txt"
USER_STDERR_FILE="user_stderr.txt"
STATS_FILE="stats.txt"

# Calculate limits
MEMORY_LIMIT_MB=$((MEMORY_LIMIT_KB / 1024))
# Add a little buffer for non-heap usage
ULIMIT_MEM=$((MEMORY_LIMIT_KB + 65536))

(
  ulimit -v "${ULIMIT_MEM}"
  /usr/bin/time -f "%e %M" -o "${STATS_FILE}" \
    timeout -s KILL "${TIME_LIMIT_SECONDS}s" \
    java -Xmx"${MEMORY_LIMIT_MB}"m "${CLASS_NAME}" \
      < input.txt > "${USER_STDOUT_FILE}" 2> "${USER_STDERR_FILE}"
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

if [ "$EXECUTION_EXIT_CODE" -eq 137 ] || [ "$EXECUTION_EXIT_CODE" -eq 124 ]; then
  STATUS="TIME_LIMIT_EXCEEDED"
  FINAL_OUTPUT=$(cat "$USER_STDERR_FILE" 2>/dev/null)
  EXEC_TIME_SECONDS=$TIME_LIMIT_SECONDS
elif [ "$PEAK_MEMORY_KB" -gt "$MEMORY_LIMIT_KB" ] \
  || grep -q "OutOfMemoryError" "$USER_STDERR_FILE"; then
  STATUS="MEMORY_LIMIT_EXCEEDED"
  FINAL_OUTPUT=$(cat "$USER_STDERR_FILE" 2>/dev/null)
elif [ "$EXECUTION_EXIT_CODE" -ne 0 ]; then
  STATUS="RUNTIME_ERROR"
  FINAL_OUTPUT=$(cat "$USER_STDERR_FILE" 2>/dev/null)
else
  STATUS="EXECUTED_SUCCESSFULLY"
  FINAL_OUTPUT=$(cat "$USER_STDOUT_FILE" 2>/dev/null)
fi

# --- 4. Emit results ---
echo "${STATUS}"
echo "${EXEC_TIME_SECONDS}"
echo "${PEAK_MEMORY_KB}"
echo "${SEPARATOR}"
echo -n "${FINAL_OUTPUT}"

exit 0
