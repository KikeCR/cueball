FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm install

COPY apps/server apps/server
COPY packages/shared packages/shared

WORKDIR /app/apps/server

EXPOSE 4000

CMD ["npm", "run", "dev"]
