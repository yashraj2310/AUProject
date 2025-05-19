
echo "--- Listing /sandbox contents at script start (to stderr) ---" >&2
ls -la /sandbox >&2
echo "--- End of /sandbox listing (to stderr) ---" >&2
echo "--- Listing $HOME/exec_space_java contents at script start (to stderr) ---" >&2
ls -la "$HOME/exec_space_java" >&2 # This will error, which is fine, output goes to stderr
echo "--- End of $HOME/exec_space_java listing (to stderr) ---" >&2

CODE_FILENAME_MOUNTED_PATH="/sandbox/Main.java"
INPUT_FILENAME_MOUNTED_PATH="/sandbox/input.txt"

TIME_LIMIT_SECONDS=$1
MEMORY_LIMIT_KB=$2 # JVM memory needs separate handling (-Xmx)

INTERNAL_EXEC_DIR="$HOME/exec_space_java" # Unique for Java

# --- Output Structure (STATUS, TIME_SEC, MEMORY_KB, DETAILS_...) ---

mkdir -p "$INTERNAL_EXEC_DIR"
cd "$INTERNAL_EXEC_DIR"

CODE_FILENAME_INTERNAL="Main.java" # Class name must be Main
INPUT_FILENAME_INTERNAL="input.txt"
USER_STDOUT_FILENAME="user_stdout.txt"
USER_STDERR_FILENAME="user_stderr.txt"
COMPILE_LOG_FILENAME="compile_log.txt"
STATS_FILENAME="stats.txt"
# No executable name like C++, compilation produces .class files

# Check and copy mounted files
if [ ! -f "$CODE_FILENAME_MOUNTED_PATH" ]; then
  echo "RUNTIME_ERROR"; echo "0.00"; echo "0"; echo "Error: Source code (Main.java) not found."
  exit 0
fi
if [ ! -f "$INPUT_FILENAME_MOUNTED_PATH" ]; then
  echo "RUNTIME_ERROR"; echo "0.00"; echo "0"; echo "Error: Input file (input.txt) not found."
  exit 0
fi
cp "$CODE_FILENAME_MOUNTED_PATH" "./$CODE_FILENAME_INTERNAL"
cp "$INPUT_FILENAME_MOUNTED_PATH" "./$INPUT_FILENAME_INTERNAL"

# 1. Compilation Phase for Java
javac "$CODE_FILENAME_INTERNAL" > "$COMPILE_LOG_FILENAME" 2>&1
COMPILE_EXIT_CODE=$?

if [ $COMPILE_EXIT_CODE -ne 0 ]; then
  echo "COMPILATION_ERROR"
  echo "0.00"
  echo "0"
  cat "$COMPILE_LOG_FILENAME"
  exit 0
fi

# 2. Execution Phase for Java
EFFECTIVE_TIME_LIMIT=$(echo "$TIME_LIMIT_SECONDS + 0.5" | bc) # Java might need a bit more buffer for JVM startup


JVM_MAX_HEAP_MB=$(echo "($MEMORY_LIMIT_KB / 1024) - 16" | bc) # Subtract some MB for JVM overhead
if [ "$JVM_MAX_HEAP_MB" -lt 16 ]; then JVM_MAX_HEAP_MB=16; fi # Minimum heap

# The class to run is 'Main' (without .java or .class)
/usr/bin/timeout -s KILL "${EFFECTIVE_TIME_LIMIT}s" \
    /usr/bin/time -f "%e %M" -o "$STATS_FILENAME" \
    java -Xmx${JVM_MAX_HEAP_MB}m -cp . Main < "$INPUT_FILENAME_INTERNAL" > "$USER_STDOUT_FILENAME" 2> "$USER_STDERR_FILENAME"

EXECUTION_EXIT_CODE=$?

EXEC_TIME_SECONDS="0.00"
PEAK_MEMORY_KB="0" # This will be what /usr/bin/time reports for the JVM process

if [ -f "$STATS_FILENAME" ]; then
    STATS_CONTENT=$(cat "$STATS_FILENAME")
    EXEC_TIME_SECONDS=$(echo "$STATS_CONTENT" | awk '{print $1}')
    PEAK_MEMORY_KB=$(echo "$STATS_CONTENT" | awk '{print $2}')
    EXEC_TIME_SECONDS=${EXEC_TIME_SECONDS:-0.00}
    PEAK_MEMORY_KB=${PEAK_MEMORY_KB:-0}
    if ! [[ "$EXEC_TIME_SECONDS" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then EXEC_TIME_SECONDS="0.00"; fi
    if ! [[ "$PEAK_MEMORY_KB" =~ ^[0-9]+$ ]]; then PEAK_MEMORY_KB="0"; fi
fi

# 3. Determine Status (similar logic to C++, adjust for Java specifics)
if [ $EXECUTION_EXIT_CODE -eq 124 ] || [ $EXECUTION_EXIT_CODE -eq 137 ]; then # Timeout or killed
  if (( $(echo "$EXEC_TIME_SECONDS >= $TIME_LIMIT_SECONDS * 0.98" | bc -l) )); then # Consider JVM startup time
    echo "TIME_LIMIT_EXCEEDED"
    echo "$TIME_LIMIT_SECONDS"
    echo "$PEAK_MEMORY_KB"
    cat "$USER_STDERR_FILENAME"
    exit 0
  fi
  # Check for OutOfMemoryError in stderr if killed
  if grep -q "java.lang.OutOfMemoryError" "$USER_STDERR_FILENAME"; then
    echo "MEMORY_LIMIT_EXCEEDED"
    echo "$EXEC_TIME_SECONDS"
    echo "$PEAK_MEMORY_KB" # This might be high due to OOM
    cat "$USER_STDERR_FILENAME"
    exit 0
  else # Other reasons for 137
    echo "RUNTIME_ERROR"
    echo "$EXEC_TIME_SECONDS"
    echo "$PEAK_MEMORY_KB"
    echo "Java program terminated with signal or unusual exit code ($EXECUTION_EXIT_CODE)."
    cat "$USER_STDERR_FILENAME"
    exit 0
  fi
fi

# Check /usr/bin/time reported memory against limit (less precise than JVM OOM)
if [ "$PEAK_MEMORY_KB" -gt "$MEMORY_LIMIT_KB" ]; then
    echo "MEMORY_LIMIT_EXCEEDED"
    echo "$EXEC_TIME_SECONDS"
    echo "$PEAK_MEMORY_KB"
    cat "$USER_STDERR_FILENAME"
    exit 0
fi

# Check for other Runtime Errors from Java (e.g., NullPointerException, ArrayIndexOutOfBounds)
# These usually result in non-zero exit code and output to stderr.
if [ $EXECUTION_EXIT_CODE -ne 0 ]; then
  echo "RUNTIME_ERROR"
  echo "$EXEC_TIME_SECONDS"
  echo "$PEAK_MEMORY_KB"
  echo "Java program exited with non-zero status: $EXECUTION_EXIT_CODE."
  cat "$USER_STDERR_FILENAME"
  exit 0
fi

# If all checks passed
echo "EXECUTED_SUCCESSFULLY"
echo "$EXEC_TIME_SECONDS"
echo "$PEAK_MEMORY_KB"
cat "$USER_STDOUT_FILENAME"
exit 0