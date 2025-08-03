terraform {
  backend "azurerm" {
    resource_group_name  = "rg-unity-catalog-search"
    storage_account_name = "tf1754235759"
    container_name       = "tfstate"
    key                  = "terraform.tfstate"
  }
}
