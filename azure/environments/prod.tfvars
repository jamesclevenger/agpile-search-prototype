# Production Environment Configuration
resource_group_name = "rg-unity-catalog-search"
location           = "East US 2"
environment        = "prod"

# Production-specific settings (these will be set via GitHub Secrets)
# mysql_admin_password = "set-via-github-secrets"
# databricks_token = "set-via-github-secrets"
# databricks_workspace_url = "set-via-github-secrets"