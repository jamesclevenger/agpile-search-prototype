#!/bin/bash

# Azure Container Services Deployment Setup Script
# This script helps configure the necessary Azure resources and GitHub secrets

set -e

# Parse command line arguments
CONFIG_FILE=""
SCRIPT_DIR=$(dirname "$0")

while [[ $# -gt 0 ]]; do
  case $1 in
    -f|--config)
      CONFIG_FILE="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [-f|--config CONFIG_FILE]"
      echo "  -f, --config CONFIG_FILE  Use configuration file (default: deployment-config.env)"
      echo "  -h, --help               Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use -h or --help for usage information"
      exit 1
      ;;
  esac
done

# Auto-detect config file if not specified
if [[ -z "$CONFIG_FILE" && -f "$SCRIPT_DIR/deployment-config.env" ]]; then
  CONFIG_FILE="$SCRIPT_DIR/deployment-config.env"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Unity Catalog Search App - Azure Deployment Setup${NC}"
echo "============================================================"

# Load configuration file if provided
if [[ -n "$CONFIG_FILE" ]]; then
  if [[ -f "$CONFIG_FILE" ]]; then
    echo -e "${GREEN}Loading configuration from: $CONFIG_FILE${NC}"
    
    # Check file permissions for security
    if [[ "$(stat -c %a "$CONFIG_FILE" 2>/dev/null || stat -f %A "$CONFIG_FILE" 2>/dev/null)" != "600" ]]; then
      echo -e "${YELLOW}Warning: Config file permissions are not 600. For security, run:${NC}"
      echo "  chmod 600 $CONFIG_FILE"
    fi
    
    # Source the config file
    set -a  # Export all variables
    source "$CONFIG_FILE"
    set +a  # Stop exporting
    
    echo -e "${GREEN}Configuration loaded successfully${NC}"
  else
    echo -e "${RED}Error: Configuration file not found: $CONFIG_FILE${NC}"
    echo "Create the file or run without -f flag for interactive mode"
    exit 1
  fi
else
  echo -e "${YELLOW}No configuration file found. Using interactive mode.${NC}"
  echo "Tip: Create scripts/deployment-config.env from the example template for faster setup"
fi
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v az &> /dev/null; then
    echo -e "${RED}Error: Azure CLI is not installed. Please install it first.${NC}"
    exit 1
fi

if ! command -v terraform &> /dev/null; then
    echo -e "${RED}Error: Terraform is not installed. Please install it first.${NC}"
    exit 1
fi

if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI is not installed. Please install it first.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites check passed${NC}"

# Get user inputs (only prompt for missing values)
echo ""
echo -e "${YELLOW}Configuration Review:${NC}"

# Azure Configuration
if [[ -z "$SUBSCRIPTION_ID" ]]; then
  read -p "Azure Subscription ID: " SUBSCRIPTION_ID
fi

if [[ -z "$RESOURCE_GROUP" ]]; then
  read -p "Resource Group Name (default: rg-unity-catalog-search): " RESOURCE_GROUP
fi
RESOURCE_GROUP=${RESOURCE_GROUP:-rg-unity-catalog-search}

if [[ -z "$LOCATION" ]]; then
  read -p "Azure Region (default: West US 2): " LOCATION
fi
LOCATION=${LOCATION:-"West US 2"}

# Database Configuration
if [[ -z "$MYSQL_PASSWORD" ]]; then
  read -s -p "MySQL Admin Password: " MYSQL_PASSWORD
  echo ""
fi

# Databricks Configuration
if [[ -z "$DATABRICKS_TOKEN" ]]; then
  read -s -p "Databricks Token: " DATABRICKS_TOKEN
  echo ""
fi

if [[ -z "$DATABRICKS_WORKSPACE_URL" ]]; then
  read -p "Databricks Workspace URL: " DATABRICKS_WORKSPACE_URL
fi

# Docker Hub Configuration
if [[ -z "$DOCKER_HUB_USERNAME" ]]; then
  read -p "Docker Hub Username: " DOCKER_HUB_USERNAME
fi

if [[ -z "$DOCKER_HUB_TOKEN" ]]; then
  read -s -p "Docker Hub Personal Access Token: " DOCKER_HUB_TOKEN
  echo ""
fi

# Monitoring Configuration
if [[ -z "$ADMIN_EMAIL" ]]; then
  read -p "Admin Email (for monitoring alerts): " ADMIN_EMAIL
fi

# Azure OpenAI Configuration
echo ""
echo -e "${YELLOW}Azure OpenAI Configuration (for chat features):${NC}"

if [[ -z "$AZURE_OPENAI_API_KEY" ]]; then
  read -s -p "Azure OpenAI API Key: " AZURE_OPENAI_API_KEY
  echo ""
fi

if [[ -z "$AZURE_OPENAI_ENDPOINT" ]]; then
  read -p "Azure OpenAI Endpoint (e.g., https://your-resource.openai.azure.com): " AZURE_OPENAI_ENDPOINT
fi

if [[ -z "$AZURE_OPENAI_DEPLOYMENT_NAME" ]]; then
  read -p "Azure OpenAI Deployment Name: " AZURE_OPENAI_DEPLOYMENT_NAME
fi

if [[ -z "$AZURE_OPENAI_API_VERSION" ]]; then
  read -p "Azure OpenAI API Version (default: 2024-02-01): " AZURE_OPENAI_API_VERSION
fi
AZURE_OPENAI_API_VERSION=${AZURE_OPENAI_API_VERSION:-"2024-02-01"}

# Validate all required variables are present
echo ""
echo -e "${YELLOW}Validating configuration...${NC}"

REQUIRED_VARS=(
  "SUBSCRIPTION_ID"
  "RESOURCE_GROUP" 
  "LOCATION"
  "MYSQL_PASSWORD"
  "DATABRICKS_TOKEN"
  "DATABRICKS_WORKSPACE_URL"
  "DOCKER_HUB_USERNAME"
  "DOCKER_HUB_TOKEN"
  "ADMIN_EMAIL"
  "AZURE_OPENAI_API_KEY"
  "AZURE_OPENAI_ENDPOINT"
  "AZURE_OPENAI_DEPLOYMENT_NAME"
  "AZURE_OPENAI_API_VERSION"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var}" ]]; then
    MISSING_VARS+=("$var")
  fi
done

if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
  echo -e "${RED}Error: Missing required configuration variables:${NC}"
  for var in "${MISSING_VARS[@]}"; do
    echo "  - $var"
  done
  echo ""
  echo "Please provide all required values or update your config file."
  exit 1
fi

echo -e "${GREEN}✓ Configuration validation passed${NC}"

# Azure login and setup
echo ""
echo -e "${YELLOW}Logging into Azure...${NC}"
az login

echo -e "${YELLOW}Setting subscription...${NC}"
az account set --subscription "$SUBSCRIPTION_ID"

# Create service principal for GitHub Actions
echo -e "${YELLOW}Creating service principal for GitHub Actions...${NC}"
SP_OUTPUT=$(az ad sp create-for-rbac \
  --name "fairgrounds-github-actions" \
  --role contributor \
  --scopes "/subscriptions/$SUBSCRIPTION_ID" \
  --sdk-auth)

echo -e "${GREEN}✓ Service principal created${NC}"

# Add Storage Account Key Operator role for Terraform backend access
echo -e "${YELLOW}Adding Storage Account Key Operator role...${NC}"
SP_ID=$(echo "$SP_OUTPUT" | jq -r '.clientId')
az role assignment create \
  --assignee "$SP_ID" \
  --role "Storage Account Key Operator Service Role" \
  --scope "/subscriptions/$SUBSCRIPTION_ID"

echo -e "${GREEN}✓ Additional role assigned${NC}"

# Create initial resource group
echo -e "${YELLOW}Creating resource group...${NC}"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION"

# Set up GitHub secrets
echo -e "${YELLOW}Setting up GitHub secrets...${NC}"

gh secret set AZURE_CREDENTIALS --body "$SP_OUTPUT"
gh secret set AZURE_SUBSCRIPTION_ID --body "$SUBSCRIPTION_ID"
gh secret set MYSQL_ADMIN_PASSWORD --body "$MYSQL_PASSWORD"
gh secret set DATABRICKS_TOKEN --body "$DATABRICKS_TOKEN"
gh secret set DATABRICKS_WORKSPACE_URL --body "$DATABRICKS_WORKSPACE_URL"
gh secret set DOCKER_HUB_USERNAME --body "$DOCKER_HUB_USERNAME"
gh secret set DOCKER_HUB_TOKEN --body "$DOCKER_HUB_TOKEN"
gh secret set ADMIN_EMAIL --body "$ADMIN_EMAIL"
gh secret set AZURE_OPENAI_API_KEY --body "$AZURE_OPENAI_API_KEY"
gh secret set AZURE_OPENAI_ENDPOINT --body "$AZURE_OPENAI_ENDPOINT"
gh secret set AZURE_OPENAI_DEPLOYMENT_NAME --body "$AZURE_OPENAI_DEPLOYMENT_NAME"
gh secret set AZURE_OPENAI_API_VERSION --body "$AZURE_OPENAI_API_VERSION"

echo -e "${GREEN}✓ GitHub secrets configured${NC}"

# Initialize Terraform
echo -e "${YELLOW}Initializing Terraform...${NC}"
cd "$(dirname "$0")/../azure"

# Clean up any existing Terraform state
echo -e "${YELLOW}Cleaning up existing Terraform state...${NC}"
rm -rf .terraform
rm -f terraform.tfstate*

# Create Terraform backend configuration
echo -e "${YELLOW}Setting up Terraform backend...${NC}"
STORAGE_ACCOUNT_NAME="tf$(date +%s)"
if ! az storage account create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$STORAGE_ACCOUNT_NAME" \
  --sku Standard_LRS \
  --encryption-services blob; then
  echo -e "${RED}Error: Failed to create storage account${NC}"
  exit 1
fi

echo "Waiting for storage account to be fully provisioned..."
# Wait for storage account to be ready (up to 2 minutes)
for i in {1..24}; do
  if az storage account show --name "$STORAGE_ACCOUNT_NAME" --resource-group "$RESOURCE_GROUP" --query "provisioningState" -o tsv | grep -q "Succeeded"; then
    echo "Storage account provisioned successfully"
    break
  fi
  echo "Waiting... (attempt $i/24)"
  sleep 5
done

echo "Getting storage account key..."
ACCOUNT_KEY=$(az storage account keys list \
  --resource-group "$RESOURCE_GROUP" \
  --account-name "$STORAGE_ACCOUNT_NAME" \
  --query '[0].value' \
  --output tsv)

if [[ -z "$ACCOUNT_KEY" ]]; then
  echo -e "${RED}Error: Failed to get storage account key${NC}"
  exit 1
fi

echo "Creating storage container..."
if ! az storage container create \
  --name tfstate \
  --account-name "$STORAGE_ACCOUNT_NAME" \
  --account-key "$ACCOUNT_KEY"; then
  echo -e "${RED}Error: Failed to create storage container${NC}"
  exit 1
fi

# Store storage account name as GitHub secret for Terraform backend
echo -e "${YELLOW}Setting storage account name as GitHub secret...${NC}"
gh secret set TF_STORAGE_ACCOUNT_NAME --body "$STORAGE_ACCOUNT_NAME"
gh secret set TF_RESOURCE_GROUP_NAME --body "$RESOURCE_GROUP"

# Initialize Terraform with new backend
echo -e "${YELLOW}Initializing Terraform with runtime backend configuration...${NC}"
terraform init -reconfigure \
  -backend-config="resource_group_name=$RESOURCE_GROUP" \
  -backend-config="storage_account_name=$STORAGE_ACCOUNT_NAME" \
  -backend-config="container_name=tfstate" \
  -backend-config="key=terraform.tfstate"

echo ""
echo -e "${GREEN}🎉 Azure deployment setup completed successfully!${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Push your changes to GitHub to trigger the deployment workflow"
echo "2. Monitor the GitHub Actions workflow in your repository"
echo "3. Once deployed, your application will be available at the Azure Container Instance URL"
echo ""
echo -e "${BLUE}Local Development:${NC}"
echo "To run Terraform locally, use:"
echo "  cd azure"
echo "  terraform init -reconfigure \\"
echo "    -backend-config=\"resource_group_name=$RESOURCE_GROUP\" \\"
echo "    -backend-config=\"storage_account_name=$STORAGE_ACCOUNT_NAME\" \\"
echo "    -backend-config=\"container_name=tfstate\" \\"
echo "    -backend-config=\"key=terraform.tfstate\""
echo ""
echo -e "${BLUE}GitHub Secrets Configured:${NC}"
echo "✓ AZURE_CREDENTIALS"
echo "✓ AZURE_SUBSCRIPTION_ID"
echo "✓ MYSQL_ADMIN_PASSWORD"
echo "✓ DATABRICKS_TOKEN"
echo "✓ DATABRICKS_WORKSPACE_URL"
echo "✓ DOCKER_HUB_USERNAME"
echo "✓ DOCKER_HUB_TOKEN"
echo "✓ ADMIN_EMAIL"
echo "✓ AZURE_OPENAI_API_KEY"
echo "✓ AZURE_OPENAI_ENDPOINT"
echo "✓ AZURE_OPENAI_DEPLOYMENT_NAME"
echo "✓ AZURE_OPENAI_API_VERSION"
echo "✓ TF_STORAGE_ACCOUNT_NAME"
echo "✓ TF_RESOURCE_GROUP_NAME"
echo ""
echo -e "${YELLOW}Note: ACR authentication is handled automatically via Azure CLI in the workflow.${NC}"
echo "No additional ACR secrets are required."
echo ""
echo -e "${BLUE}Config File Usage:${NC}"
echo "For faster future deployments, you can use a config file:"
echo "  cp scripts/deployment-config.env.example scripts/deployment-config.env"
echo "  # Edit deployment-config.env with your values"
echo "  chmod 600 scripts/deployment-config.env  # Secure file permissions"
echo "  ./scripts/setup-azure-deployment.sh      # Will auto-detect config file"