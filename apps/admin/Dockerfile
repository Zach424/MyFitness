ARG NODE_IMAGE=node:24.13.0-bookworm-slim@sha256:4660b1ca8b28d6d1906fd644abe34b2ed81d15434d26d845ef0aced307cf4b6f

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace
RUN npm install --global pnpm@11.9.0
COPY . .
RUN --mount=type=cache,id=myfitness-pnpm-admin,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --filter @myfitness/admin... --frozen-lockfile
RUN pnpm build:admin

FROM ${NODE_IMAGE} AS runtime
ARG BUILD_VERSION=dev
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="MyFitness administrator" \
      org.opencontainers.image.description="MyFitness read-only administrator evidence desk" \
      org.opencontainers.image.source="https://github.com/Zach424/MyFitness" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}"
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3101
WORKDIR /app
COPY --from=build --chown=node:node /workspace/apps/admin/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/admin/.next/static /app/apps/admin/.next/static
USER node
EXPOSE 3101
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3101').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "apps/admin/server.js"]
