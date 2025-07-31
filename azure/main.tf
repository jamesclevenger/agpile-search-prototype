terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.110"
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

# Import images to ACR if they don't exist
resource "null_resource" "import_mysql_image" {
  provisioner "local-exec" {
    command = "az acr repository show --name ${azurerm_container_registry.acr.name} --image mysql:8.0 &> /dev/null || az acr import --name ${azurerm_container_registry.acr.name} --source docker.io/library/mysql:8.0 --image mysql:8.0"
  }

  triggers = {
    acr_name = azurerm_container_registry.acr.name
  }
}

resource "null_resource" "import_solr_image" {
  provisioner "local-exec" {
    command = "az acr repository show --name ${azurerm_container_registry.acr.name} --image solr:9.6 &> /dev/null || az acr import --name ${azurerm_container_registry.acr.name} --source docker.io/library/solr:9.6 --image solr:9.6"
  }

  triggers = {
    acr_name = azurerm_container_registry.acr.name
  }
}

resource "null_resource" "import_web_image" {
  provisioner "local-exec" {
    command = "az acr repository show --name ${azurerm_container_registry.acr.name} --image ${var.web_image} &> /dev/null || az acr import --name ${azurerm_container_registry.acr.name} --source docker.io/${var.web_image} --image ${var.web_image}"
  }

  triggers = {
    acr_name   = azurerm_container_registry.acr.name
    image_name = var.web_image
  }
}

resource "null_resource" "import_batch_image" {
  provisioner "local-exec" {
    command = "az acr repository show --name ${azurerm_container_registry.acr.name} --image ${var.batch_image} &> /dev/null || az acr import --name ${azurerm_container_registry.acr.name} --source docker.io/${var.batch_image} --image ${var.batch_image}"
  }

  triggers = {
    acr_name   = azurerm_container_registry.acr.name
    image_name = var.batch_image
  }
}

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

# Container Group for MySQL Service
resource "azurerm_container_group" "mysql" {
  name                = "aci-unity-mysql-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  ip_address_type     = "Public"
  dns_name_label      = "unity-catalog-mysql-${var.environment}"
  os_type             = "Linux"

  container {
    name   = "mysql"
    image  = "${azurerm_container_registry.acr.login_server}/mysql:8.0"
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

  depends_on = [
    null_resource.import_mysql_image
  ]
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
resource "azurerm_container_group" "web" {
  name                = "aci-unity-web-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  ip_address_type     = "Public"
  dns_name_label      = "unity-catalog-web-${var.environment}"
  os_type             = "Linux"

  container {
    name   = "web"
    image  = "${azurerm_container_registry.acr.login_server}/${var.web_image}"
    cpu    = "1"
    memory = "2"

    ports {
      port     = 3000
      protocol = "TCP"
    }

    environment_variables = {
      MYSQL_HOST   = azurerm_container_group.mysql.fqdn
      MYSQL_PORT   = "3306"
      MYSQL_USER   = "unityadmin"
      MYSQL_DB     = "unity_catalog"
      SOLR_HOST    = azurerm_container_group.solr.fqdn
      SOLR_PORT    = "8983"
      SOLR_CORE    = "unity_catalog"
      NEXTAUTH_URL = "https://unity-catalog-web-${var.environment}.westus2.azurecontainer.io"
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

  depends_on = [
    azurerm_container_group.mysql,
    azurerm_container_group.solr,
    null_resource.import_web_image
  ]

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
    image  = "${azurerm_container_registry.acr.login_server}/solr:9.6"
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
      mount_path           = "/var/solr"
      storage_account_name = azurerm_storage_account.solr.name
      storage_account_key  = azurerm_storage_account.solr.primary_access_key
      share_name           = azurerm_storage_share.solr.name
    }

    commands = ["bash", "-c", "solr-precreate unity_catalog && solr-foreground"]
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

  depends_on = [
    null_resource.import_solr_image
  ]
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
    image  = "${azurerm_container_registry.acr.login_server}/${var.batch_image}"
    cpu    = "0.5"
    memory = "1"

    environment_variables = {
      MYSQL_HOST = azurerm_container_group.mysql.fqdn
      MYSQL_PORT = "3306"
      MYSQL_USER = "unityadmin"
      MYSQL_DB   = "unity_catalog"
      SOLR_HOST  = azurerm_container_group.solr.fqdn
      SOLR_PORT  = "8983"
      SOLR_CORE  = "unity_catalog"
    }

    secure_environment_variables = {
      MYSQL_PASSWORD           = var.mysql_admin_password
      DATABRICKS_TOKEN         = var.databricks_token
      DATABRICKS_WORKSPACE_URL = var.databricks_workspace_url
    }
  }

  image_registry_credential {
    server   = azurerm_container_registry.acr.login_server
    username = azurerm_container_registry.acr.admin_username
    password = azurerm_container_registry.acr.admin_password
  }

  depends_on = [
    azurerm_container_group.mysql,
    azurerm_container_group.solr,
    null_resource.import_batch_image
  ]

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
  value     = azurerm_container_registry.acr.admin_password
  sensitive = true
}

output "web_app_url" {
  value = "https://${azurerm_container_group.web.fqdn}:3000"
}

output "mysql_server_fqdn" {
  value = azurerm_container_group.mysql.fqdn
}
