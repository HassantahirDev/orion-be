# ORION Backend

Real-Time Multi-Agent Voice AI System for Autonomous Task Execution - Backend API

## Overview

ORION is a voice AI platform that handles speech input from a stream, thinks through several steps using large language models, executes external tools, and generates spoken responses. The backend is built with NestJS, Prisma, and PostgreSQL.

## Features

- **Authentication & Authorization**: JWT and API key authentication with RBAC
- **Session Management**: Multi-session voice conversation handling
- **Agent Planning**: Multi-step task planning using OpenAI/Anthropic LLMs
- **Tool Execution**: External tool execution with validation
- **Guardrails**: Input validation, prompt injection defense, PII masking, output filtering
- **Memory Store**: Context storage and retrieval for conversations
- **WebSocket Gateway**: Real-time voice streaming and event broadcasting
- **Rate Limiting**: Request throttling and backpressure handling
- **Observability**: Structured logging and monitoring

## Tech Stack

- **Framework**: NestJS
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Authentication**: JWT, API Keys
- **WebSocket**: Socket.IO
- **LLMs**: OpenAI GPT-4, Anthropic Claude
- **Logging**: Pino

## Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- npm or yarn

## Installation

1. Install dependencies:
```bash
npm install
```

2. Setup environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Setup database:
```bash
npm run prisma:migrate
npm run prisma:generate
```

4. (Optional) Seed database:
```bash
npm run prisma:studio
```

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/orion?schema=public"

# JWT
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d

# API Keys
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
ELEVENLABS_API_KEY=your-elevenlabs-api-key

# Server
PORT=3000
NODE_ENV=development

# CORS
FRONTEND_URL=http://localhost:3001

# Rate Limiting
RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=100

# Guardrails
ENABLE_GUARDRAILS=true
PII_MASKING_ENABLED=true
```

## Running the Application

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user
- `POST /api/v1/auth/api-keys` - Create API key
- `GET /api/v1/auth/api-keys` - List API keys
- `DELETE /api/v1/auth/api-keys/:id` - Revoke API key
- `GET /api/v1/auth/profile` - Get user profile

### Sessions
- `POST /api/v1/sessions` - Create session
- `GET /api/v1/sessions` - List sessions
- `GET /api/v1/sessions/:id` - Get session details
- `PATCH /api/v1/sessions/:id/status` - Update session status
- `GET /api/v1/sessions/:id/memory` - Get session memory

### Agent
- `POST /api/v1/agent/sessions/:sessionId/plan` - Plan task
- `POST /api/v1/agent/sessions/:sessionId/execute` - Execute plan

### Tools
- `GET /api/v1/tools` - List tools
- `GET /api/v1/tools/:id` - Get tool details
- `POST /api/v1/tools` - Create tool (Admin only)

### Memory
- `POST /api/v1/sessions/:sessionId/memory` - Add memory
- `GET /api/v1/sessions/:sessionId/memory` - Get memory context
- `GET /api/v1/sessions/:sessionId/memory/type/:type` - Get memory by type

### Guardrails (Admin only)
- `GET /api/v1/guardrails/logs` - Get guardrail logs

## WebSocket Events

### Client → Server
- `audio_input` - Send audio input
- `text_input` - Send text input
- `get_status` - Get session status

### Server → Client
- `connected` - Connection confirmed
- `audio_output` - Audio response
- `text_output` - Text response
- `agent_response` - Agent planning result
- `status` - Session status update
- `error` - Error message

## Architecture

- **Prisma Module**: Database access layer
- **Auth Module**: JWT and API key authentication
- **Users Module**: User management
- **Sessions Module**: Session lifecycle management
- **Guardrails Module**: Input/output validation and security
- **Agent Module**: Multi-step planning and execution
- **Tools Module**: External tool integration
- **Memory Module**: Context storage and retrieval
- **WebSocket Module**: Real-time communication

## Development

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Open Prisma Studio
npm run prisma:studio

# Build
npm run build
```

## Testing

```bash
# Run tests (when implemented)
npm test
```

## License

ISC

