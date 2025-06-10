# Use a standard, slim OpenJDK image
FROM openjdk:17-slim

# Install necessary tools without interactive prompts
RUN apt-get update && apt-get install -y --no-install-recommends \
    coreutils \
    bc \
    time \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user 'executor' with a specific UID
RUN useradd -ms /bin/bash -u 1001 executor

# Set the default working directory for the container
WORKDIR /sandbox

# Copy the execution script and make it executable
COPY execute_java.sh /usr/local/bin/execute_java.sh
RUN chmod +x /usr/local/bin/execute_java.sh && chown executor:executor /usr/local/bin/execute_java.sh

# Switch to the non-root user for security
USER executor

# Set the entrypoint for the container
ENTRYPOINT ["/usr/local/bin/execute_java.sh"]