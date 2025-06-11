FROM openjdk:17-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    coreutils \
    time \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -ms /bin/bash -u 1001 executor
WORKDIR /sandbox

# --- FIX: Give the executor user ownership of the working directory ---
RUN chown -R executor:executor /sandbox

COPY execute_java.sh /usr/local/bin/execute_java.sh
RUN chmod +x /usr/local/bin/execute_java.sh && chown executor:executor /usr/local/bin/execute_java.sh

USER executor
ENTRYPOINT ["/usr/local/bin/execute_java.sh"]