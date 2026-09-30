# syntax=docker/dockerfile:1

# ---- deps: install all dependencies from the lockfile ----
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: compile the Next.js app (standalone output) ----
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Make sure ./public exists so the COPY in the runtime stage never fails.
RUN mkdir -p public
RUN npm run build

# ---- runtime: minimal image, non-root ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Dedicated non-root user (uid/gid 10001 must match k8s securityContext).
RUN addgroup -S -g 10001 nextjs && adduser -S -u 10001 -G nextjs nextjs

COPY --from=build --chown=nextjs:nextjs /app/public ./public
COPY --from=build --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/.next/static ./.next/static
# Writable cache dir (mounted as an emptyDir in Kubernetes).
RUN mkdir -p .next/cache && chown -R nextjs:nextjs .next

USER 10001:10001
EXPOSE 3000
CMD ["node", "server.js"]
