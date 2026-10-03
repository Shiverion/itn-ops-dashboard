# The ITN Ops dashboard on ITN's own domain (Cloud Run service itn-dashboard).
# Build from the repo root: gcloud builds submit --config web/cloudbuild.yaml .

# 1. Build the React dashboard (the same single-file page the Apps Script version serves).
FROM node:22-slim AS ui
WORKDIR /ui
COPY dashboard-ui/package.json dashboard-ui/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY dashboard-ui/index.html dashboard-ui/vite.config.ts dashboard-ui/tsconfig.json ./
COPY dashboard-ui/src ./src
RUN npx tsc --noEmit && npx vite build

# 2. The server: shared/Logic.js builds the payload, dashboard/src/Config.js has the sheet schemas.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci --omit=dev --no-audit --no-fund
# Claude Code for the AI features (runs on the owner's Claude subscription;
# the token comes from Secret Manager at run time). Installed for the "node" user.
USER node
RUN curl -fsSL https://claude.ai/install.sh | bash -s 2.1.284
ENV PATH=/home/node/.local/bin:$PATH DISABLE_AUTOUPDATER=1 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
COPY web/server.mjs web/drive.mjs web/ai.mjs web/
COPY shared/Logic.js shared/
COPY dashboard/src/Config.js dashboard/src/
COPY --from=ui /ui/dist/index.html web/public/index.html
ENV NODE_ENV=production
CMD ["node", "web/server.mjs"]
