# PerpsPocket bot. Node 24 for the built-in node:sqlite; fonts so PnL cards render text.
FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
# Mount a persistent volume here: it holds the database and every user's encrypted bot key.
ENV DATA_DIR=/data
CMD ["npx", "tsx", "src/index.ts"]
