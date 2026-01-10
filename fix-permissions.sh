#!/bin/bash

# Grant Cloud Run service account access to secrets
PROJECT_NUMBER="711675126560"
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "🔐 Granting Secret Manager access to Cloud Run service account..."
echo "Service Account: $SERVICE_ACCOUNT"
echo ""

# List of secrets to grant access to
SECRETS=("DATABASE_URL" "JWT_SECRET" "OPENAI_API_KEY" "GMAIL_USER" "GMAIL_APP_PASSWORD")

for SECRET in "${SECRETS[@]}"; do
  echo "  ✓ Granting access to $SECRET..."
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet
done

echo ""
echo "✅ Permissions granted! Now re-run deployment:"
echo "   gcloud run deploy orion-backend --source . --region us-central1"
