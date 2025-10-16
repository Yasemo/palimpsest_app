# Palimpsest PR Content Management Platform

A comprehensive PR initiative application designed to enhance the PR efforts of the Canadian Muslim community by leveraging AI and automation to expedite the process of finding, creating, and distributing newsworthy content to media outlets.

## 🎯 Overview

Palimpsest uses AI to synthesize information from professionals/spokespersons, media/journalists, and web search news to produce newsworthy content such as story pitches, available-to-comment emails, and op-eds.

## 🛠️ Tech Stack

- **Runtime**: Deno
- **Frontend**: Vanilla JavaScript, HTML, CSS (SPA)
- **Database**: Neon PostgreSQL
- **AI Services**: 
  - Perplexity API (web search)
  - OpenRouter API (LLM access)
- **Email**: Gmail API
- **Deployment**: Google Cloud Run

## ✨ Features

### 1. **Integrations Management**
- Connect to third-party services (Perplexity, OpenRouter, Gmail)
- View integration status
- Environment-based configuration

### 2. **Sources**
- Configure Perplexity web searches as data sources
- Schedule automated searches
- Store and view search results
- Manual execution on demand

### 3. **Queries**
- Create batch queries to retrieve data from database
- Generate "Info Packages" with directives for AI
- Schedule automated query execution
- Combine multiple data sources

### 4. **AI Configuration**
- Select and configure OpenRouter models
- Set custom system prompts
- Adjust temperature and other parameters
- Support for multiple LLM providers (GPT-4, Claude, Gemini, etc.)

### 5. **Content Management**
- View AI-generated content in card grid
- Edit content manually
- Chat with AI to refine content
- Per-content chat history
- Delete unwanted content

### 6. **Outputs**
- Schedule content delivery to Gmail
- Create draft emails automatically
- Date-based content filtering
- Execution logs and tracking

### 7. **Automated Scheduling**
- Local scheduler for development (setInterval)
- Google Cloud Scheduler integration for production
- Configurable cron expressions
- Automatic info package processing

## 📋 Prerequisites

- [Deno](https://deno.land/) installed (v1.40.0 or later)
- [Neon PostgreSQL](https://neon.tech/) database account
- API keys for:
  - [Perplexity API](https://www.perplexity.ai/)
  - [OpenRouter API](https://openrouter.ai/)
  - Gmail OAuth credentials (optional) - See [GMAIL_OAUTH_SETUP.md](GMAIL_OAUTH_SETUP.md)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd palimpsest_app
```

### 2. Set Up Environment Variables

The `.env` file is already created. Update it with your credentials:

**Important: Neon Database Connection String**

Your Neon connection string must include `?sslmode=require` at the end:
```
postgresql://[user]:[password]@[endpoint].neon.tech/[database]?sslmode=require
```

To get your Neon connection string:
1. Log in to [Neon Console](https://console.neon.tech)
2. Select your project
3. Go to **Connection Details**
4. Copy the connection string (includes your password)
5. Ensure it ends with `?sslmode=require`

```env
# Database - Neon PostgreSQL (with sslmode=require)
DATABASE_URL=postgresql://your-user:your-password@ep-example-123456.region.aws.neon.tech/neondb?sslmode=require

# Perplexity API
PERPLEXITY_API_KEY=your_perplexity_api_key

# OpenRouter API
OPENROUTER_API_KEY=your_openrouter_api_key

# Gmail OAuth (Optional)
GMAIL_CLIENT_ID=your_gmail_client_id
GMAIL_CLIENT_SECRET=your_gmail_client_secret
GMAIL_REFRESH_TOKEN=your_gmail_refresh_token
GMAIL_USER_EMAIL=your_email@gmail.com

# Server
ENVIRONMENT=local
PORT=8000
```

### 3. Set Up the Database

Run the database setup script to create all necessary tables:

```bash
deno task db:setup
```

### 4. Start the Development Server

```bash
deno task dev
```

The application will be available at `http://localhost:8000`

## 📖 Usage Guide

### Creating a Source

1. Navigate to the **Sources** tab
2. Click **"+ Create Source"**
3. Enter a name and search prompt
4. The source will execute on schedule or manually

### Setting Up Queries

1. Go to the **Queries** tab
2. Click **"+ Create Query"**
3. Enter a name and directive for the AI
4. Configure which sources to query
5. Execute manually or set a schedule

### Configuring AI

1. Visit the **AI** tab
2. Select your preferred OpenRouter model (e.g., `openai/gpt-4o`)
3. Set the system prompt to guide AI behavior
4. Adjust temperature for creativity control

### Managing Content

1. Navigate to the **Content** tab
2. Click any content card to view/edit
3. Use the AI chat editor to refine content
4. Save manual edits
5. Delete unwanted content

### Creating Outputs

1. Go to the **Outputs** tab
2. Click **"+ Create Output"**
3. Enter recipient email and subject
4. Execute to send content as Gmail drafts

## 🔧 Configuration

### Scheduling (Local Development)

The local scheduler runs automatically when `ENVIRONMENT=local`:
- Sources: Every 5 minutes
- Queries: Every 10 minutes
- Info Package Processing: Every 15 minutes
- Outputs: Every 30 minutes

### Scheduling (Production)

For production deployment on Google Cloud Run, set up Google Cloud Scheduler jobs:

```bash
# Execute sources
gcloud scheduler jobs create http execute-sources \
  --schedule="*/5 * * * *" \
  --uri="https://your-app-url/webhooks/execute-sources" \
  --http-method=POST

# Execute queries
gcloud scheduler jobs create http execute-queries \
  --schedule="*/10 * * * *" \
  --uri="https://your-app-url/webhooks/execute-queries" \
  --http-method=POST

# Process packages
gcloud scheduler jobs create http process-packages \
  --schedule="*/15 * * * *" \
  --uri="https://your-app-url/webhooks/process-packages" \
  --http-method=POST

# Execute outputs
gcloud scheduler jobs create http execute-outputs \
  --schedule="*/30 * * * *" \
  --uri="https://your-app-url/webhooks/execute-outputs" \
  --http-method=POST
```

## 🚢 Deployment to Google Cloud Run

### 1. Build and Push Docker Image

```bash
# Set your project ID
export PROJECT_ID=your-gcp-project-id

# Build the image
docker build -t gcr.io/$PROJECT_ID/palimpsest:latest .

# Push to Google Container Registry
docker push gcr.io/$PROJECT_ID/palimpsest:latest
```

### 2. Deploy to Cloud Run

```bash
gcloud run deploy palimpsest \
  --image gcr.io/$PROJECT_ID/palimpsest:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars ENVIRONMENT=production \
  --set-env-vars DATABASE_URL="your-neon-db-url" \
  --set-env-vars PERPLEXITY_API_KEY="your-key" \
  --set-env-vars OPENROUTER_API_KEY="your-key"
```

### 3. Set Up Cloud Scheduler (see Configuration section above)

## 📁 Project Structure

```
palimpsest_app/
├── server/
│   ├── main.ts                 # Server entry point
│   ├── config.ts               # Environment configuration
│   ├── db/
│   │   ├── schema.sql          # Database schema
│   │   ├── client.ts           # Database client
│   │   └── setup.ts            # Setup script
│   ├── integrations/
│   │   ├── base.ts             # Base integration class
│   │   ├── perplexity.ts       # Perplexity integration
│   │   ├── openrouter.ts       # OpenRouter integration
│   │   └── gmail.ts            # Gmail integration
│   ├── routes/
│   │   ├── sources.ts          # Sources API
│   │   ├── queries.ts          # Queries API
│   │   ├── ai.ts               # AI configuration API
│   │   ├── content.ts          # Content management API
│   │   └── outputs.ts          # Outputs API
│   └── schedulers/
│       └── local.ts            # Local development scheduler
├── public/
│   ├── index.html              # Main HTML
│   ├── css/
│   │   └── styles.css          # Application styles
│   └── js/
│       ├── api.js              # API client
│       ├── router.js           # SPA router
│       ├── app.js              # App initialization
│       └── components/         # UI components
├── .env                        # Environment variables
├── deno.json                   # Deno configuration
├── Dockerfile                  # Docker configuration
└── README.md                   # This file
```

## 🔌 API Endpoints

### Sources
- `GET /api/sources` - List all sources
- `POST /api/sources` - Create source
- `PUT /api/sources/:id` - Update source
- `DELETE /api/sources/:id` - Delete source
- `POST /api/sources/:id/execute` - Execute source
- `GET /api/sources/:id/results` - Get results

### Queries
- `GET /api/queries` - List all queries
- `POST /api/queries` - Create query
- `PUT /api/queries/:id` - Update query
- `DELETE /api/queries/:id` - Delete query
- `POST /api/queries/:id/execute` - Execute query
- `GET /api/queries/:id/packages` - Get info packages

### AI
- `GET /api/ai/config` - Get AI configuration
- `PUT /api/ai/config` - Update AI configuration
- `GET /api/ai/models` - Get available models
- `POST /api/ai/process/:packageId` - Process info package

### Content
- `GET /api/content` - List all content
- `GET /api/content/:id` - Get content item
- `PUT /api/content/:id` - Update content
- `DELETE /api/content/:id` - Delete content
- `POST /api/content/:id/chat` - Chat with AI

### Outputs
- `GET /api/outputs` - List all outputs
- `POST /api/outputs` - Create output
- `PUT /api/outputs/:id` - Update output
- `DELETE /api/outputs/:id` - Delete output
- `POST /api/outputs/:id/execute` - Execute output
- `GET /api/outputs/:id/logs` - Get execution logs

### Integrations
- `GET /api/integrations/status` - Check integration status

### Health
- `GET /health` - Health check endpoint

## 🔒 Security Notes

- Never commit `.env` file to version control
- Use environment variables for all sensitive data
- Gmail OAuth requires proper setup in Google Cloud Console
- API keys should have appropriate rate limits
- Consider implementing authentication for production use

## 🤝 Contributing

This is a private PR initiative project. For contributions or questions, please contact the project maintainers.

## 📄 License

[License information to be added]

## 🆘 Troubleshooting

### Database Connection Issues
- Verify DATABASE_URL is correct
- Check Neon database is accessible
- Run `deno task db:setup` to initialize tables

### API Key Errors
- Ensure all required API keys are set in `.env`
- Verify keys are valid and have sufficient credits
- Check integration status in the Integrations tab

### Gmail Integration Not Working
- Verify OAuth credentials are correct
- Ensure refresh token is still valid
- Check Gmail API is enabled in Google Cloud Console

### Scheduler Not Running
- For local: Ensure `ENVIRONMENT=local` is set
- For production: Verify Cloud Scheduler jobs are created
- Check server logs for scheduler execution messages

## 📞 Support

For support, please contact the development team or create an issue in the repository.

---

Built with ❤️ for the Canadian Muslim community
