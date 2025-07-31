terraform {
  backend "azurerm" {
    resource_group_name  = "rg-unity-catalog-search"
    storage_account_name = "tf1753924138"
    container_name       = "tfstate"
    key                  = "terraform.tfstate"
  }
}
