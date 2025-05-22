#!/bin/bash

CODE_FILENAME_MOUNTED_PATH="/sandbox/script.py"
INPUT_FILENAME_MOUNTED_PATH="/sandbox/input.txt"
TIME_LIMIT_SECONDS=$1
MEMORY_LIMIT_KB=$2 # Python memory can be harder to strictly limit internally

INTERNAL_EXEC_DIR="$HOME/exec_space_py"
mkdir -p "$INTERNAL_EXEC_DIR"; cd "$INTERNAL_EXEC_DIR"

CODE_FILENAME_INTERNAL="script.py"
INPUT_FILENAME_INTERNAL="input.txt"
USER_STDOUT_FILENAME="user_stdout.txt"
USER_STDERR_FILENAME="user_stderr.txt"
STATS_FILENAME="stats.txt"

if [ ! -f "$CODE_FILENAME_MOUNTED_PATH" ]; then
  echo "RUNTIME_ERROR"; echo "0.00"; echo "0"; echo "Error: Source code (script.py) not found."
  exit 0
fi
if [ ! -f "$INPUT_FILENAME_MOUNTED_PATH" ]; then
  echo "RUNTIME_ERROR"; echo "0.00"; echo "0"; echo "Error: Input file (input.txt) not found."
  exit 0
fi
cp "$CODE_FILENAME_MOUNTED_PATH" "./$CODE_FILENAME_INTERNAL"
cp "$INPUT_FILENAME_MOUNTED_PATH" "./$INPUT_FILENAME_INTERNAL"

EFFECTIVE_TIME_LIMIT=$(echo "$TIME_LIMIT_SECONDS + 0.1" | bc)

/usr/bin/timeout -s KILL "${EFFECTIVE_TIME_LIMIT}s" \
    /usr/bin/time -f "%e %M" -o "$STATS_FILENAME" \
    python3 "$CODE_FILENAME_INTERNAL" < "$INPUT_FILENAME_INTERNAL" > "$USER_STDOUT_FILENAME" 2> "$USER_STDERR_FILENAME"
    # Use python3 explicitly, or just python if the image defaults correctly

EXECUTION_EXIT_CODE=$?

EXEC_TIME_SECONDS="0.00"; PEAK_MEMORY_KB="0"
if [ -f "$STATS_FILENAME" ]; then
    STATS_CONTENT=$(cat "$STATS_FILENAME"); EXEC_TIME_SECONDS=$(echo "$STATS_CONTENT" | awk '{print $1}')
    PEAK_MEMORY_KB=$(echo "$STATS_CONTENT" | awk '{print $2}'); EXEC_TIME_SECONDS=${EXEC_TIME_SECONDS:-0.00}
    PEAK_MEMORY_KB=${PEAK_MEMORY_KB:-0}
    if ! [[ "$EXEC_TIME_SECONDS" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then EXEC_TIME_SECONDS="0.00"; fi
    if ! [[ "$PEAK_MEMORY_KB" =~ ^[0-9]+$ ]]; then PEAK_MEMORY_KB="0"; fi
fi

# Status Determination (similar to Node.js, as Python syntax errors also become runtime errors)
if [ $EXECUTION_EXIT_CODE -eq 124 ] || [ $EXECUTION_EXIT_CODE -eq 137 ]; then
  if (( $(echo "$EXEC_TIME_SECONDS >= $TIME_LIMIT_SECONDS * 0.99" | bc -l) )); then
    echo "TIME_LIMIT_EXCEEDED"; echo "$TIME_LIMIT_SECONDS"; echo "$PEAK_MEMORY_KB"; cat "$USER_STDERR_FILENAME"
    exit 0
  fi
  if [ "$PEAK_MEMORY_KB" -gt $(($MEMORY_LIMIT_KB * 95 / 100)) ]; then
    echo "MEMORY_LIMIT_EXCEEDED"; echo "$EXEC_TIME_SECONDS"; echo "$PEAK_MEMORY_KB"; cat "$USER_STDERR_FILENAME"
    exit 0
  else
    echo "RUNTIME_ERROR"; echo "$EXEC_TIME_SECONDS"; echo "$PEAK_MEMORY_KB"
    echo "Python program terminated with signal or unusual exit code ($EXECUTION_EXIT_CODE)."
    cat "$USER_STDERR_FILENAME"
    exit 0
  fi
fi

if [ "$PEAK_MEMORY_KB" -gt "$MEMORY_LIMIT_KB" ]; then
    echo "MEMORY_LIMIT_EXCEEDED"; echo "$EXEC_TIME_SECONDS"; echo "$PEAK_MEMORY_KB"; cat "$USER_STDERR_FILENAME"
    exit 0
fi

if [ $EXECUTION_EXIT_CODE -ne 0 ]; then
  echo "RUNTIME_ERROR" # Python Syntax errors also result in non-zero exit and stderr output
  echo "$EXEC_TIME_SECONDS"; echo "$PEAK_MEMORY_KB"
  echo "Python program exited with non-zero status: $EXECUTION_EXIT_CODE."
  cat "$USER_STDERR_FILENAME" # Will contain Python stack traces or syntax error details
  exit 0
fi

echo "EXECUTED_SUCCESSFULLY"
echo "$EXEC_TIME_SECONDS"; echo "$PEAK_MEMORY_KB"
cat "$USER_STDOUT_FILENAME"
exit 0