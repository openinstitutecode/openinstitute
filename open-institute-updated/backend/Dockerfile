FROM node:20-alpine AS base
WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

ENV UPLOAD_DIR=/app/uploads
RUN mkdir -p /app/uploads && chmod +x /app/docker-entrypoint.sh

# Batch 67 — KOPS-004: run as the unprivileged "node" user and expose a container healthcheck.
RUN chown -R node:node /app
USER node
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD wget -qO- "http://localhost:${PORT:-4000}/api/ready" >/dev/null || exit 1

EXPOSE 10000
CMD ["sh", "/app/docker-entrypoint.sh"]
