#!/bin/bash

# ORION Backend - GCP Deployment Script
# This script deploys the backend to Google Cloud Platform
# Assumes you already have a cloud database configured in .env

set -e

echo "🚀 ORION Backend - GCP Deployment"
echo "=================================="

# Check if required environment variables are set
if [ -z "$GCP_PROJECT_ID" ]; then
  echo "❌ Error: GCP_PROJECT_ID environment variable is not set"
  echo "Usage: GCP_PROJECT_ID=your-project-id ./deploy-gcp.sh"
  exit 1
fi

PROJECT_ID=$GCP_PROJECT_ID
REGION=${GCP_REGION:-us-central1}
SERVICE_NAME="orion-backend"

echo "📋 Configuration:"
echo "  Project ID: $PROJECT_ID"
echo "  Region: $REGION"
echo "  Service: $SERVICE_NAME"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
  echo "❌ gcloud CLI is not installed"
  echo "Install it from: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
  echo "❌ .env file not found"
  echo "Please create a .env file with your configuration"
  exit 1
fi

# Authenticate with GCP
echo "🔐 Checking GCP authentication..."
gcloud auth list

# Set the project
echo "📦 Setting GCP project..."
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "🔌 Enabling required GCP APIs..."
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  containerregistry.googleapis.com \
  secretmanager.googleapis.com

# Load .env file
echo "📝 Loading environment variables from .env..."
export $(cat .env | grep -v '^#' | xargs)

# Create secrets in Secret Manager
echo "🔐 Creating secrets in Secret Manager..."

create_secret() {
  local SECRET_NAME=$1
  local SECRET_VALUE=$2
  
  if [ -z "$SECRET_VALUE" ]; then
    echo "⚠️  Skipping $SECRET_NAME (not set in .env)"
    return
  fi
  
  # Check if secret exists
  if gcloud secrets describe $SECRET_NAME &> /dev/null; then
    echo "  📌 Updating existing secret: $SECRET_NAME"
    echo -n "$SECRET_VALUE" | gcloud secrets versions add $SECRET_NAME --data-file=-
  else
    echo "  ➕ Creating new secret: $SECRET_NAME"
    echo -n "$SECRET_VALUE" | gcloud secrets create $SECRET_NAME --data-file=-
  fi
}

create_secret "DATABASE_URL" "$DATABASE_URL"
create_secret "JWT_SECRET" "$JWT_SECRET"
create_secret "OPENAI_API_KEY" "$OPENAI_API_KEY"
create_secret "ANTHROPIC_API_KEY" "$ANTHROPIC_API_KEY"
create_secret "GMAIL_USER" "$GMAIL_USER"
create_secret "GMAIL_APP_PASSWORD" "$GMAIL_APP_PASSWORD"
create_secret "FRONTEND_URL" "$FRONTEND_URL"

echo ""
echo "🐳 Building and deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,GMAIL_USER=GMAIL_USER:latest,GMAIL_APP_PASSWORD=GMAIL_APP_PASSWORD:latest \
  --max-instances 10 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --port 3000

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format="value(status.url)")

echo ""
echo "✅ Deployment successful!"
echo ""
echo "📍 Your backend is now available at:"
echo "   $SERVICE_URL"
echo ""
echo "🧪 Test your deployment:"
echo "   curl $SERVICE_URL/health"
echo ""
echo "📝 Update your frontend .env with:"
echo "   NEXT_PUBLIC_API_URL=$SERVICE_URL/api/v1"
echo ""
echo "📊 View logs:"
echo "   gcloud run services logs tail $SERVICE_NAME --region $REGION"


