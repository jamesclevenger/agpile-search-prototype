#!/bin/bash

# Azure Container Services Deployment Teardown Script
# This script removes all Azure resources and configurations created by setup-azure-deployment.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Unity Catalog Search App - Azure Deployment Teardown${NC}"
echo "================================================================"
echo -e "${RED}WARNING: This will delete ALL Azure resources and cannot be undone!${NC}"
echo ""

# Confirmation prompt
read -p "Are you sure you want to tear down the entire deployment? (type 'yes' to confirm): " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
    echo -e "${YELLOW}Teardown cancelled.${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}Starting teardown process...${NC}"

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v az &> /dev/null; then
    echo -e "${RED}Error: Azure CLI is not installed. Please install it first.${NC}"
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

# Azure login and setup
echo ""
echo -e "${YELLOW}Logging into Azure...${NC}"
az login

echo -e "${YELLOW}Setting subscription...${NC}"
az account set --subscription "$SUBSCRIPTION_ID"

# Get current subscription info
CURRENT_SUB=$(az account show --query name -o tsv)
echo -e "${BLUE}Current subscription: ${CURRENT_SUB}${NC}"

# Final confirmation with subscription details
echo ""
echo -e "${RED}FINAL WARNING:${NC}"
echo -e "${RED}This will delete the following in subscription '${CURRENT_SUB}':${NC}"
echo -e "${RED}  • All resource groups matching: ${RESOURCE_GROUP}*${NC}"
echo -e "${RED}  • Service principal: fairgrounds-github-actions${NC}"
echo -e "${RED}  • All GitHub secrets related to this deployment${NC}"
echo ""
read -p "Type 'DELETE EVERYTHING' to proceed: " FINAL_CONFIRM
if [[ "$FINAL_CONFIRM" != "DELETE EVERYTHING" ]]; then
    echo -e "${YELLOW}Teardown cancelled.${NC}"
    exit 0
fi

echo ""
echo -e "${RED}🔥 Beginning teardown...${NC}"

# 1. Delete all environment resource groups (dev, staging, prod)
echo -e "${YELLOW}Step 1: Deleting resource groups...${NC}"
for env in dev staging prod; do
    RG_NAME="${RESOURCE_GROUP}-${env}"
    if az group exists --name "$RG_NAME" | grep -q true; then
        echo -e "${YELLOW}Deleting resource group: ${RG_NAME}${NC}"
        az group delete --name "$RG_NAME" --yes --no-wait
        echo -e "${GREEN}✓ Deletion initiated for ${RG_NAME}${NC}"
    else
        echo -e "${BLUE}Resource group ${RG_NAME} does not exist${NC}"
    fi
done

# Delete main resource group (contains Terraform backend storage)
if az group exists --name "$RESOURCE_GROUP" | grep -q true; then
    echo -e "${YELLOW}Deleting main resource group: ${RESOURCE_GROUP}${NC}"
    az group delete --name "$RESOURCE_GROUP" --yes --no-wait
    echo -e "${GREEN}✓ Deletion initiated for ${RESOURCE_GROUP}${NC}"
else
    echo -e "${BLUE}Main resource group ${RESOURCE_GROUP} does not exist${NC}"
fi

# 2. Delete service principal
echo -e "${YELLOW}Step 2: Deleting service principal...${NC}"
SP_ID=$(az ad sp list --display-name "fairgrounds-github-actions" --query "[0].id" -o tsv 2>/dev/null || echo "")
if [[ -n "$SP_ID" ]]; then
    echo -e "${YELLOW}Deleting service principal: fairgrounds-github-actions${NC}"
    az ad sp delete --id "$SP_ID"
    echo -e "${GREEN}✓ Service principal deleted${NC}"
else
    echo -e "${BLUE}Service principal 'fairgrounds-github-actions' not found${NC}"
fi

# 3. Delete GitHub secrets
echo -e "${YELLOW}Step 3: Deleting GitHub secrets...${NC}"
SECRETS_TO_DELETE=(
    "AZURE_CREDENTIALS"
    "AZURE_SUBSCRIPTION_ID"
    "MYSQL_ADMIN_PASSWORD"
    "DATABRICKS_TOKEN"
    "DATABRICKS_WORKSPACE_URL"
    "DOCKER_HUB_USERNAME"
    "DOCKER_HUB_TOKEN"
    "TF_STORAGE_ACCOUNT_NAME"
    "TF_RESOURCE_GROUP_NAME"
)

for secret in "${SECRETS_TO_DELETE[@]}"; do
    if gh secret list | grep -q "$secret"; then
        echo -e "${YELLOW}Deleting GitHub secret: ${secret}${NC}"
        echo "y" | gh secret delete "$secret" || {
            echo -e "${RED}Failed to delete ${secret}, continuing...${NC}"
        }
        echo -e "${GREEN}✓ Deleted ${secret}${NC}"
    else
        echo -e "${BLUE}GitHub secret ${secret} not found${NC}"
    fi
done

# 4. Clean up local Terraform state (optional)
echo -e "${YELLOW}Step 4: Cleaning up local Terraform files...${NC}"
TERRAFORM_DIR="$(dirname "$0")/../azure"
if [[ -d "$TERRAFORM_DIR" ]]; then
    echo -e "${YELLOW}Cleaning Terraform working directory...${NC}"
    rm -rf "$TERRAFORM_DIR/.terraform" 2>/dev/null || true
    rm -f "$TERRAFORM_DIR/terraform.tfstate"* 2>/dev/null || true
    rm -f "$TERRAFORM_DIR/tfplan" 2>/dev/null || true
    rm -f "$TERRAFORM_DIR/.terraform.lock.hcl" 2>/dev/null || true
    echo -e "${GREEN}✓ Local Terraform files cleaned${NC}"
else
    echo -e "${BLUE}Terraform directory not found${NC}"
fi

# 5. Wait for resource group deletions to complete (optional)
echo ""
echo -e "${YELLOW}Monitoring resource group deletions...${NC}"
echo -e "${BLUE}Note: Resource group deletions continue in the background and may take 10-15 minutes to complete.${NC}"

# Check status of deletions
for env in dev staging prod ""; do
    if [[ -z "$env" ]]; then
        RG_NAME="$RESOURCE_GROUP"
    else
        RG_NAME="${RESOURCE_GROUP}-${env}"
    fi
    
    if az group exists --name "$RG_NAME" 2>/dev/null | grep -q true; then
        echo -e "${YELLOW}⏳ ${RG_NAME} is still being deleted...${NC}"
    else
        echo -e "${GREEN}✅ ${RG_NAME} deletion completed${NC}"
    fi
done

echo ""
echo -e "${GREEN}🎉 Teardown process completed!${NC}"
echo ""
echo -e "${BLUE}Summary of actions taken:${NC}"
echo "✓ Initiated deletion of all resource groups"
echo "✓ Deleted service principal 'fairgrounds-github-actions'"
echo "✓ Removed all GitHub secrets"
echo "✓ Cleaned local Terraform state files"
echo ""
echo -e "${YELLOW}Note: Resource group deletions may still be in progress.${NC}"
echo -e "${YELLOW}You can monitor their status in the Azure portal.${NC}"
echo ""
echo -e "${GREEN}You can now run setup-azure-deployment.sh to start fresh!${NC}"