# GCP Deployment Guide for ORION Backend

## Prerequisites

1. **Google Cloud Account** with billing enabled
2. **gcloud CLI** installed ([Download here](https://cloud.google.com/sdk/docs/install))
3. **Docker** installed locally
4. **GCP Project** created

## Step 1: Initial GCP Setup

```bash
# Login to GCP
gcloud auth login

# Set your project ID
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  containerregistry.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com
```

## Step 2: Set Up Cloud SQL (PostgreSQL)

### Option A: Using Cloud SQL (Recommended for Production)

```bash
# Create Cloud SQL instance
gcloud sql instances create orion-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --root-password=YOUR_SECURE_PASSWORD

# Create database
gcloud sql databases create orion --instance=orion-db

# Create user
gcloud sql users create orion \
  --instance=orion-db \
  --password=YOUR_USER_PASSWORD

# Get connection name
gcloud sql instances describe orion-db --format="value(connectionName)"
```

### Option B: Using External PostgreSQL

Use any PostgreSQL database and configure the `DATABASE_URL` accordingly.

## Step 3: Create Secrets in Secret Manager

```bash
# Database URL
echo -n "postgresql://orion:YOUR_PASSWORD@/orion?host=/cloudsql/PROJECT_ID:REGION:orion-db" | \
  gcloud secrets create DATABASE_URL --data-file=-

# JWT Secret
echo -n "your-super-secret-jwt-key-$(openssl rand -hex 32)" | \
  gcloud secrets create JWT_SECRET --data-file=-

# OpenAI API Key
echo -n "YOUR_OPENAI_API_KEY" | \
  gcloud secrets create OPENAI_API_KEY --data-file=-

# Anthropic API Key (optional)
echo -n "YOUR_ANTHROPIC_API_KEY" | \
  gcloud secrets create ANTHROPIC_API_KEY --data-file=-

# Gmail credentials
echo -n "your-email@gmail.com" | \
  gcloud secrets create GMAIL_USER --data-file=-

echo -n "your-app-specific-password" | \
  gcloud secrets create GMAIL_APP_PASSWORD --data-file=-

# Frontend URL
echo -n "https://your-frontend-domain.com" | \
  gcloud secrets create FRONTEND_URL --data-file=-
```

## Step 4: Deploy Using Cloud Build (Recommended)

```bash
# Submit build
gcloud builds submit --config cloudbuild.yaml

# This will:
# 1. Build the Docker image
# 2. Push to Container Registry
# 3. Deploy to Cloud Run
```

## Step 5: Manual Deployment to Cloud Run

```bash
# Build and push image
docker build -t gcr.io/YOUR_PROJECT_ID/orion-backend:latest .
docker push gcr.io/YOUR_PROJECT_ID/orion-backend:latest

# Deploy to Cloud Run
gcloud run deploy orion-backend \
  --image gcr.io/YOUR_PROJECT_ID/orion-backend:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,GMAIL_USER=GMAIL_USER:latest,GMAIL_APP_PASSWORD=GMAIL_APP_PASSWORD:latest,FRONTEND_URL=FRONTEND_URL:latest \
  --add-cloudsql-instances YOUR_PROJECT_ID:us-central1:orion-db \
  --max-instances 10 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300
```

## Step 6: Run Database Migrations

```bash
# Get Cloud Run service URL
SERVICE_URL=$(gcloud run services describe orion-backend --region us-central1 --format="value(status.url)")

# Connect to Cloud SQL and run migrations
gcloud sql connect orion-db --user=postgres

# Or run migrations via Cloud Run Jobs
gcloud run jobs create orion-migrate \
  --image gcr.io/YOUR_PROJECT_ID/orion-backend:latest \
  --region us-central1 \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest \
  --add-cloudsql-instances YOUR_PROJECT_ID:us-central1:orion-db \
  --command="npx" \
  --args="prisma,migrate,deploy"

# Execute migration job
gcloud run jobs execute orion-migrate --region us-central1
```

## Step 7: Configure Domain (Optional)

```bash
# Map custom domain
gcloud run services add-iam-policy-binding orion-backend \
  --region=us-central1 \
  --member=allUsers \
  --role=roles/run.invoker

# Add domain mapping
gcloud run domain-mappings create \
  --service orion-backend \
  --domain api.yourdomain.com \
  --region us-central1
```

## Step 8: Set Up Continuous Deployment

### Using Cloud Build Triggers

1. Go to Cloud Build → Triggers
2. Click "Create Trigger"
3. Connect your GitHub/GitLab repository
4. Set trigger to run on push to `main` branch
5. Use `cloudbuild.yaml` configuration

## Local Testing with Docker

```bash
# Build image
docker build -t orion-backend:local .

# Run with docker-compose
docker-compose up -d

# Check logs
docker-compose logs -f backend

# Stop
docker-compose down
```

## Environment Variables

Make sure these are set in Secret Manager or Cloud Run environment:

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing secret
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic API key (optional)
- `GMAIL_USER` - Gmail email address
- `GMAIL_APP_PASSWORD` - Gmail app password
- `FRONTEND_URL` - Frontend URL for CORS
- `ENABLE_GUARDRAILS` - true
- `PII_MASKING_ENABLED` - false

## Monitoring and Logging

```bash
# View logs
gcloud run services logs read orion-backend --region us-central1 --limit 50

# Follow logs
gcloud run services logs tail orion-backend --region us-central1

# View metrics in Cloud Console
open "https://console.cloud.google.com/run/detail/us-central1/orion-backend/metrics"
```

## Cost Optimization

1. **Use Cloud SQL f1-micro** for development ($7/month)
2. **Cloud Run free tier**: 2M requests, 360k GB-seconds compute
3. **Set max instances** to prevent runaway costs
4. **Use concurrency** of 80-100 for better utilization
5. **Monitor billing** in Cloud Console

## Troubleshooting

### Issue: Database Connection Fails
```bash
# Check Cloud SQL instance
gcloud sql instances describe orion-db

# Test connection
gcloud sql connect orion-db --user=orion
```

### Issue: Container fails to start
```bash
# Check logs
gcloud run services logs read orion-backend --region us-central1 --limit 100

# Check deployment status
gcloud run services describe orion-backend --region us-central1
```

### Issue: Secrets not loading
```bash
# Verify secrets exist
gcloud secrets list

# Grant Cloud Run access to secrets
gcloud secrets add-iam-policy-binding DATABASE_URL \
  --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Quick Deploy Script

```bash
# Set your project ID
export GCP_PROJECT_ID=your-project-id

# Run deployment
./deploy-gcp.sh
```

## Production Checklist

- [ ] Cloud SQL instance created
- [ ] All secrets configured in Secret Manager
- [ ] Database migrations run successfully
- [ ] Health check endpoint working (`/health`)
- [ ] CORS configured for frontend domain
- [ ] Rate limiting configured
- [ ] Monitoring and alerting set up
- [ ] Backup strategy in place
- [ ] SSL/TLS enabled (automatic with Cloud Run)
- [ ] Custom domain mapped (optional)
- [ ] CI/CD pipeline configured

## Support

For issues or questions:
1. Check Cloud Run logs
2. Verify secrets are accessible
3. Test database connectivity
4. Review Cloud Build logs

## Additional Resources

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud SQL Documentation](https://cloud.google.com/sql/docs)
- [Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
- [Cloud Build Documentation](https://cloud.google.com/build/docs)

