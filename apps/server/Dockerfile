# https://bun.sh/guides/ecosystem/docker
# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
#
# Build from the repo root, not apps/server/ (docker-bake.hcl and docker-compose.yml both do): the server's dependencies
# are locked in the root bun.lock, and it imports @laplace.live/login-sync from the SDK source in
# packages/login-sync/src. Dockerfile.dockerignore trims the context down to what the image uses.
FROM oven/bun:1 AS base
WORKDIR /app

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install
# A frozen install checks the root lockfile against every workspace manifest, so all of them come along, but
# `--filter` installs only the server's dependencies. The hoisted linker lays those out as plain directories in the
# root node_modules, which can then move into /app on their own.
COPY package.json bun.lock /temp/dev/
COPY apps/extension/package.json /temp/dev/apps/extension/
COPY apps/server/package.json /temp/dev/apps/server/
COPY packages/login-sync/package.json /temp/dev/packages/login-sync/
RUN cp -r /temp/dev /temp/prod
RUN cd /temp/dev && bun install --frozen-lockfile --linker hoisted --filter laplace-login-sync-server

# install with --production (exclude devDependencies)
RUN cd /temp/prod && bun install --frozen-lockfile --linker hoisted --filter laplace-login-sync-server --production

# copy node_modules from temp directory
# then copy all (non-ignored) project files into the image
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY apps/server/ .
# The server stays at /app because its data directory resolves to /app/data, where deployments mount their volume.
# tsconfig.json's `paths` looks for the SDK at ../../packages/login-sync/src, which from /app is
# /packages/login-sync/src: the filesystem root is its own parent
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
