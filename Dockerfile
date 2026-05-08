# ============================================================
# EVzone NestJS Backend — Production Dockerfile
# ============================================================

FROM node:20-alpine AS builder

WORKDIR /app

ENV DATABASE_URL="postgresql://evzone:evzone_secret@localhost:5432/evzone_platform?schema=public"

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

# ============================================================
# Production Stage
# ============================================================
FROM node:20-alpine AS production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3000

CMD ["node", "dist/apps/api/src/main.js"]
