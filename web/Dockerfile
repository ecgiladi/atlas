FROM node:20-slim

WORKDIR /app

# Pin pnpm 9 (pnpm 11 requires Node 22; this image is Node 20).
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install

COPY . .

CMD ["pnpm", "run", "dev"]
