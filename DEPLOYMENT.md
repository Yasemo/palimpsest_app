# Palimpsest - Google Cloud Deployment Guide

This guide covers deploying Palimpsest to Google Cloud Run using a Docker image pushed to Artifact Registry, with Google Cloud Scheduler for automated task execution.

## Prerequisites

- Google Cloud account with billing enabled
- `gcloud` CLI installed and configured
- `docker` installed locally
- A Neon PostgreSQL database (or other accessible PostgreSQL database)

## Table of Contents

1. [Environment Variables](#environment-variables)
2. [Building and Pushing Docker Image](#building-and-pushing-docker-image)
3. [Deploying to Cloud Run](#deploying-to-cloud-run)
4. [Setting Up Cloud Scheduler](#setting-up-cloud-scheduler)
5. [Testing the Deployment](#testing-the-deployment)
6. [Troubleshooting](#troubleshooting)

---

## Environment Variables

Your Cloud Run service needs the following environment variables:

### Required Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@host/database

# API Keys
PERPLEXITY_API_KEY=your_perplexity_key
OPENROUTER_API_KEY=your_openrouter_key

# Authentication (for production)
AUTH_USERNAME=your_admin_username
AUTH_PASSWORD=your_secure_password
JWT_SECRET=your_random_jwt_secret_min_32_chars
WEBHOOK_SECRET=your_random_webhook_secret

# Server Configuration
ENVIRONMENT=production
PORT=8080
```

### Optional Variables

```bash
# Airtable (if using Airtable integration)
AIRTABLE_API_KEY=your_airtable_key

# Gmail (if using Gmail output)
GMAIL_CLIENT_ID=your_gmail_client_id
GMAIL_CLIENT_SECRET=your_gmail_client_secret
GMAIL_REFRESH_TOKEN=your_gmail_refresh_token
GMAIL_USER_EMAIL=your_gmail_email

# AI Model Configuration
DEFAULT_AI_MODEL=openai/gpt-4o
DEFAULT_CONTENT_EDITOR_MODEL=anthropic/claude-3.5-sonnet

# JWT Configuration
JWT_EXPIRY_HOURS=24
```

---

## Building and Pushing Docker Image

### 1. Set Your Variables

```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="us-east1"
export REPOSITORY="palimpsest"
export IMAGE_NAME="palimpsest-app"
export IMAGE_TAG="latest"
```

### 2. Enable Required APIs

```bash
gcloud services enable \
    artifactregistry.googleapis.com \
    run.googleapis.com \
    cloudscheduler.googleapis.com \
    cloudbuild.googleapis.com \
    --project=$PROJECT_ID
```

### 3. Create Artifact Registry Repository

```bash
gcloud artifacts repositories create $REPOSITORY \
    --repository-format=docker \
    --location=$REGION \
    --description="Palimpsest Docker images" \
    --project=$PROJECT_ID
```

### 4. Configure Docker Authentication

```bash
gcloud auth configure-docker ${REGION}-docker.pkg.dev
```

### 5. Build the Docker Image

```bash
docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG} .
```

### 6. Push to Artifact Registry

```bash
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}
```

---

## Deploying to Cloud Run

### Option 1: Using gcloud CLI

```bash
gcloud run deploy palimpsest-app \
    --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG} \
    --platform=managed \
    --region=$REGION \
    --allow-unauthenticated \
    --memory=512Mi \
    --cpu=1 \
    --max-instances=10 \
    --min-instances=0 \
    --timeout=300 \
    --set-env-vars="ENVIRONMENT=production,PORT=8080" \
    --project=$PROJECT_ID
```

### Option 2: Set Environment Variables Separately

For security, it's better to set sensitive environment variables separately:

```bash
gcloud run services update palimpsest-app \
    --update-env-vars="\
DATABASE_URL=postgresql://user:password@host/database,\
PERPLEXITY_API_KEY=your_key,\
OPENROUTER_API_KEY=your_key,\
AUTH_USERNAME=admin,\
AUTH_PASSWORD=your_secure_password,\
JWT_SECRET=your_jwt_secret,\
WEBHOOK_SECRET=your_webhook_secret,\
ENVIRONMENT=production,\
PORT=8080" \
    --region=$REGION \
    --project=$PROJECT_ID
```

### Get Service URL

```bash
gcloud run services describe palimpsest-app \
    --region=$REGION \
    --project=$PROJECT_ID \
    --format='value(status.url)'
```

Save this URL - you'll need it for Cloud Scheduler.

---

## Setting Up Cloud Scheduler

Cloud Scheduler will trigger your scheduled tasks via webhooks.

### Architecture

Your app uses **2 scheduled tasks**:

1. **Queries Execution** (`/webhooks/execute-queries`)
   - Runs scheduled queries
   - Fetches data from sources
   - Creates info packages
   - Auto-processes with AI if enabled
   - Runs every 1 minute

2. **Outputs Execution** (`/webhooks/execute-outputs`)
   - Sends content via configured outputs (Gmail, etc.)
   - Runs every 1 minute

> **Note**: Sources are executed within queries (not separately scheduled), and packages are auto-processed with AI within queries (not separately scheduled).

### Setup Steps

#### 1. Set Variables

```bash
export SERVICE_URL="your-cloud-run-service-url"  # From previous step
export WEBHOOK_SECRET="your-webhook-secret"       # Same as in env vars
```

#### 2. Create Queries Execution Job

This runs every minute to process queries:

```bash
gcloud scheduler jobs create http execute-queries \
    --location=$REGION \
    --schedule="* * * * *" \
    --uri="${SERVICE_URL}/webhooks/execute-queries" \
    --http-method=POST \
    --headers="Authorization=Bearer ${WEBHOOK_SECRET}" \
    --time-zone="America/New_York" \
    --description="Execute scheduled queries every minute" \
    --project=$PROJECT_ID
```

**Cron Schedule**: `* * * * *` = Every minute

#### 3. Create Outputs Execution Job

This runs every minute to send outputs:

```bash
gcloud scheduler jobs create http execute-outputs \
    --location=$REGION \
    --schedule="* * * * *" \
    --uri="${SERVICE_URL}/webhooks/execute-outputs" \
    --http-method=POST \
    --headers="Authorization=Bearer ${WEBHOOK_SECRET}" \
    --time-zone="America/New_York" \
    --description="Execute scheduled outputs every minute" \
    --project=$PROJECT_ID
```

#### 4. List and Verify Jobs

```bash
gcloud scheduler jobs list --location=$REGION --project=$PROJECT_ID
```

You should see 2 jobs listed:
- `execute-queries`
- `execute-outputs`

#### 5. Manually Trigger a Job (for testing)

```bash
gcloud scheduler jobs run execute-queries --location=$REGION --project=$PROJECT_ID
```

### Adjusting Schedule Frequency

If you want to run jobs less frequently, modify the cron schedule:

**Every 5 minutes:**
```bash
gcloud scheduler jobs update http execute-queries \
    --schedule="*/5 * * * *" \
    --location=$REGION
```

**Every 15 minutes:**
```bash
gcloud scheduler jobs update http execute-queries \
    --schedule="*/15 * * * *" \
    --location=$REGION
```

**Every hour:**
```bash
gcloud scheduler jobs update http execute-queries \
    --schedule="0 * * * *" \
    --location=$REGION
```

---

## Testing the Deployment

### 1. Health Check

```bash
curl ${SERVICE_URL}/health
```

Expected response:
```json
{"status":"ok","timestamp":"2025-10-18T05:30:00.000Z"}
```

### 2. Test Login

Visit your Cloud Run URL in a browser and you should see the login page. Use the credentials you set in `AUTH_USERNAME` and `AUTH_PASSWORD`.

### 3. Test Webhook Manually

You can test the webhook endpoint directly:

```bash
curl -X POST \
  -H "Authorization: Bearer ${WEBHOOK_SECRET}" \
  ${SERVICE_URL}/webhooks/execute-queries
```

Expected response:
```json
{
  "success": true,
  "message": "Executed N queries",
  "details": [...]
}
```

### 4. Check Logs

```bash
gcloud run services logs read palimpsest-app \
    --region=$REGION \
    --project=$PROJECT_ID \
    --limit=50
```

Look for log entries like:
```
[CLOUD-SCHEDULER] Executing scheduled queries...
[CLOUD-SCHEDULER] Found X queries due for execution
[CLOUD-SCHEDULER] ✓ Completed: "Query Name" in 2.5s
```

### 5. Monitor Cloud Scheduler

```bash
# View job execution history
gcloud scheduler jobs describe execute-queries \
    --location=$REGION \
    --project=$PROJECT_ID
```

---

## Updating the Deployment

When you make changes to your code:

### 1. Rebuild and Push New Image

```bash
# Increment tag or use latest
export IMAGE_TAG="v1.1.0"

docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG} .
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}
```

### 2. Update Cloud Run Service

```bash
gcloud run services update palimpsest-app \
    --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG} \
    --region=$REGION \
    --project=$PROJECT_ID
```

Cloud Run will perform a rolling update with zero downtime.

---

## Troubleshooting

### Issue: Authentication failing in production

**Solution:** Verify environment variables are set correctly:

```bash
gcloud run services describe palimpsest-app \
    --region=$REGION \
    --project=$PROJECT_ID \
    --format='value(spec.template.spec.containers[0].env)'
```

### Issue: Webhooks returning 401 Unauthorized

**Solution:** Ensure the `WEBHOOK_SECRET` matches between Cloud Run environment variables and Cloud Scheduler job headers.

To update the webhook secret in scheduler:
```bash
gcloud scheduler jobs update http execute-queries \
    --headers="Authorization=Bearer ${NEW_WEBHOOK_SECRET}" \
    --location=$REGION
```

### Issue: Database connection failing

**Solution:** 
1. Check that your DATABASE_URL is correct
2. If using Neon, ensure the connection string includes SSL parameters
3. Verify network connectivity from Cloud Run to your database
4. Check Neon connection pooling settings

### Issue: Scheduler jobs not triggering

**Solution:**
1. Check job status: `gcloud scheduler jobs describe execute-queries --location=$REGION`
2. Look for `state: ENABLED` (if `PAUSED`, resume it)
3. View logs: `gcloud run services logs read palimpsest-app --region=$REGION`
4. Manually trigger to test: `gcloud scheduler jobs run execute-queries --location=$REGION`
5. Check the `lastAttemptTime` and `status` in job description

### Issue: High memory usage or timeouts

**Solution:** Increase memory allocation:

```bash
gcloud run services update palimpsest-app \
    --memory=1Gi \
    --cpu=2 \
    --timeout=540 \
    --region=$REGION \
    --project=$PROJECT_ID
```

### Issue: No queries executing

**Solution:**
1. Verify queries exist in database with `schedule` field set
2. Check `next_run_at` is not in the future
3. Ensure `active = true` on queries
4. Look at Cloud Run logs for execution details

---

## Security Best Practices

### 1. Use Secret Manager

For production, use Google Secret Manager instead of environment variables:

```bash
# Create secrets
echo -n "your_password" | gcloud secrets create auth-password \
    --data-file=- \
    --replication-policy="automatic" \
    --project=$PROJECT_ID

echo -n "your_jwt_secret" | gcloud secrets create jwt-secret \
    --data-file=- \
    --replication-policy="automatic" \
    --project=$PROJECT_ID

# Reference in Cloud Run
gcloud run services update palimpsest-app \
    --update-secrets="\
AUTH_PASSWORD=auth-password:latest,\
JWT_SECRET=jwt-secret:latest,\
WEBHOOK_SECRET=webhook-secret:latest" \
    --region=$REGION \
    --project=$PROJECT_ID
```

### 2. Restrict Access

Use IAM to control who can access your Cloud Run service:

```bash
# Remove public access
gcloud run services remove-iam-policy-binding palimpsest-app \
    --member="allUsers" \
    --role="roles/run.invoker" \
    --region=$REGION

# Add specific users
gcloud run services add-iam-policy-binding palimpsest-app \
    --member="user:your-email@example.com" \
    --role="roles/run.invoker" \
    --region=$REGION
```

### 3. Enable VPC Connector

For additional security when connecting to databases:

```bash
gcloud run services update palimpsest-app \
    --vpc-connector=YOUR_VPC_CONNECTOR \
    --vpc-egress=private-ranges-only \
    --region=$REGION
```

### 4. Regular Updates

- Keep Docker base image updated
- Update Deno and dependencies regularly
- Monitor security advisories

### 5. Monitor Logs

Set up log-based alerts for errors:

```bash
gcloud logging metrics create error_count \
    --description="Count of error logs" \
    --log-filter='resource.type="cloud_run_revision" AND severity="ERROR"'
```

---

## Cost Optimization

### Cloud Scheduler Pricing

- First 3 jobs per month: **FREE**
- Additional jobs: $0.10 per job per month

Since you have 2 jobs: **$0.00/month** (within free tier)

### Cloud Run Pricing

Cloud Run charges for:
- CPU and memory usage while handling requests
- Number of requests

With `--min-instances=0`, your service scales to zero when idle, minimizing costs.

**Typical costs for light usage:**
- ~$0-5/month for occasional use
- ~$10-30/month for moderate use

### Cost Reduction Tips

1. **Adjust scheduler frequency**: Run less often if real-time isn't needed
2. **Optimize query execution**: Combine multiple small queries
3. **Use connection pooling**: Reduces database connection overhead
4. **Monitor and set budget alerts**

---

## Useful Commands

```bash
# View service details
gcloud run services describe palimpsest-app --region=$REGION

# View recent logs
gcloud run services logs tail palimpsest-app --region=$REGION

# Follow logs in real-time
gcloud run services logs tail palimpsest-app --region=$REGION --follow

# Update environment variable
gcloud run services update palimpsest-app \
    --update-env-vars="KEY=value" \
    --region=$REGION

# Delete service
gcloud run services delete palimpsest-app --region=$REGION

# Pause scheduler job
gcloud scheduler jobs pause execute-queries --location=$REGION

# Resume scheduler job
gcloud scheduler jobs resume execute-queries --location=$REGION

# Update scheduler job schedule
gcloud scheduler jobs update http execute-queries \
    --schedule="*/5 * * * *" \
    --location=$REGION

# Delete scheduler job
gcloud scheduler jobs delete execute-queries --location=$REGION

# View all scheduler jobs
gcloud scheduler jobs list --location=$REGION
```

---

## Quick Start Checklist

- [ ] Set up Google Cloud project with billing enabled
- [ ] Install `gcloud` CLI and authenticate
- [ ] Set up Neon PostgreSQL database
- [ ] Configure `.env` file with all required variables
- [ ] Build Docker image
- [ ] Push to Artifact Registry
- [ ] Deploy to Cloud Run with environment variables
- [ ] Get Cloud Run service URL
- [ ] Create 2 Cloud Scheduler jobs
- [ ] Test webhooks manually
- [ ] Verify logs show scheduler execution
- [ ] Set up monitoring and alerts

---

## Support

For issues specific to:
- **Palimpsest**: Check application logs and verify configuration
- **Deno**: https://deno.land/manual
- **Google Cloud Run**: https://cloud.google.com/run/docs
- **Google Cloud Scheduler**: https://cloud.google.com/scheduler/docs
- **Docker**: https://docs.docker.com/
- **Neon PostgreSQL**: https://neon.tech/docs

---

## License

[Your License Here]
