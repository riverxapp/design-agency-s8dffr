FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache git ca-certificates
RUN corepack enable && corepack prepare pnpm@10.26.2 --activate

COPY package.json pnpm-lock.yaml* ./
RUN rm -rf node_modules && pnpm install --prefer-offline --no-frozen-lockfile

COPY . .

ENV NODE_ENV=development
ENV HOST=0.0.0.0
ENV CHOKIDAR_USEPOLLING=true
ENV CHOKIDAR_INTERVAL=100

EXPOSE 5173

CMD ["node", "scripts/dev-supervisor.js"]
