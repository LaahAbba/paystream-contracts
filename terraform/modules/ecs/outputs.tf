output "cluster_id" {
  value = aws_ecs_cluster.main.id
}

output "ecs_sg_id" {
  value = aws_security_group.ecs.id
}

output "execution_role_arn" {
  value = aws_iam_role.ecs_task_execution_role.arn
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.main.name
}
