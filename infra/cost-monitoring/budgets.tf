locals {
  alert_email = var.cost_alert_email

  environments = {
    prod    = { limit = var.monthly_budget_prod }
    staging = { limit = var.monthly_budget_staging }
  }
}

resource "aws_budgets_budget" "monthly" {
  for_each = local.environments

  name         = "paystream-${each.key}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(each.value.limit)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Environment$${each.key}"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [local.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [local.alert_email]
  }
}

resource "aws_budgets_budget" "service_breakdown" {
  name         = "paystream-all-services-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_prod + var.monthly_budget_staging)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_types {
    include_credit             = false
    include_discount           = true
    include_other_subscription = true
    include_recurring          = true
    include_refund             = false
    include_support            = true
    include_tax                = true
    include_upfront            = true
    use_blended                = false
  }
}
