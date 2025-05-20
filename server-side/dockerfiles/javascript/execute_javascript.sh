#!/bin/bash

# Script arguments
CODE_FILENAME_MOUNTED_PATH="/sandbox/script.js" # Standard name for Node.js scripts
INPUT_FILENAME_MOUNTED_PATH="/sandbox/input.txt"

TIME_LIMIT_SECONDS=$1
MEMORY_LIMIT_KB=$2 # Node.js memory can be controlled via --max-old-space-size, but /usr/bin/time is primary here

INTERNAL_EXEC_DIR="$HOME/exec_space_js"

# --- Output Structure (STATUS, TIME_SEC, MEMORY_KB, DETAILS_...) ---

mkdir -p "$INTERNAL_EXEC_DIR"
cd "$INTERNAL_EXEC_DIR"

CODE_FILENAME_INTERNAL="script.js"
INPUT_FILENAME_INTERNAL="input.txt"
USER_STDOUT_FILENAME="user_stdout.txt"
USER_STDERR_FILENAME="user_stderr.txt"
# No COMPILE_LOG_FILENAME for Node.js
STATS_FILENAME="stats.txt"

# Check and copy mounted files
if [ ! -f "$CODE_FILENAME_MOUNTED_PATH" ]; then
  echo "RUNTIME_ERROR"; echo "0.00"; echo "0"; echo "Error: Source code (script.js) not found."
  exit 0
fi
if [ ! -f "$INPUT_FILENAME_MOUNTED_PATH" ]; then
  echo "RUNTIME_ERROR"; echo "0.00"; echo "0"; echo "Error: Input file (input.txt) not found."
  exit 0
fi
cp "$CODE_FILENAME_MOUNTED_PATH" "./$CODE_FILENAME_INTERNAL"
cp "$INPUT_FILENAME_MOUNTED_PATH" "./$INPUT_FILENAME_INTERNAL"

# 1. Execution Phase for Node.js (No separate compile step)
EFFECTIVE_TIME_LIMIT=$(echo "$TIME_LIMIT_SECONDS + 0.2" | bc) # Node might have slight startup

# Node.js memory can be limited with --max-old-space-size=<MB>
# We'll primarily rely on Docker's --memory and /usr/bin/time for measurement.
# NODE_OPTIONS="--max-old-space-size=$(($MEMORY_LIMIT_KB / 1024 - 16))" # Example, if desired

/usr/bin/timeout -s KILL "${EFFECTIVE_TIME_LIMIT}s" \
    /usr/bin/time -f "%e %M" -o "$STATS_FILENAME" \
    node "$CODE_FILENAME_INTERNAL" < "$INPUT_FILENAME_INTERNAL" > "$USER_STDOUT_FILENAME" 2> "$USER_STDERR_FILENAME"
    # Or with NODE_OPTIONS:
    # env NODE_OPTIONS="$NODE_OPTIONS" node "$CODE_FILENAME_INTERNAL" < ...

EXECUTION_EXIT_CODE=$?

EXEC_TIME_SECONDS="0.00"
PEAK_MEMORY_KB="0"
if [ -f "$STATS_FILENAME" ]; then # Parse stats
    STATS_CONTENT=$(cat "$STATS_FILENAME")
    EXEC_TIME_SECONDS=$(echo "$STATS_CONTENT" | awk '{print $1}')
    PEAK_MEMORY_KB=$(echo "$STATS_CONTENT" | awk '{print $2}')
    EXEC_TIME_SECONDS=${EXEC_TIME_SECONDS:-0.00}; PEAK_MEMORY_KB=${PEAK_MEMORY_KB:-0}
    if ! [[ "$EXEC_TIME_SECONDS" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then EXEC_TIME_SECONDS="0.00"; fi
    if ! [[ "$PEAK_MEMORY_KB" =~ ^[0-9]+$ ]]; then PEAK_MEMORY_KB="0"; fi
fi

# 2. Determine Status
# Since there's no compile step, a "Compilation Error" won't occur in the same way.
# Syntax errors in JS will result in a non-zero exit code and output to stderr directly.

if [ $EXECUTION_EXIT_CODE -eq 124 ] || [ $EXECUTION_EXIT_CODE -eq 137 ]; then # Timeout or killed
  if (( $(echo "$EXEC_TIME_SECONDS >= $TIME_LIMIT_SECONDS * 0.99" | bc -l) )); then
    echo "TIME_LIMIT_EXCEEDED"; echo "$TIME_LIMIT_SECONDS"; echo "$PEAK_MEMORY_KB"; cat "$USER_STDERR_FILENAME"
    exit 0
  fi
  # Could be OOM killed by Docker or other signal
  if [ "$PEAK_MEMORY_KB" -gt $(($MEMORY_LIMIT_KB * 95 / 100)) ]; then
    echo "MEMORY_LIMIT_EXCEEDED"; echo "$EXEC_TIME_SECONDS"; echo "$PEAK_MEMORY_KB"; cat "$USER_STDERR_FILENAME"
    exit 0
  else
    echo "RUNTIME_ERROR"; echo "$EXEC_TIME_SECONDS"; echo "$PEAK_MEMORY_KB"
    echo "Node.js program terminated with signal or unusual exit code ($EXECUTION_EXIT_CODE)."
    cat "$USER_STDERR_FILENAME"
    exit 0
  fi
fi

if [ "$PEAK_MEMORY_KB" -gt "$MEMORY_LIMIT_KB" ]; then # Heuristic MLE from /usr/bin/time
    echo "MEMORY_LIMIT_EXCEEDED"; echo "$EXEC_TIME_SECONDS"; echo "$PEAK_MEMORY_KB"; cat "$USER_STDERR_FILENAME"
    exit 0
fi

if [ $EXECUTION_EXIT_CODE -ne 0 ]; then # Any other non-zero exit usually means runtime error (incl. syntax errors)
  echo "RUNTIME_ERROR" # JS Syntax errors will appear here
  echo "$EXEC_TIME_SECONDS"
  echo "$PEAK_MEMORY_KB"
  echo "Node.js program exited with non-zero status: $EXECUTION_EXIT_CODE."
  cat "$USER_STDERR_FILENAME" # This will contain JS stack traces or syntax error messages
  exit 0
fi

# If all checks passed
echo "EXECUTED_SUCCESSFULLY"
echo "$EXEC_TIME_SECONDS"
echo "$PEAK_MEMORY_KB"
cat "$USER_STDOUT_FILENAME"
exit 0