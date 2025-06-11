FROM gcc:11

# tools for timeout, /usr/bin/time, ls, etc.
RUN apt-get update \
  && apt-get install -y --no-install-recommends coreutils time \
  && rm -rf /var/lib/apt/lists/*

# non-root user
RUN useradd -ms /bin/bash -u 1001 executor

WORKDIR /sandbox
RUN chown executor:executor /sandbox

USER executor
# no ENTRYPOINT: we’ll pass Cmd from the Node worker
