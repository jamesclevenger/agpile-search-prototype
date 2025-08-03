terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.110"
    }
  }
}

provider "azurerm" {
  features {
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
  }
  
  # Use Service Principal authentication (configured via environment variables)
  # ARM_CLIENT_ID, ARM_CLIENT_SECRET, ARM_SUBSCRIPTION_ID, ARM_TENANT_ID
  use_cli = false
}

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
  default     = "rg-unity-catalog-search"
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "West US 2"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "mysql_admin_password" {
  description = "MySQL admin password"
  type        = string
  sensitive   = true
}

# Resource Group
resource "azurerm_resource_group" "main" {
  name     = "${var.resource_group_name}-${var.environment}"
  location = var.location

  tags = {
    Environment = var.environment
    Project     = "unity-catalog-search"
  }
}

# Container Registry
resource "azurerm_container_registry" "acr" {
  name                = "acrunitycatalog${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Basic"
  admin_enabled       = true

  tags = {
    Environment = var.environment
    Project     = "unity-catalog-search"
  }
}

# Note: Base images (mysql, solr) are now pulled directly from Docker Hub
# Only custom-built images (web, batch) are stored in ACR

# Storage Account for MySQL data persistence
resource "azurerm_storage_account" "mysql" {
  name                     = "mysql${var.environment}${random_string.suffix.result}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  tags = {
    Environment = var.environment
    Project     = "unity-catalog-search"
  }
}

# File Share for MySQL data
resource "azurerm_storage_share" "mysql" {
  name                 = "mysql-data"
  storage_account_name = azurerm_storage_account.mysql.name
  quota                = 10
}

# File Share for MySQL init scripts
resource "azurerm_storage_share" "mysql_init" {
  name                 = "mysql-init"
  storage_account_name = azurerm_storage_account.mysql.name
  quota                = 1
}

# Upload MySQL initialization script
resource "azurerm_storage_share_file" "mysql_init_sql" {
  name             = "init.sql"
  storage_share_id = azurerm_storage_share.mysql_init.id
  source           = "${path.module}/../docker/mysql/init.sql"
}

# Single Container Group for All Services
resource "azurerm_container_group" "main" {
  name                = "aci-unity-catalog-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  ip_address_type     = "Public"
  dns_name_label      = "unity-catalog-${var.environment}"
  os_type             = "Linux"

  # MySQL Container
  container {
    name   = "mysql"
    image  = "mysql:8.0"
    cpu    = "1"
    memory = "2"

    ports {
      port     = 3306
      protocol = "TCP"
    }

    environment_variables = {
      MYSQL_ROOT_PASSWORD     = var.mysql_admin_password
      MYSQL_DATABASE          = "unity_catalog"
      MYSQL_USER              = "unityadmin"
      MYSQL_PASSWORD          = var.mysql_admin_password
      MYSQL_SKIP_NAME_RESOLVE = "1"
      MYSQL_INIT_CONNECT      = "SET sql_mode='STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO'"
    }

    volume {
      name                 = "mysql-data"
      mount_path           = "/var/lib/mysql"
      storage_account_name = azurerm_storage_account.mysql.name
      storage_account_key  = azurerm_storage_account.mysql.primary_access_key
      share_name           = azurerm_storage_share.mysql.name
    }

    volume {
      name                 = "mysql-init"
      mount_path           = "/docker-entrypoint-initdb.d"
      storage_account_name = azurerm_storage_account.mysql.name
      storage_account_key  = azurerm_storage_account.mysql.primary_access_key
      share_name           = azurerm_storage_share.mysql_init.name
    }
  }

  # Solr Container
  container {
    name   = "solr"
    image  = "solr:9.6"
    cpu    = "1"
    memory = "2"

    ports {
      port     = 8983
      protocol = "TCP"
    }

    environment_variables = {
      SOLR_HEAP = "1g"
      SOLR_HOME = "/var/solr/data"
    }

    volume {
      name                 = "solr-data"
      mount_path           = "/var/solr"
      storage_account_name = azurerm_storage_account.solr.name
      storage_account_key  = azurerm_storage_account.solr.primary_access_key
      share_name           = azurerm_storage_share.solr.name
    }

    commands = ["bash", "-c", "echo 'Preparing Solr environment...' && mkdir -p /var/solr/data && chown -R solr:solr /var/solr && echo 'Setting resource limits...' && ulimit -n 65000 && ulimit -u 65000 && echo 'Limits set - files: $(ulimit -n), processes: $(ulimit -u)' && echo 'Starting Solr...' && solr-foreground & SOLR_PID=$! && echo 'Waiting for Solr to be ready...' && sleep 30 && echo 'Creating unity_catalog core...' && solr create_core -c unity_catalog && echo 'Core created, keeping Solr running...' && wait $SOLR_PID"]
  }

  # Web Container
  container {
    name   = "web"
    image  = var.web_image
    cpu    = "1"
    memory = "2"

    ports {
      port     = 3000
      protocol = "TCP"
    }

    environment_variables = {
      MYSQL_HOST                    = "localhost"  # Changed from FQDN to localhost
      MYSQL_PORT                    = "3306"
      MYSQL_USER                    = "unityadmin"
      MYSQL_DB                      = "unity_catalog"
      SOLR_HOST                     = "localhost"  # Changed from FQDN to localhost
      SOLR_PORT                     = "8983"
      SOLR_CORE                     = "unity_catalog"
      NEXTAUTH_URL                  = "https://unity-catalog-${var.environment}.westus2.azurecontainer.io"
      AZURE_OPENAI_ENDPOINT         = var.azure_openai_endpoint
      AZURE_OPENAI_DEPLOYMENT_NAME  = var.azure_openai_deployment_name
      AZURE_OPENAI_API_VERSION      = var.azure_openai_api_version
    }

    secure_environment_variables = {
      MYSQL_PASSWORD       = var.mysql_admin_password
      NEXTAUTH_SECRET      = random_string.nextauth_secret.result
      AZURE_OPENAI_API_KEY = var.azure_openai_api_key
    }
  }

  # Registry credentials for Docker Hub and ACR
  image_registry_credential {
    server   = "index.docker.io"
    username = var.docker_hub_username
    password = var.docker_hub_token
  }

  dynamic "image_registry_credential" {
    for_each = can(regex("\\.azurecr\\.io/", var.web_image)) ? [1] : []
    content {
      server   = azurerm_container_registry.acr.login_server
      username = azurerm_container_registry.acr.admin_username
      password = azurerm_container_registry.acr.admin_password
    }
  }

  depends_on = [
    azurerm_storage_share_file.mysql_init_sql
  ]

  tags = {
    Environment = var.environment
    Project     = "unity-catalog-search"
  }
}

# Storage Account for Solr data
resource "azurerm_storage_account" "solr" {
  name                     = "solrdata${var.environment}${random_string.suffix.result}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  tags = {
    Environment = var.environment
    Project     = "unity-catalog-search"
  }
}

# File Share for Solr data
resource "azurerm_storage_share" "solr" {
  name                 = "solr-data"
  storage_account_name = azurerm_storage_account.solr.name
  quota                = 50
}


# Random string for unique naming
resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
}

# Container Group for Web Service

# Additional variables for batch service
variable "databricks_token" {
  description = "Databricks access token"
  type        = string
  sensitive   = true
}

variable "databricks_workspace_url" {
  description = "Databricks workspace URL"
  type        = string
}

variable "web_image" {
  description = "Web container image"
  type        = string
  default     = "nginx:alpine"
}

variable "batch_image" {
  description = "Batch container image"
  type        = string
  default     = "alpine:latest"
}

variable "docker_hub_username" {
  description = "Docker Hub username for authenticated pulls"
  type        = string
  sensitive   = true
}

variable "docker_hub_token" {
  description = "Docker Hub personal access token"
  type        = string
  sensitive   = true
}

variable "azure_openai_api_key" {
  description = "Azure OpenAI API key"
  type        = string
  sensitive   = true
}

variable "azure_openai_endpoint" {
  description = "Azure OpenAI endpoint URL"
  type        = string
}

variable "azure_openai_deployment_name" {
  description = "Azure OpenAI deployment name"
  type        = string
}

variable "azure_openai_api_version" {
  description = "Azure OpenAI API version"
  type        = string
  default     = "2024-02-01"
}

# Random secret for NextAuth
resource "random_string" "nextauth_secret" {
  length  = 32
  special = true
}

# Outputs
output "resource_group_name" {
  value = azurerm_resource_group.main.name
}

output "container_registry_login_server" {
  value = azurerm_container_registry.acr.login_server
}

output "container_registry_admin_username" {
  value = azurerm_container_registry.acr.admin_username
}

output "container_registry_admin_password" {
  value     = azurerm_container_registry.acr.admin_password
  sensitive = true
}

output "web_app_url" {
  value = "https://${azurerm_container_group.main.fqdn}:3000"
}

output "mysql_server_fqdn" {
  value = azurerm_container_group.main.fqdn
}
