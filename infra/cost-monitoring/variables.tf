variable "monthly_budget_prod" {
  description = "Monthly AWS spend limit (USD) for the prod environment"
  type        = number
  default     = 500
}

variable "monthly_budget_staging" {
  description = "Monthly AWS spend limit (USD) for the staging environment"
  type        = number
  default     = 150
}

variable "cost_alert_email" {
  description = "Email address to receive budget alert notifications"
  type        = string
}
