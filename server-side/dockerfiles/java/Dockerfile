# Use an official OpenJDK image as a base.
FROM openjdk:17-slim 

# Set DEBIAN_FRONTEND to noninteractive to avoid prompts
ENV DEBIAN_FRONTEND=noninteractive


RUN apt-get update && apt-get install -y --no-install-recommends \
    coreutils \
    bc \
    time \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user 'executor'
RUN useradd -ms /bin/bash -u 1001 executor 
# Ensure DOCKER_CONTAINER_UID in .env matches 1001

WORKDIR /sandbox # Default working directory for the container

COPY execute_java.sh /usr/local/bin/execute_java.sh
RUN chmod +x /usr/local/bin/execute_java.sh && chown executor:executor /usr/local/bin/execute_java.sh

USER executor

ENTRYPOINT ["/usr/local/bin/execute_java.sh"]