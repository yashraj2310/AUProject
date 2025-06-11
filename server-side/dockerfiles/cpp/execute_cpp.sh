#!/bin/bash
TIME_LIMIT_SECONDS=$1
MEMORY_LIMIT_KB=$2
SOURCE_FILE_BASENAME=$3

SANDBOX_DIR="/sandbox"
SEPARATOR="---|||---"

RUN_DIR=$(mktemp -d)
trap 'rm -rf "$RUN_DIR"' EXIT

cd "$RUN_DIR"
cp "${SANDBOX_DIR}/${SOURCE_FILE_BASENAME}" .

# Create input file stub if missing
if [ -f "${SANDBOX_DIR}/input.txt" ]; then
  cp "${SANDBOX_DIR}/input.txt" .
else
  touch input.txt
fi

# Compilation
COMPILER_OUTPUT_FILE="compiler_errors.txt"
COMPILED_EXECUTABLE="a.out"

g++ -O2 -std=c++17 -Wall "$SOURCE_FILE_BASENAME" -o "$COMPILED_EXECUTABLE" 2> "$COMPILER_OUTPUT_FILE"
COMPILATION_EXIT_CODE=$?

if [ $COMPILATION_EXIT_CODE -ne 0 ]; then
  echo "COMPILATION_ERROR"
  echo "0.00"
  echo "0"
  echo "$SEPARATOR"
  cat "$COMPILER_OUTPUT_FILE"
  exit 0
fi

# Execution
(
  ulimit -v $((MEMORY_LIMIT_KB * 1024))
  /usr/bin/time -f "%e %M" -o stats.txt \
    timeout -s KILL "${TIME_LIMIT_SECONDS}s" \
    "./$COMPILED_EXECUTABLE" < input.txt > output.txt 2> error.txt
)
EXECUTION_EXIT_CODE=$?

# Process results
EXEC_TIME_SECONDS=0.00
PEAK_MEMORY_KB=0

if [ -f stats.txt ]; then
  read -r EXEC_TIME_SECONDS PEAK_MEMORY_KB < stats.txt
fi

STATUS="EXECUTED_SUCCESSFULLY"
FINAL_OUTPUT=$(cat output.txt)

if [ $EXECUTION_EXIT_CODE -eq 137 ] || [ $EXECUTION_EXIT_CODE -eq 124 ]; then
  STATUS="TIME_LIMIT_EXCEEDED"
elif [ "$PEAK_MEMORY_KB" -gt "$MEMORY_LIMIT_KB" ]; then
  STATUS="MEMORY_LIMIT_EXCEEDED"
elif [ $EXECUTION_EXIT_CODE -ne 0 ]; then
  STATUS="RUNTIME_ERROR"
  FINAL_OUTPUT=$(cat error.txt)
fi

echo "$STATUS"
echo "$EXEC_TIME_SECONDS"
echo "$PEAK_MEMORY_KB"
echo "$SEPARATOR"
echo -n "$FINAL_OUTPUT"
exit 0