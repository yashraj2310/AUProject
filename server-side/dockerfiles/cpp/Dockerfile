# Use a single stage for simplicity in this C++ execution engine
FROM ubuntu:22.04

# Set DEBIAN_FRONTEND to noninteractive to avoid prompts during apt-get
ENV DEBIAN_FRONTEND=noninteractive


RUN apt-get update && apt-get install -y --no-install-recommends \
    coreutils \
    build-essential \
    g++ \
    bc \
    time \
    && rm -rf /var/lib/apt/lists/*
   


RUN useradd -ms /bin/bash -u 1001 executor

WORKDIR /sandbox

COPY execute_cpp.sh /usr/local/bin/execute_cpp.sh
RUN chmod +x /usr/local/bin/execute_cpp.sh && chown executor:executor /usr/local/bin/execute_cpp.sh

USER executor
ENTRYPOINT ["/usr/local/bin/execute_cpp.sh"]