# Use an official, slim Python base image
FROM python:3.10-slim

# Install necessary tools for time and memory measurement
# 'bc' is no longer needed with the simplified script
RUN apt-get update && apt-get install -y --no-install-recommends \
    coreutils \
    time \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user 'executor' for security
RUN useradd -ms /bin/bash -u 1001 executor

# Set the working directory inside the container
WORKDIR /sandbox

# Copy the execution script from your host into the image
COPY execute_python.sh /usr/local/bin/execute_python.sh

# Make the script executable and give ownership to the non-root user
RUN chmod +x /usr/local/bin/execute_python.sh && chown executor:executor /usr/local/bin/execute_python.sh

# Switch to the non-root user for running the code
USER executor

# Set the container's entrypoint to be our script
ENTRYPOINT ["/usr/local/bin/execute_python.sh"]