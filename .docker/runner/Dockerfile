FROM node:16 AS dev

WORKDIR src

ENTRYPOINT ["npm", "run", "start:watch"]

FROM dev AS prod

COPY src .

RUN npm rebuild

ENTRYPOINT ["npm", "start"]
