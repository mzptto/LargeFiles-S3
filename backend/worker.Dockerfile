# Dockerfile for Fargate worker container
# Base image: Node.js 18 Alpine from AWS Public ECR (avoids Docker Hub rate limits)
FROM public.ecr.aws/docker/library/node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built TypeScript files (dist directory)
COPY dist/ ./dist/

# Set environment variables
ENV NODE_ENV=production

# Set entrypoint to worker script
ENTRYPOINT ["node", "dist/worker/index.js"]
