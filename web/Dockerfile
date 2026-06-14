FROM node:20-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install

COPY . .

CMD ["pnpm", "run", "dev"]
