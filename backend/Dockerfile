# Dockerfile for Fargate Worker Container
# Base image: Node.js 18 Alpine for smaller image size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application code
COPY dist/ ./dist/

# Set environment variables (will be overridden by Fargate task definition)
ENV NODE_ENV=production

# Run the worker entry point
CMD ["node", "dist/index.js"]
