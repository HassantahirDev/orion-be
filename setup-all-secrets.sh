#!/bin/bash

echo "🔐 Setting up all secrets from .env..."
echo ""

# Load .env file
export $(cat .env | grep -v '^#' | grep -v '^$' | xargs)

create_or_update_secret() {
  local SECRET_NAME=$1
  local SECRET_VALUE=$2
  
  if [ -z "$SECRET_VALUE" ]; then
    echo "⚠️  Skipping $SECRET_NAME (empty value)"
    return
  fi
  
  # Check if secret exists
  if gcloud secrets describe $SECRET_NAME &> /dev/null; then
    echo "  📌 Updating: $SECRET_NAME"
    echo -n "$SECRET_VALUE" | gcloud secrets versions add $SECRET_NAME --data-file=- 2>/dev/null
  else
    echo "  ➕ Creating: $SECRET_NAME"
    echo -n "$SECRET_VALUE" | gcloud secrets create $SECRET_NAME --data-file=- 2>/dev/null
  fi
  
  # Grant access to Cloud Run service account
  gcloud secrets add-iam-policy-binding $SECRET_NAME \
    --member="serviceAccount:711675126560-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet 2>/dev/null
}

# Create/update all secrets
create_or_update_secret "DATABASE_URL" "$DATABASE_URL"
create_or_update_secret "JWT_SECRET" "$JWT_SECRET"
create_or_update_secret "JWT_EXPIRES_IN" "$JWT_EXPIRES_IN"
create_or_update_secret "OPENAI_API_KEY" "$OPENAI_API_KEY"
create_or_update_secret "ANTHROPIC_API_KEY" "$ANTHROPIC_API_KEY"
create_or_update_secret "ELEVENLABS_API_KEY" "$ELEVENLABS_API_KEY"
create_or_update_secret "FRONTEND_URL" "$FRONTEND_URL"
create_or_update_secret "GMAIL_USER" "$GMAIL_USER"
create_or_update_secret "GMAIL_APP_PASSWORD" "$GMAIL_APP_PASSWORD"

echo ""
echo "✅ All secrets configured!"
