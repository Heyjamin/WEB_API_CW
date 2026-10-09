# syntax=docker/dockerfile:1
# SLSEA coursework API — isolated from HelioLanka .NET image at repo root.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3080 \
    DATABASE_PATH=/app/data/slsea.sqlite
RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --create-home api
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh \
  && mkdir -p /app/data \
  && chown -R api:nodejs /app
USER api
EXPOSE 3080
VOLUME ["/app/data"]
ENTRYPOINT ["dumb-init", "--", "./docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
