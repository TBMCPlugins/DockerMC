FROM node:16 AS dev

WORKDIR src
ARG DGID

# Install Docker
RUN apt-get update
RUN apt-get install -y \
        ca-certificates \
        curl \
        gnupg \
        lsb-release
RUN curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
RUN echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian \
      $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
RUN apt-get update
RUN apt-get install -y docker-ce docker-ce-cli containerd.io
# Install Docker Compose
RUN apt-get install -y docker-compose-plugin
# Install wait-for-it
RUN apt-get install -y wait-for-it
# Add user to Docker group so Docker commands can be used
RUN groupadd -g $DGID hostDocker || :
RUN usermod -aG $DGID node
USER node

ENTRYPOINT ["node_modules/.bin/tsc-watch", "--target", "es2017", "--outDir", "./dist", "--onSuccess", "node -r source-map-support/register .", "--noClear"]

FROM dev AS prod

COPY src .

RUN npm rebuild

ENTRYPOINT ["npm", "start"]
