# Quick GCP Deployment (Using Existing Database)

Since you already have a cloud database configured, deployment is much simpler!

## Prerequisites

1. **gcloud CLI** installed
2. **Docker** installed
3. Your existing `.env` file with `DATABASE_URL`

## Step 1: Install gcloud CLI (if needed)

```bash
# macOS
brew install --cask google-cloud-sdk

# Or download from: https://cloud.google.com/sdk/docs/install
```

## Step 2: Setup GCP Project

```bash
# Login
gcloud auth login

# Create a new project (or use existing)
gcloud projects create YOUR_PROJECT_ID --name="ORION Backend"

# Set as active project
gcloud config set project YOUR_PROJECT_ID

# Enable billing (required)
# Visit: https://console.cloud.google.com/billing

# Enable required APIs
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  containerregistry.googleapis.com \
  secretmanager.googleapis.com
```

## Step 3: Create Secrets from Your .env File

```bash
cd backend

# Read from your existing .env and create secrets
export $(cat .env | grep -v '^#' | xargs)

# Database URL (your existing cloud database)
echo -n "$DATABASE_URL" | gcloud secrets create DATABASE_URL --data-file=-

# JWT Secret
echo -n "$JWT_SECRET" | gcloud secrets create JWT_SECRET --data-file=-

# OpenAI API Key
echo -n "$OPENAI_API_KEY" | gcloud secrets create OPENAI_API_KEY --data-file=-

# Anthropic API Key (if you have one)
echo -n "$ANTHROPIC_API_KEY" | gcloud secrets create ANTHROPIC_API_KEY --data-file=-

# Gmail credentials
echo -n "$GMAIL_USER" | gcloud secrets create GMAIL_USER --data-file=-
echo -n "$GMAIL_APP_PASSWORD" | gcloud secrets create GMAIL_APP_PASSWORD --data-file=-

# Frontend URL (update this to your actual frontend URL)
echo -n "https://your-frontend-domain.com" | gcloud secrets create FRONTEND_URL --data-file=-
```

## Step 4: Deploy to Cloud Run

```bash
# Build and deploy in one command
gcloud run deploy orion-backend \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,GMAIL_USER=GMAIL_USER:latest,GMAIL_APP_PASSWORD=GMAIL_APP_PASSWORD:latest,FRONTEND_URL=FRONTEND_URL:latest \
  --max-instances 10 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --port 3000
```

**That's it!** Your backend will be deployed in ~5 minutes.

## Step 5: Get Your Backend URL

```bash
# Get the deployed URL
gcloud run services describe orion-backend \
  --region us-central1 \
  --format="value(status.url)"

# Example output: https://orion-backend-xxxxx-uc.a.run.app
```

## Step 6: Update Frontend to Use New Backend URL

Update your frontend `.env` to point to the Cloud Run URL:

```bash
NEXT_PUBLIC_API_URL=https://orion-backend-xxxxx-uc.a.run.app/api/v1
```

## Step 7: Test the Deployment

```bash
# Get the URL
BACKEND_URL=$(gcloud run services describe orion-backend --region us-central1 --format="value(status.url)")

# Test health endpoint
curl $BACKEND_URL/health

# Should return: {"status":"ok"}
```

## Automated Deployment Script

Or use the automated script:

```bash
# Set your project ID
export GCP_PROJECT_ID=your-project-id

# Run deployment
./deploy-gcp.sh
```

## Update Deployment

To update your deployed service:

```bash
# Just run deploy again
gcloud run deploy orion-backend \
  --source . \
  --region us-central1
```

## View Logs

```bash
# View recent logs
gcloud run services logs read orion-backend --region us-central1 --limit 50

# Follow logs in real-time
gcloud run services logs tail orion-backend --region us-central1
```

## Cost Estimate

With your existing database:
- **Cloud Run**: $0 (within free tier for moderate usage)
- **Free tier includes**: 2M requests, 360k GB-seconds compute per month

## Troubleshooting

### Issue: Secrets not loading
```bash
# Grant Cloud Run service account access to secrets
PROJECT_NUMBER=$(gcloud projects describe $GCP_PROJECT_ID --format="value(projectNumber)")

for SECRET in DATABASE_URL JWT_SECRET OPENAI_API_KEY GMAIL_USER GMAIL_APP_PASSWORD FRONTEND_URL; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

### Issue: Database connection fails
- Ensure your database allows connections from Cloud Run IPs
- Check if your database requires SSL (may need to add `?sslmode=require` to DATABASE_URL)
- Verify the DATABASE_URL is correct

### Issue: CORS errors
Update the FRONTEND_URL secret to match your actual frontend domain.

## Next Steps

1. ✅ Backend deployed to Cloud Run
2. Update frontend to use new backend URL
3. Deploy frontend (Next.js) to Vercel/Netlify
4. Set up custom domain (optional)
5. Enable Cloud CDN (optional)

## Production Checklist

- [ ] All secrets configured
- [ ] Database accessible from Cloud Run
- [ ] Health check working
- [ ] CORS configured for frontend
- [ ] Environment variables set
- [ ] Logs monitored
- [ ] Backup strategy for database

