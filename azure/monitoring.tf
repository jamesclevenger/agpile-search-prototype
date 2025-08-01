# Application Insights for monitoring
resource "azurerm_log_analytics_workspace" "main" {
  name                = "log-unity-catalog-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                = "PerGB2018"
  retention_in_days   = 30

  tags = {
    Environment = var.environment
    Project     = "unity-catalog-search"
  }
}

resource "azurerm_application_insights" "main" {
  name                = "appi-unity-catalog-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "web"

  tags = {
    Environment = var.environment
    Project     = "unity-catalog-search"
  }
}

# Action Group for alerts
resource "azurerm_monitor_action_group" "main" {
  name                = "ag-unity-catalog-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  short_name          = "unity-cat"

  email_receiver {
    name          = "admin"
    email_address = var.admin_email
  }

  tags = {
    Environment = var.environment
    Project     = "unity-catalog-search"
  }
}

# Metric alert for web service availability
resource "azurerm_monitor_metric_alert" "web_availability" {
  name                = "alert-web-availability-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_container_group.web.id]
  description         = "Web service availability alert"

  criteria {
    metric_namespace = "Microsoft.ContainerInstance/containerGroups"
    metric_name      = "CpuUsage"
    aggregation      = "Average"
    operator         = "LessThan"
    threshold        = 0.1
  }

  action {
    action_group_id = azurerm_monitor_action_group.main.id
  }

  tags = {
    Environment = var.environment
    Project     = "unity-catalog-search"
  }
}

# Dashboard for monitoring
resource "azurerm_portal_dashboard" "main" {
  name                = "dashboard-unity-catalog-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  dashboard_properties = jsonencode({
    lenses = {
      "0" = {
        order = 0
        parts = {
          "0" = {
            position = {
              x = 0
              y = 0
              rowSpan = 4
              colSpan = 6
            }
            metadata = {
              inputs = []
              type = "Extension/Microsoft_Azure_Monitoring/PartType/MetricsChartPart"
              settings = {
                content = {
                  chartTitle = "Container CPU Usage"
                  metrics = [
                    {
                      resourceMetadata = {
                        id = azurerm_container_group.web.id
                      }
                      name = "CpuUsage"
                      aggregationType = "Average"
                      namespace = "Microsoft.ContainerInstance/containerGroups"
                    }
                  ]
                }
              }
            }
          }
          "1" = {
            position = {
              x = 6
              y = 0
              rowSpan = 4
              colSpan = 6
            }
            metadata = {
              inputs = []
              type = "Extension/Microsoft_Azure_Monitoring/PartType/MetricsChartPart"
              settings = {
                content = {
                  chartTitle = "Container Memory Usage"
                  metrics = [
                    {
                      resourceMetadata = {
                        id = azurerm_container_group.web.id
                      }
                      name = "MemoryUsage"
                      aggregationType = "Average"
                      namespace = "Microsoft.ContainerInstance/containerGroups"
                    }
                  ]
                }
              }
            }
          }
        }
      }
    }
  })

  tags = {
    Environment = var.environment
    Project     = "unity-catalog-search"
  }
}

# Additional variable for admin email
variable "admin_email" {
  description = "Admin email for alerts"
  type        = string
  default     = "admin@example.com"
}

# Output monitoring connection string
output "application_insights_connection_string" {
  value = azurerm_application_insights.main.connection_string
  sensitive = true
}