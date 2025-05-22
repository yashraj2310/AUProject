
FROM python:3.10-slim 


RUN apt-get update && apt-get install -y --no-install-recommends \
    coreutils \
    bc \
    time \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -ms /bin/bash -u 1001 executor
WORKDIR /sandbox

COPY execute_python.sh /usr/local/bin/execute_python.sh
RUN chmod +x /usr/local/bin/execute_python.sh && chown executor:executor /usr/local/bin/execute_python.sh

USER executor
ENTRYPOINT ["/usr/local/bin/execute_python.sh"]