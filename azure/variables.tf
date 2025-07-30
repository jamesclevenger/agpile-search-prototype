# Environment-specific configurations
locals {
  environments = {
    dev = {
      mysql_sku = "B_Standard_B1s"
      mysql_storage_gb = 20
      container_cpu = "0.5"
      container_memory = "1"
    }
    staging = {
      mysql_sku = "B_Standard_B2s"
      mysql_storage_gb = 50
      container_cpu = "1"
      container_memory = "2"
    }
    prod = {
      mysql_sku = "GP_Standard_D2ds_v4"
      mysql_storage_gb = 100
      container_cpu = "2"
      container_memory = "4"
    }
  }
}