FROM node:18-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash coreutils time \
  && rm -rf /var/lib/apt/lists/*

RUN useradd -ms /bin/bash -u 1001 executor

WORKDIR /sandbox
RUN chown executor:executor /sandbox

USER executor
