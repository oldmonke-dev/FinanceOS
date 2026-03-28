FROM node:22-alpine AS deps
WORKDIR /app

COPY Finance.WebAPI/finance-spa/package.json Finance.WebAPI/finance-spa/package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_FINANCE_API_BASE_URL=/api-proxy
ARG FINANCE_API_SERVER_BASE_URL
ENV NEXT_PUBLIC_FINANCE_API_BASE_URL=${NEXT_PUBLIC_FINANCE_API_BASE_URL}
ENV FINANCE_API_SERVER_BASE_URL=${FINANCE_API_SERVER_BASE_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY Finance.WebAPI/finance-spa/ ./
COPY USER_MANUAL.md ./USER_MANUAL.md

RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/USER_MANUAL.md ./USER_MANUAL.md

EXPOSE 3000

CMD ["npm", "run", "start"]
