ARG NODE_IMAGE=node:24.13.0-bookworm-slim@sha256:4660b1ca8b28d6d1906fd644abe34b2ed81d15434d26d845ef0aced307cf4b6f

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
WORKDIR /workspace
RUN npm install --global pnpm@11.9.0
COPY . .
RUN --mount=type=cache,id=myfitness-pnpm-api,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --filter @myfitness/api... --frozen-lockfile
RUN pnpm build:api
RUN pnpm --filter @myfitness/api --prod deploy --legacy /out/api

FROM ${NODE_IMAGE} AS runtime
ARG BUILD_VERSION=dev
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="MyFitness API" \
      org.opencontainers.image.description="MyFitness business and privacy API" \
      org.opencontainers.image.source="https://github.com/Zach424/MyFitness" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}"
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3100
WORKDIR /app/apps/api
COPY --from=build --chown=node:node /out/api ./
COPY --from=build --chown=node:node /workspace/infra/postgres/migrations /app/infra/postgres/migrations
USER node
EXPOSE 3100
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3100/v1/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
