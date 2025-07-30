terraform {
  backend "azurerm" {
    resource_group_name  = "rg-fairgrounds-search"
    storage_account_name = "tfstate1753912433"
    container_name       = "tfstate"
    key                  = "terraform.tfstate"
  }
}
