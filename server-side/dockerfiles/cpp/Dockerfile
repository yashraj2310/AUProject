# Use a smaller, purpose-built base image for C/C++
FROM gcc:11

# Install only the necessary extra tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    coreutils \
    time \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user 'executor' for security
RUN useradd -ms /bin/bash -u 1001 executor

# Set the working directory
WORKDIR /sandbox

# --- FIX: Give the executor user ownership of the working directory ---
RUN chown -R executor:executor /sandbox

# Copy the execution script and make it executable by the non-root user
COPY execute_cpp.sh /usr/local/bin/execute_cpp.sh
RUN chmod +x /usr/local/bin/execute_cpp.sh && chown executor:executor /usr/local/bin/execute_cpp.sh

# Switch to the non-root user
USER executor

# Set the container's entrypoint
ENTRYPOINT ["/usr/local/bin/execute_cpp.sh"]