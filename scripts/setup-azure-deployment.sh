#!/bin/bash

# Azure Container Services Deployment Setup Script
# This script helps configure the necessary Azure resources and GitHub secrets

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Unity Catalog Search App - Azure Deployment Setup${NC}"
echo "============================================================"

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

# Get user inputs
echo ""
echo -e "${YELLOW}Please provide the following information:${NC}"

read -p "Azure Subscription ID: " SUBSCRIPTION_ID
read -p "Resource Group Name (default: rg-unity-catalog-search): " RESOURCE_GROUP
RESOURCE_GROUP=${RESOURCE_GROUP:-rg-unity-catalog-search}

read -p "Azure Region (default: West US 2): " LOCATION
LOCATION=${LOCATION:-"West US 2"}

read -s -p "MySQL Admin Password: " MYSQL_PASSWORD
echo ""

read -s -p "Databricks Token: " DATABRICKS_TOKEN
echo ""

read -p "Databricks Workspace URL: " DATABRICKS_WORKSPACE_URL

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

# Create backend configuration
cat > backend.tf << EOF
terraform {
  backend "azurerm" {
    resource_group_name  = "$RESOURCE_GROUP"
    storage_account_name = "$STORAGE_ACCOUNT_NAME"
    container_name       = "tfstate"
    key                  = "terraform.tfstate"
  }
}
EOF

# Initialize Terraform with new backend
echo -e "${YELLOW}Initializing Terraform with new backend...${NC}"
terraform init -force-copy

echo ""
echo -e "${GREEN}🎉 Azure deployment setup completed successfully!${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Push your changes to GitHub to trigger the deployment workflow"
echo "2. Monitor the GitHub Actions workflow in your repository"
echo "3. Once deployed, your application will be available at the Azure Container Instance URL"
echo ""
echo -e "${BLUE}GitHub Secrets Configured:${NC}"
echo "✓ AZURE_CREDENTIALS"
echo "✓ AZURE_SUBSCRIPTION_ID"
echo "✓ MYSQL_ADMIN_PASSWORD"
echo "✓ DATABRICKS_TOKEN"
echo "✓ DATABRICKS_WORKSPACE_URL"
echo "✓ TF_STORAGE_ACCOUNT_NAME"
echo "✓ TF_RESOURCE_GROUP_NAME"
echo ""
echo -e "${YELLOW}Note: ACR authentication is handled automatically via Azure CLI in the workflow.${NC}"
echo "No additional ACR secrets are required."