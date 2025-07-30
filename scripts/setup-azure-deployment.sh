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

read -p "Azure Region (default: East US): " LOCATION
LOCATION=${LOCATION:-"East US"}

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
  --name "agpile-github-actions.jameseclevengerhotmail.onmicrosoft.com" \
  --role contributor \
  --scopes "/subscriptions/$SUBSCRIPTION_ID" \
  --sdk-auth)

echo -e "${GREEN}✓ Service principal created${NC}"

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
cd ../azure
terraform init

# Create Terraform backend configuration
echo -e "${YELLOW}Setting up Terraform backend...${NC}"
STORAGE_ACCOUNT_NAME="tfstate$(date +%s)"
az storage account create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$STORAGE_ACCOUNT_NAME" \
  --sku Standard_LRS \
  --encryption-services blob

ACCOUNT_KEY=$(az storage account keys list \
  --resource-group "$RESOURCE_GROUP" \
  --account-name "$STORAGE_ACCOUNT_NAME" \
  --query '[0].value' \
  --output tsv)

az storage container create \
  --name tfstate \
  --account-name "$STORAGE_ACCOUNT_NAME" \
  --account-key "$ACCOUNT_KEY"

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
echo ""
echo -e "${YELLOW}Remember to also set up these secrets for different environments if needed:${NC}"
echo "- ACR_LOGIN_SERVER"
echo "- ACR_USERNAME"
echo "- ACR_PASSWORD"