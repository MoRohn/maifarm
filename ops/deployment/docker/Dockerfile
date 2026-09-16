# Build stage
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
# Use npm install instead of npm ci to avoid ETXTBSY errors with esbuild
RUN npm install --legacy-peer-deps && \
    npm cache clean --force

# Copy source code
COPY . .

# Build the frontend application
RUN npm run build

# Build the backend (compile TypeScript)
# TODO: Fix TypeScript errors in backend before enabling this
# RUN npx tsc -p tsconfig.server.json

# Production dependencies stage
FROM node:20-alpine AS prod-deps

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
# Use npm install instead of npm ci to avoid ETXTBSY errors
RUN npm install --legacy-peer-deps --omit=dev && \
    npm cache clean --force

# Stage 3: Production stage
FROM node:20-alpine AS production

# Install production runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy built frontend from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy compiled server from builder stage
# TODO: Re-enable when backend TypeScript is fixed
# COPY --from=builder --chown=nodejs:nodejs /app/dist-server ./dist-server

# Copy server source for any runtime files (migrations, etc)
COPY --from=builder --chown=nodejs:nodejs /app/server ./server

# Copy public files
COPY --from=builder --chown=nodejs:nodejs /app/public ./public

# Copy package files
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Copy production node_modules from prod-deps stage
COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Install serve for static file serving
RUN npm install -g serve

# Create necessary directories
RUN mkdir -p /app/logs /app/uploads && \
    chown -R nodejs:nodejs /app/logs /app/uploads

# Set environment variables
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0

# Expose ports
EXPOSE 3000 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Switch to non-root user
USER nodejs

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
# For now, serve the static frontend files with a simple server
CMD ["serve", "-s", "dist", "-l", "3000"]