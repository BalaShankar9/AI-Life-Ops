FROM node:20-slim

# Install Python for the decision engine
RUN apt-get update && apt-get install -y python3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# Install all workspace dependencies
RUN npm ci

# Copy source code
COPY packages/shared/ packages/shared/
COPY packages/engine/ packages/engine/
COPY apps/api/ apps/api/

# Generate Prisma client
RUN cd apps/api && npx prisma generate

# Build shared package
RUN cd packages/shared && npm run build

# Build API
RUN cd apps/api && npm run build

EXPOSE 4000

CMD ["node", "apps/api/dist/index.js"]
