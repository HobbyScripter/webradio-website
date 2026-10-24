#!/bin/bash
# Setup script for local development environment
# Run this script to create a .env file with a generated NEXTAUTH_SECRET

echo "Creating .env file for local development..."

# Generate NEXTAUTH_SECRET
SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")

# Create .env file
cat > .env <<EOF
# WebRadio Website - Local Development Environment
# DO NOT COMMIT THIS FILE TO GIT

# Database - Replace with your actual PostgreSQL connection string
DATABASE_URL="postgresql://username:password@localhost:5432/webradio_dev?sslmode=prefer"

# NextAuth
NEXTAUTH_SECRET="$SECRET"
NEXTAUTH_URL="http://localhost:3000"

# Object Storage - Configure for local development or use a test bucket
STORAGE_ENDPOINT=""
STORAGE_ACCESS_KEY=""
STORAGE_SECRET_KEY=""
STORAGE_BUCKET=""
STORAGE_REGION=""

# Email Service - Configure for local development
EMAIL_FROM="noreply@webradio.local"
EMAIL_SERVER_HOST=""
EMAIL_SERVER_PORT="587"
EMAIL_SERVER_USER=""
EMAIL_SERVER_PASSWORD=""

# GitHub Integration (Optional)
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
GITHUB_WEBHOOK_SECRET=""

# Application
NODE_ENV="development"
EOF

echo ".env file created successfully!"
echo "Generated NEXTAUTH_SECRET: $SECRET"
echo ""
echo "Next steps:"
echo "1. Edit .env and replace DATABASE_URL with your actual PostgreSQL connection string"
echo "2. Configure STORAGE_* variables for object storage (or leave empty for development)"
echo "3. Configure EMAIL_* variables for email service (or leave empty for development)"
echo "4. Run: npm run prisma:db:init to initialize the database"
