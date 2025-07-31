terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~>3.0"
    }
  }
}

provider "azurerm" {
  features {}
  
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
  default     = "East US 2"
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

# MySQL Flexible Server
resource "azurerm_mysql_flexible_server" "mysql" {
  name                   = "mysql-unity-catalog-${var.environment}"
  resource_group_name    = azurerm_resource_group.main.name
  location              = azurerm_resource_group.main.location
  administrator_login    = "unityadmin"
  administrator_password = var.mysql_admin_password
  backup_retention_days  = 7
  sku_name              = "B_Standard_B1s"
  version               = "8.0.21"

  storage {
    size_gb = 20
  }

  # Specify availability zone to avoid region issues
  zone = "1"

  tags = {
    Environment = var.environment
    Project     = "unity-catalog-search"
  }
}

# MySQL Database
resource "azurerm_mysql_flexible_database" "database" {
  name                = "unity_catalog"
  resource_group_name = azurerm_resource_group.main.name
  server_name         = azurerm_mysql_flexible_server.mysql.name
  charset             = "utf8"
  collation          = "utf8_unicode_ci"
}

# MySQL Firewall Rule (Allow Azure Services)
resource "azurerm_mysql_flexible_server_firewall_rule" "azure" {
  name             = "AllowAzureServices"
  resource_group_name = azurerm_resource_group.main.name
  server_name      = azurerm_mysql_flexible_server.mysql.name
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

# Storage Account for Solr data
resource "azurerm_storage_account" "solr" {
  name                     = "solrdata${var.environment}${random_string.suffix.result}"
  resource_group_name      = azurerm_resource_group.main.name
  location                = azurerm_resource_group.main.location
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
resource "azurerm_container_group" "web" {
  name                = "aci-unity-web-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  ip_address_type     = "Public"
  dns_name_label      = "unity-catalog-web-${var.environment}"
  os_type             = "Linux"

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
      MYSQL_HOST     = azurerm_mysql_flexible_server.mysql.fqdn
      MYSQL_PORT     = "3306"
      MYSQL_USER     = azurerm_mysql_flexible_server.mysql.administrator_login
      MYSQL_DB       = azurerm_mysql_flexible_database.database.name
      SOLR_HOST      = azurerm_container_group.solr.fqdn
      SOLR_PORT      = "8983"
      SOLR_CORE      = "unity_catalog"
      NEXTAUTH_URL   = "https://unity-catalog-web-${var.environment}.eastus2.azurecontainer.io"
    }

    secure_environment_variables = {
      MYSQL_PASSWORD  = var.mysql_admin_password
      NEXTAUTH_SECRET = random_string.nextauth_secret.result
    }
  }

  image_registry_credential {
    server   = azurerm_container_registry.acr.login_server
    username = azurerm_container_registry.acr.admin_username
    password = azurerm_container_registry.acr.admin_password
  }

  tags = {
    Environment = var.environment
    Project     = "unity-catalog-search"
  }
}

# Container Group for Solr Service
resource "azurerm_container_group" "solr" {
  name                = "aci-unity-solr-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  ip_address_type     = "Public"
  dns_name_label      = "unity-catalog-solr-${var.environment}"
  os_type             = "Linux"

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
    }

    volume {
      name                 = "solr-data"
      mount_path          = "/var/solr"
      storage_account_name = azurerm_storage_account.solr.name
      storage_account_key  = azurerm_storage_account.solr.primary_access_key
      share_name          = azurerm_storage_share.solr.name
    }

    commands = ["bash", "-c", "solr-precreate unity_catalog && solr-foreground"]
  }

  tags = {
    Environment = var.environment
    Project     = "unity-catalog-search"
  }
}

# Container Group for Batch Service
resource "azurerm_container_group" "batch" {
  name                = "aci-unity-batch-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  ip_address_type     = "None"
  os_type             = "Linux"
  restart_policy      = "OnFailure"

  container {
    name   = "batch"
    image  = var.batch_image
    cpu    = "0.5"
    memory = "1"

    environment_variables = {
      MYSQL_HOST      = azurerm_mysql_flexible_server.mysql.fqdn
      MYSQL_PORT      = "3306"
      MYSQL_USER      = azurerm_mysql_flexible_server.mysql.administrator_login
      MYSQL_DB        = azurerm_mysql_flexible_database.database.name
      SOLR_HOST       = azurerm_container_group.solr.fqdn
      SOLR_PORT       = "8983"
      SOLR_CORE       = "unity_catalog"
    }

    secure_environment_variables = {
      MYSQL_PASSWORD            = var.mysql_admin_password
      DATABRICKS_TOKEN          = var.databricks_token
      DATABRICKS_WORKSPACE_URL  = var.databricks_workspace_url
    }
  }

  image_registry_credential {
    server   = azurerm_container_registry.acr.login_server
    username = azurerm_container_registry.acr.admin_username
    password = azurerm_container_registry.acr.admin_password
  }

  tags = {
    Environment = var.environment
    Project     = "unity-catalog-search"
  }
}

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
  value = azurerm_container_registry.acr.admin_password
  sensitive = true
}

output "web_app_url" {
  value = "https://${azurerm_container_group.web.fqdn}:3000"
}

output "mysql_server_fqdn" {
  value = azurerm_mysql_flexible_server.mysql.fqdn
}