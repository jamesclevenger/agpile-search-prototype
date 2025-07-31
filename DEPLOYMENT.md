# Azure Container Services Deployment Guide

This guide walks you through deploying the Unity Catalog Search App to Azure Container Services using GitHub Actions.

## Architecture Overview

The application is deployed as multiple Azure Container Instances with the following components:

- **Web Service**: Next.js application (Azure Container Instance)
- **Solr Search Engine**: Apache Solr (Azure Container Instance) 
- **MySQL Database**: Azure Database for MySQL Flexible Server
- **Batch Processing**: Daily indexing job (Azure Container Instance)
- **Container Registry**: Azure Container Registry (ACR)
- **Monitoring**: Azure Application Insights + Log Analytics

## Prerequisites

Before deploying, ensure you have:

1. **Azure CLI** installed and configured
2. **Terraform** v1.0+ installed
3. **GitHub CLI** installed (optional, but recommended)
4. An **Azure subscription** with contributor access
5. A **GitHub repository** with this codebase

## Quick Setup

Run the automated setup script:

```bash
./scripts/setup-azure-deployment.sh
```

This script will:
- Create Azure service principal for GitHub Actions
- Set up GitHub repository secrets
- Initialize Terraform backend
- Create initial Azure resource group

## Manual Setup

### 1. Azure Service Principal Setup

Create a service principal for GitHub Actions:

```bash
az ad sp create-for-rbac \
  --name "unity-catalog-github-actions" \
  --role contributor \
  --scopes "/subscriptions/YOUR_SUBSCRIPTION_ID" \
  --sdk-auth
```

### 2. GitHub Secrets Configuration

Add these secrets to your GitHub repository:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `AZURE_CREDENTIALS` | Service principal JSON from step 1 | `{"clientId": "...", "clientSecret": "...", ...}` |
| `AZURE_SUBSCRIPTION_ID` | Your Azure subscription ID | `12345678-1234-1234-1234-123456789012` |
| `MYSQL_ADMIN_PASSWORD` | MySQL administrator password | `SecurePassword123!` |
| `DATABRICKS_TOKEN` | Databricks access token | `dapi123...` |
| `DATABRICKS_WORKSPACE_URL` | Databricks workspace URL | `https://your-workspace.cloud.databricks.com` |

### 3. ACR Authentication

ACR authentication is handled automatically via Azure CLI in the GitHub Actions workflow. No additional ACR secrets are required.

## Deployment Workflow

The GitHub Actions workflow (`.github/workflows/deploy.yml`) handles:

### Build Stage
1. **Docker Image Build**: Creates production-optimized images for web and batch services
2. **Image Push**: Pushes images to Azure Container Registry
3. **Multi-stage Builds**: Optimizes image size and security

### Deploy Stages

#### Development (develop branch)
- Deploys to `dev` environment
- Uses minimal resources for cost optimization
- Auto-deploys on push to `develop` branch

#### Staging (main branch)
- Deploys to `staging` environment
- Production-like configuration for testing
- Auto-deploys on push to `main` branch

#### Production (main branch)
- Deploys to `prod` environment
- Full production resources and monitoring
- Requires manual approval (GitHub Environment protection)
- Includes health checks and rollback capability

## Environment Configuration

### Resource Specifications

| Environment | MySQL SKU | Container CPU | Container Memory | Storage |
|-------------|-----------|---------------|------------------|---------|
| Development | B_Standard_B1s | 0.5 CPU | 1 GB | 20 GB |
| Staging | B_Standard_B2s | 1 CPU | 2 GB | 50 GB |
| Production | GP_Standard_D2ds_v4 | 2 CPU | 4 GB | 100 GB |

### Environment Variables

Each environment uses these configuration files:
- `azure/environments/dev.tfvars`
- `azure/environments/staging.tfvars` 
- `azure/environments/prod.tfvars`

## Infrastructure Components

### Terraform Modules

The infrastructure is defined in several Terraform files:

- `azure/main.tf` - Core infrastructure (ACI, ACR, MySQL)
- `azure/monitoring.tf` - Application Insights, alerts, dashboard
- `azure/variables.tf` - Environment-specific configurations

### Container Groups

#### Web Service Container
- **Image**: `unity-catalog-web:latest`
- **Port**: 3000 (HTTP)
- **Health Check**: `/api/health`
- **Auto-restart**: On failure

#### Solr Container  
- **Image**: `solr:9.6`
- **Port**: 8983 (HTTP)
- **Persistent Storage**: Azure File Share
- **Configuration**: Custom schema for Unity Catalog

#### Batch Container
- **Image**: `unity-catalog-batch:latest`
- **Schedule**: Daily at 2 AM UTC
- **Restart Policy**: On failure
- **Resource**: 0.5 CPU, 1 GB Memory

## Monitoring and Logging

### Application Insights
- **Web Performance**: Request tracking, dependency monitoring
- **Custom Metrics**: Search queries, batch job status
- **Error Tracking**: Exception logging and alerting

### Log Analytics
- **Container Logs**: Centralized logging from all containers
- **Query Capabilities**: KQL queries for troubleshooting
- **Retention**: 30 days (configurable)

### Alerts
- **Web Service Availability**: Triggers when service is down
- **Database Connection**: Monitors MySQL connectivity
- **Batch Job Failures**: Alerts on indexing job errors

### Dashboard
Custom Azure dashboard showing:
- Container CPU/Memory usage
- Database performance metrics
- Search query statistics
- Error rates and response times

## Health Checks

### Web Service Health Check
```
GET /api/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00Z",
  "services": {
    "database": "connected",
    "solr": "connected"
  }
}
```

### Container Health Checks
- **Web**: HTTP health check every 30s
- **Solr**: Admin ping endpoint
- **Batch**: Process status verification

## Deployment Commands

### Manual Deployment
```bash
# Deploy to development
cd azure
terraform workspace select dev
terraform plan -var-file="environments/dev.tfvars"
terraform apply

# Deploy to production  
terraform workspace select prod
terraform plan -var-file="environments/prod.tfvars"
terraform apply
```

### Container Updates
```bash
# Restart containers after image update
az container restart --resource-group rg-unity-catalog-search-prod --name aci-unity-web-prod
az container restart --resource-group rg-unity-catalog-search-prod --name aci-unity-batch-prod
```

## Troubleshooting

### Common Issues

#### Container Start Failures
```bash
# Check container logs
az container logs --resource-group rg-unity-catalog-search-prod --name aci-unity-web-prod

# Check container status
az container show --resource-group rg-unity-catalog-search-prod --name aci-unity-web-prod
```

#### Database Connectivity
```bash
# Test MySQL connection
mysql -h mysql-unity-catalog-prod.mysql.database.azure.com -u unityadmin -p unity_catalog
```

#### ACR Authentication
```bash
# Login to ACR
az acr login --name acrunitycatalogprod

# Test image pull
docker pull acrunitycatalogprod.azurecr.io/unity-catalog-web:latest
```

### Rollback Procedure

1. **Identify Last Good Deployment**
   ```bash
   # Check deployment history
   gh run list --workflow=deploy.yml
   ```

2. **Revert to Previous Image**
   ```bash
   # Update container with previous image tag
   az container create --resource-group rg-unity-catalog-search-prod \
     --name aci-unity-web-prod \
     --image acrunitycatalogprod.azurecr.io/unity-catalog-web:previous-tag
   ```

3. **Verify Health**
   ```bash
   # Check health endpoint
   curl -f https://unity-catalog-web-prod.eastus2.azurecontainer.io:3000/api/health
   ```

## Cost Optimization

### Development Environment
- Use B-series burstable VMs for MySQL
- Minimal container resources
- Shared storage accounts

### Auto-scaling (Future Enhancement)
Consider migrating to Azure Container Apps for:
- Automatic scaling based on demand
- Pay-per-request pricing
- Built-in ingress and service discovery

## Security Considerations

### Network Security
- Container instances use private networking where possible
- MySQL firewall rules restrict access to Azure services only
- Secrets stored in Azure Key Vault (future enhancement)

### Image Security
- Multi-stage Docker builds minimize attack surface
- Regular base image updates via Dependabot
- Container image scanning (future enhancement)

### Access Control
- Service principal uses minimum required permissions
- Environment-specific resource groups
- RBAC roles for different team members

## Backup and Disaster Recovery

### Database Backups
- Automated daily backups (7-day retention)
- Point-in-time recovery available
- Cross-region backup replication for production

### Container Data
- Solr index data persisted in Azure File Shares
- Regular snapshots of persistent volumes
- Configuration stored in version control

### Recovery Procedures
1. **Database Recovery**: Restore from automated backup
2. **Container Recovery**: Redeploy from last known good image
3. **Full Environment Recovery**: Terraform re-deployment

## Next Steps

### Recommended Enhancements
1. **Azure Key Vault Integration**: Secure secret management
2. **Container Apps Migration**: Better scaling and cost optimization
3. **Azure CDN**: Improve global performance
4. **Multi-region Deployment**: High availability setup
5. **Automated Testing**: Integration tests in CI/CD pipeline

### Monitoring Improvements
1. **Custom Metrics**: Application-specific KPIs
2. **Distributed Tracing**: Request flow monitoring
3. **Performance Testing**: Load testing automation
4. **Cost Monitoring**: Azure Cost Management integration

---

For additional support or questions, please refer to the project's GitHub Issues or contact the development team.