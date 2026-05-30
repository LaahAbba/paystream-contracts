variable "project_name" {
  type    = string
  default = "paystream"
}

variable "db_username" {
  type = string
}

variable "db_password" {
  type      = string
  sensitive = true
}
