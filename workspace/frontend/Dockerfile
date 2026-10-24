FROM node:20-alpine

WORKDIR /app

# The public API URL is injected by the image workflow; self-hosted deployments
# can use the same HTTPS origin as the frontend and route /v1/* through Caddy.
ARG NEXT_PUBLIC_API_URL=https://workspace-endpoint.openagents.org
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
# Self-hosted / preview deployments on their own domain (see
# lib/openagents-auth-context.tsx and lib/auth-redirects.ts).
ARG NEXT_PUBLIC_FIRST_PARTY_HOSTNAMES=
ENV NEXT_PUBLIC_FIRST_PARTY_HOSTNAMES=${NEXT_PUBLIC_FIRST_PARTY_HOSTNAMES}
ARG NEXT_PUBLIC_INLINE_LOGIN=
ENV NEXT_PUBLIC_INLINE_LOGIN=${NEXT_PUBLIC_INLINE_LOGIN}

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy application code
COPY . .

# Build the standalone server. `next start` does not serve this output.
RUN npm run build \
 && cp -r public .next/standalone/public \
 && cp -r .next/static .next/standalone/.next/static

ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["node", ".next/standalone/server.js"]
