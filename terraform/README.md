# PayStream Infrastructure as Code (Terraform)

This directory contains the Terraform configuration to deploy the PayStream infrastructure on AWS.

## Architecture

The infrastructure consists of:
- **VPC**: A dedicated VPC with public and private subnets across 2 Availability Zones.
- **RDS (PostgreSQL)**: A managed PostgreSQL database in the private subnets.
- **ElastiCache (Redis)**: A managed Redis cluster in the private subnets (used by BullMQ).
- **ECS (Fargate)**: An ECS cluster to run the API and background services (Indexer, Notification).

## Directory Structure

```
terraform/
├── modules/           # Reusable modules (VPC, RDS, Redis, ECS)
└── environments/      # Environment-specific configurations
    ├── staging/       # Staging environment
    └── prod/          # Production environment
```

## Prerequisites

1. [Terraform](https://www.terraform.io/downloads.html) installed.
2. AWS CLI configured with appropriate credentials.
3. An S3 bucket named `paystream-terraform-state` and a DynamoDB table named `paystream-terraform-locks` for remote state management.

## Deployment Instructions

### 1. Initialize Terraform

Navigate to the environment directory you wish to deploy:

```bash
cd terraform/environments/staging
# or
cd terraform/environments/prod
```

Initialize the backend and modules:

```bash
terraform init
```

### 2. Configure Variables

Create a `terraform.tfvars` file in the environment directory:

```hcl
db_username = "paystream_admin"
db_password = "your-secure-password"
```

### 3. Plan Deployment

Review the changes that Terraform will perform:

```bash
terraform plan
```

### 4. Apply Deployment

Deploy the infrastructure:

```bash
terraform apply
```

### 5. Cleanup

To destroy the infrastructure:

```bash
terraform destroy
```

## State Management

The state is stored in S3 with DynamoDB for state locking to prevent concurrent modifications.

- **Bucket**: `paystream-terraform-state`
- **Lock Table**: `paystream-terraform-locks`
- **Region**: `us-east-1`
