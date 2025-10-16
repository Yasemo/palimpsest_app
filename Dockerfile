# Dockerfile for Palimpsest App - Google Cloud Run Deployment

FROM denoland/deno:1.40.0

# Set working directory
WORKDIR /app

# Copy dependency files
COPY deno.json .
COPY server/ ./server/
COPY public/ ./public/

# Cache dependencies
RUN deno cache server/main.ts

# Copy environment file (will be overridden by Cloud Run secrets)
COPY .env .env

# Expose port
EXPOSE 8000

# Run the application
CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-env", "--allow-write", "server/main.ts"]
