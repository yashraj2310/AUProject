# Use an official, slim Python base image
FROM python:3.10-slim

# Install necessary tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    coreutils \
    time \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user 'executor' for security
RUN useradd -ms /bin/bash -u 1001 executor
WORKDIR /sandbox

# --- FIX: Give the executor user ownership of the working directory ---
RUN chown -R executor:executor /sandbox

# Copy the execution script
COPY execute_python.sh /usr/local/bin/execute_python.sh
RUN chmod +x /usr/local/bin/execute_python.sh && chown executor:executor /usr/local/bin/execute_python.sh

# Switch to the non-root user
USER executor
ENTRYPOINT ["/usr/local/bin/execute_python.sh"]