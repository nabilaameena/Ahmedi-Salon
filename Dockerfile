# ---- Stage 1: build the frontend ------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY vite.config.js ./
COPY index.html ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm install --no-audit --no-fund && npm run build

# ---- Stage 2: runtime (Node server + static dist) ------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# ADMIN_TOKEN defaults to "saloon" in code; override at runtime
# (see docker-compose.yml) — do not bake a real token into the image.

# Server deps first (better layer caching)
COPY server/package*.json ./server/
RUN npm --prefix server install --omit=dev --no-audit --no-fund

# Server code + the shared data module it imports
COPY server/ ./server/
COPY src/data.js ./src/data.js

# Built frontend
COPY --from=build /app/dist ./dist

# Persisted station state (durations, chat, listens, peak)
VOLUME ["/app/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/state >/dev/null || exit 1

CMD ["node", "server/index.js"]