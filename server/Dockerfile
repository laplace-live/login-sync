# https://bun.sh/guides/ecosystem/docker
# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
#
# Build from the repo root, not server/ (docker-bake.hcl and docker-compose.yml both do): the server imports
# @laplace.live/login-sync from the SDK source in packages/login-sync/src. Dockerfile.dockerignore trims the context
# down to server/ and that source.
FROM oven/bun:1 AS base
WORKDIR /app

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install
RUN mkdir -p /temp/dev
COPY server/package.json server/bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# install with --production (exclude devDependencies)
RUN mkdir -p /temp/prod
COPY server/package.json server/bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# copy node_modules from temp directory
# then copy all (non-ignored) project files into the image
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY server/ .
# The server stays at /app because its data directory resolves to /app/data, where deployments mount their volume. The
# SDK goes where tsconfig.json's `paths` expects it relative to the server: ../packages/login-sync/src
COPY packages/login-sync/src /packages/login-sync/src

# [optional] tests & build
ENV NODE_ENV=production
RUN bun test
# RUN bun run build

# copy production dependencies and source code into final image
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /app/src ./src
# tsconfig.json carries the `paths` entry Bun resolves the SDK through at runtime
COPY --from=prerelease /app/package.json /app/tsconfig.json ./
COPY --from=prerelease /packages/login-sync/src /packages/login-sync/src

# run the app
USER bun
EXPOSE 8088/tcp
ENTRYPOINT [ "bun", "run", "start" ]
