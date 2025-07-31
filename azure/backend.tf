terraform {
  backend "azurerm" {
    resource_group_name  = "rg-unity-catalog-search"
    storage_account_name = "tf1753993998"
    container_name       = "tfstate"
    key                  = "terraform.tfstate"
  }
}
