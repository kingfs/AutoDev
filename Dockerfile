FROM node:22-bookworm-slim AS build
WORKDIR /opt/autodev
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM autodev-guest:20260804-luna1
USER root
WORKDIR /opt/autodev
COPY --from=build /opt/autodev/package.json /opt/autodev/package-lock.json ./
COPY --from=build /opt/autodev/node_modules ./node_modules
COPY --from=build /opt/autodev/dist ./dist
COPY config ./config
COPY scripts/run-webhook.sh ./scripts/run-webhook.sh
ENTRYPOINT []
