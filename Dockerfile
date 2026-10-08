FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev

FROM dependencies AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build:cloud-run

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0 APP_RUNTIME=cloud-run
RUN groupadd --system --gid 1001 bot1 && useradd --system --uid 1001 --gid bot1 bot1
COPY --from=builder --chown=bot1:bot1 /app/.next/standalone ./
COPY --from=builder --chown=bot1:bot1 /app/.next/static ./.next/static
COPY --from=builder --chown=bot1:bot1 /app/public ./public
USER bot1
EXPOSE 8080
CMD ["node", "server.js"]
