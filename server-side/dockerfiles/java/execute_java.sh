#!/bin/bash

# Arguments from the worker
TIME_LIMIT_SECONDS=$1
MEMORY_LIMIT_KB=$2
SOURCE_FILE_BASENAME=$3 # e.g., "Main.java"

# --- Setup ---
CLASS_NAME=$(basename "${SOURCE_FILE_BASENAME}" .java) # Extracts "Main"
SANDBOX_DIR="/sandbox"
INPUT_FILE="${SANDBOX_DIR}/input.txt"
SEPARATOR="---|||---"

# We are already in the sandbox, no need to copy files
cd "$SANDBOX_DIR"

# --- 1. Compilation ---
COMPILER_OUTPUT_FILE="compiler_errors.txt"

# Compile the source file, redirecting errors to a log
javac "${SOURCE_FILE_BASENAME}" 2> "${COMPILER_OUTPUT_FILE}"
COMPILATION_EXIT_CODE=$?

# If compilation fails, report it and exit
if [ $COMPILATION_EXIT_CODE -ne 0 ]; then
  echo "COMPILATION_ERROR"
  echo "0.00"
  echo "0"
  echo "${SEPARATOR}"
  # Use echo -n to prevent extra newlines in the output
  echo -n "$(cat "${COMPILER_OUTPUT_FILE}")"
  exit 0
fi

# --- 2. Execution ---
USER_STDOUT_FILE="user_stdout.txt"
USER_STDERR_FILE="user_stderr.txt"
STATS_FILE="stats.txt"

# For Java, it's best to control heap with -Xmx.
# ulimit is a good backup to catch overall process memory.
MEMORY_LIMIT_MB=$((MEMORY_LIMIT_KB / 1024))
# Give the JVM some headroom on top of the heap for other memory usage
MEMORY_LIMIT_ULIMIT=$((MEMORY_LIMIT_KB + 64000)) # Heap + 64MB buffer

(
  ulimit -v "${MEMORY_LIMIT_ULIMIT}";
  /usr/bin/time -f "%e %M" -o "${STATS_FILE}" \
  timeout -s KILL "${TIME_LIMIT_SECONDS}s" \
  java -Xmx"${MEMORY_LIMIT_MB}"m "${CLASS_NAME}" < "${INPUT_FILE}" > "${USER_STDOUT_FILE}" 2> "${USER_STDERR_FILE}"
)
# Get the exit code from the `timeout` command, which wraps the `java` process
EXECUTION_EXIT_CODE=${PIPESTATUS[1]}

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

# Simplified and robust status determination
if [ "$EXECUTION_EXIT_CODE" -eq 137 ] || [ "$EXECUTION_EXIT_CODE" -eq 124 ]; then
    STATUS="TIME_LIMIT_EXCEEDED"
    FINAL_OUTPUT=$(cat "$USER_STDERR_FILE")
    EXEC_TIME_SECONDS=$TIME_LIMIT_SECONDS # Report the time limit as the execution time
# Check if ulimit was tripped OR if Java ran out of heap memory
elif [ "$PEAK_MEMORY_KB" -gt "$MEMORY_LIMIT_KB" ] || grep -q "java.lang.OutOfMemoryError" "$USER_STDERR_FILE"; then
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