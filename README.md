# agpile search prototype

prototype that indexes the contents of a unity catalog to a solr instance & has a web front end to allow for searching; updated to allow for searching via chat with llm
## Architecture

- **Web Service**: Next.js application with frontend and API backend
- **Solr**: Apache Solr for full-text search capabilities
- **MySQL**: Database for user authentication and preferences
- **Batch Service**: Daily job for syncing Unity Catalog metadata

## Quick Start
1. clone the repository
2. get or create a databricks API token
3. create a .env file (see .env.example); need databricks workspace endpoint and API token, for chat need deployed OpenAI model and 
4. run `docker compose up`
5. first time running, manually start the indexer `docker run -it <batch service docker id> node index.js` (otherwise the indexer is otherwise scheduled to run at 2am daily)
6. navigate to localhost:3000
7. profit`


### Prerequisites

- Docker and Docker Compose
- Valid Databricks workspace access
- Databricks personal access token

### Setup

1. **Clone and setup environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

2. **Start services**:
   ```bash
   docker-compose up -d
   ```

3. **Access the application**:
   - Web App: http://localhost:3000
   - Solr Admin: http://localhost:8983/solr
   - MySQL: localhost:3306

### Environment Variables

Required variables in `.env`:

- `DATABRICKS_TOKEN`: Your Databricks personal access token
- `DATABRICKS_WORKSPACE_URL`: Your Databricks workspace URL
- `MYSQL_USER/PASSWORD/DB`: MySQL database credentials
- `NEXTAUTH_SECRET`: Secret for NextAuth.js authentication

## Development

### Project Structure

```
/web          - Next.js frontend and API
/batch        - Daily catalog indexing service
/docker       - Docker configuration and scripts
```

### Development Commands

```bash
# Start development environment
docker-compose up

# View logs
docker-compose logs -f [service_name]

# Stop services
docker-compose down

# Rebuild services
docker-compose build
```

### Database Schema

The MySQL database includes tables for:
- User authentication (`users`, `accounts`, `sessions`)
- User preferences (`user_preferences`)
- Indexing job tracking (`indexing_jobs`)

### Solr Configuration

The Solr core includes fields for Unity Catalog entities:
- Catalog, schema, table, and column metadata
- Tags, descriptions, and properties
- Full-text search capabilities

## Features

### Search Functionality
- Full-text search across Unity Catalog metadata
- Filtering by type, catalog, schema
- Tag-based search

### User Management
- Authentication with NextAuth.js
- User-specific preferences
- Session management

### Batch Processing
- Daily sync with Unity Catalog
- Automatic Solr index updates
- Job status tracking

## API Endpoints

- `GET /api/search?q=...` - Search Unity Catalog
- `GET /api/preferences` - Get user preferences
- `POST /api/preferences` - Update user preferences
- `GET /api/health` - Service health check

## Troubleshooting

### Common Issues

1. **Solr core not created**: Check Solr logs and ensure configsets are properly mounted
2. **Database connection**: Verify MySQL credentials and network connectivity
3. **Databricks authentication**: Ensure token has proper permissions for Unity Catalog

### Logs

```bash
# View all service logs
docker-compose logs

# View specific service logs
docker-compose logs web
docker-compose logs batch
docker-compose logs solr
docker-compose logs mysql
```