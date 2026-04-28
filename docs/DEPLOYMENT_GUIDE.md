# 🚀 TaskFlow — AWS Deployment Guide

This guide walks you through deploying the TaskFlow application to AWS. By the end, you will have a fully functional cloud-native task manager running on AWS infrastructure.

> **Estimated time:** 3–5 hours
> **AWS account type:** Free Tier is sufficient for most services
> **Region used in this guide:** `us-east-1` (N. Virginia) — feel free to choose another, but be consistent everywhere

---

## 📐 Architecture You Will Build

```
                        ┌──────────────────┐
   User Browser ───────▶│  Web Frontend    │  (S3 Static Hosting OR EC2)
                        │  (HTML/CSS/JS)   │
                        └────────┬─────────┘
                                 │  HTTPS
            ┌────────────────────┼────────────────────┐
            ▼                    ▼                    ▼
     ┌─────────────┐      ┌─────────────┐      ┌──────────────┐
     │   Cognito   │      │ API Gateway │      │      S3      │
     │ (Auth/JWT)  │      │  (REST API) │      │ (Attachments)│
     └─────────────┘      └──────┬──────┘      └──────────────┘
                                 │
                                 ▼
                       ┌────────────────────┐
                       │   Lambda Function  │
                       │   (task_handler)   │
                       └──┬─────────┬────┬──┘
                          │         │    │
                ┌─────────┘         │    └────────────┐
                ▼                   ▼                 ▼
        ┌──────────────┐    ┌──────────────┐   ┌─────────────┐
        │   DynamoDB   │    │     RDS      │   │     SQS     │
        │  (Tasks)     │    │  (Audit log) │   │  (Notif Q)  │
        └──────────────┘    └──────────────┘   └──────┬──────┘
                                                      │
                                                      ▼
                                          ┌──────────────────────┐
                                          │  Notification Lambda │
                                          │   (sends email/SES)  │
                                          └──────────────────────┘

                  CloudWatch monitors all Lambda + API Gateway logs
```

---

## 📋 Checklist Overview

You will deploy these AWS services in order:

- [ ] **1.** IAM Role for Lambda
- [ ] **2.** VPC (use the default — easier for students)
- [ ] **3.** S3 Bucket (for attachments + frontend hosting)
- [ ] **4.** DynamoDB Table (task storage)
- [ ] **5.** RDS Instance (audit log)
- [ ] **6.** SQS Queue (notifications)
- [ ] **7.** Cognito User Pool (authentication)
- [ ] **8.** Lambda Functions (backend logic)
- [ ] **9.** API Gateway (REST API)
- [ ] **10.** CloudWatch (dashboards + alarms)
- [ ] **11.** Frontend Deployment (S3 / EC2)

---

## 1️⃣ Create an IAM Role for Lambda

Lambda needs permission to access DynamoDB, S3, SQS, RDS, and CloudWatch.

1. Open **IAM Console** → **Roles** → **Create role**.
2. **Trusted entity:** AWS service → **Lambda**.
3. Attach these AWS-managed policies:
   - `AWSLambdaBasicExecutionRole` (CloudWatch logs)
   - `AmazonDynamoDBFullAccess` (for DynamoDB)
   - `AmazonS3FullAccess` (for S3)
   - `AmazonSQSFullAccess` (for SQS)
   - `AmazonRDSDataFullAccess` (for RDS)
   - `AmazonSESFullAccess` (for sending emails — optional)
4. **Role name:** `TaskFlowLambdaRole`.
5. Click **Create role**.

> 💡 In production you should write a tighter custom policy. The above is fine for a class project.

---

## 2️⃣ S3 Bucket for Attachments

1. Open **S3 Console** → **Create bucket**.
2. **Bucket name:** `taskflow-attachments-<your-name>` (must be globally unique).
3. **Region:** `us-east-1`.
4. **Block all public access:** ✅ keep this **enabled** (we use presigned URLs).
5. Create the bucket.
6. Open the bucket → **Permissions** → **CORS** → paste:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

> ⚠️ Replace `"*"` in `AllowedOrigins` with your actual frontend URL once known.

📝 **Save:** Bucket name → you'll need it later as `ATTACHMENTS_BUCKET`.

---

## 3️⃣ DynamoDB Table

1. Open **DynamoDB Console** → **Tables** → **Create table**.
2. **Table name:** `TaskFlowTasks`
3. **Partition key:** `userId` (String)
4. **Sort key:** `taskId` (String)
5. **Settings:** Default settings (on-demand capacity is fine).
6. **Create table.**

📝 **Save:** Table name → `TASKS_TABLE` env var.

---

## 4️⃣ RDS Instance

1. Open **RDS Console** → **Create database**.
2. Choose **Standard create**.
3. **Engine:** MySQL.
4. **Templates:** **Free tier**.
5. **DB instance identifier:** `taskflow-db`.
6. **Master username:** `admin`.
7. **Master password:** (set & remember this!).
8. **DB instance class:** `db.t3.micro` (free tier).
9. **Storage:** 20 GB GP2 (default).
10. **Connectivity:**
    - VPC: default VPC.
    - Public access: **Yes** (so Lambda outside VPC can connect — for class project simplicity).
    - VPC security group: create new → name it `taskflow-rds-sg`.
11. **Database options** → **Initial database name:** `taskflow`.
12. Click **Create database**. Wait ~10 minutes.
13. Once available, click on the DB → **Connectivity & security** → click the security group → **Inbound rules** → **Edit** → **Add rule**:
    - Type: MySQL/Aurora (port 3306)
    - Source: Anywhere-IPv4 (`0.0.0.0/0`) **for class simplicity** ⚠️
14. **Connect and run the schema:**

```bash
mysql -h <YOUR_RDS_ENDPOINT> -u admin -p < infrastructure/rds_schema.sql
```

📝 **Save:** Endpoint, username, password, database name (`taskflow`).

---

## 5️⃣ SQS Queue for Notifications

1. Open **SQS Console** → **Create queue**.
2. **Type:** Standard.
3. **Name:** `TaskFlowNotifications`.
4. Use default settings → **Create queue**.

📝 **Save:** Queue URL → `NOTIFICATIONS_QUEUE` env var.

---

## 6️⃣ Cognito User Pool

1. Open **Cognito Console** → **Create user pool**.
2. **Sign-in options:** ✅ Email.
3. **Password policy:** Cognito defaults.
4. **MFA:** No MFA (for class).
5. **Self-service sign-up:** ✅ enabled.
6. **Required attributes:** `email`, `name`.
7. **Email provider:** Send email with Cognito (default).
8. **User pool name:** `TaskFlowUserPool`.
9. **App client:**
    - **Client name:** `TaskFlowWebClient`.
    - **Client secret:** ❌ **Don't generate a secret** (the browser SDK can't use one).
    - Auth flows: enable `ALLOW_USER_PASSWORD_AUTH` and `ALLOW_USER_SRP_AUTH`.
10. **Create user pool.**

📝 **Save:**
- User Pool ID → `COGNITO_USER_POOL_ID`
- App Client ID → `COGNITO_APP_CLIENT_ID`

---

## 7️⃣ Deploy the Lambda Functions

### A. Package the main task handler

```bash
cd backend/lambdas
mkdir package
pip install pymysql -t package/
cp task_handler.py package/
cd package
zip -r ../task_handler.zip .
cd ..
```

### B. Create the function in AWS

1. Open **Lambda Console** → **Create function**.
2. **Author from scratch.**
3. **Function name:** `TaskFlowAPIHandler`.
4. **Runtime:** Python 3.11.
5. **Architecture:** x86_64.
6. **Permissions:** Use existing role → `TaskFlowLambdaRole`.
7. **Create function.**
8. **Upload the zip:** Code source → **Upload from** → `.zip file` → upload `task_handler.zip`.
9. **Handler:** `task_handler.lambda_handler`.
10. **Configuration → General configuration:**
    - Timeout: 30 seconds
    - Memory: 256 MB
11. **Configuration → Environment variables:** add the values you saved earlier:

| Key | Example value |
|---|---|
| `TASKS_TABLE` | `TaskFlowTasks` |
| `ATTACHMENTS_BUCKET` | `taskflow-attachments-yourname` |
| `NOTIFICATIONS_QUEUE` | `https://sqs.us-east-1.amazonaws.com/123/TaskFlowNotifications` |
| `RDS_HOST` | `taskflow-db.xxx.us-east-1.rds.amazonaws.com` |
| `RDS_USER` | `admin` |
| `RDS_PASSWORD` | (your password) |
| `RDS_DB` | `taskflow` |

### C. Create the notification Lambda

Repeat steps A–B with `notification_handler.py`:
- **Function name:** `TaskFlowNotificationHandler`.
- Handler: `notification_handler.lambda_handler`.
- Env vars: `USE_SES=false` (set to `true` later if you verify SES).
- **Triggers** → **Add trigger** → **SQS** → select `TaskFlowNotifications` → **Add**.

---

## 8️⃣ API Gateway (REST API)

1. Open **API Gateway** → **Create API** → **REST API** (NOT private/HTTP).
2. **API name:** `TaskFlowAPI`.
3. **Endpoint type:** Regional.
4. **Create API.**

### Create the resources:

For each path below, click **Actions → Create Resource**:

| Resource | Path part |
|---|---|
| `/tasks` | `tasks` |
| `/tasks/{id}` | `{id}` (under `/tasks`) |
| `/tasks/{id}/attachment` | `attachment` (under `/tasks/{id}`) |

For **each** resource, click **Actions → Create Method**, then create methods as follows. For each method, choose:
- Integration type: **Lambda Function**
- ✅ **Use Lambda Proxy integration**
- Lambda function: `TaskFlowAPIHandler`

| Resource | Methods to create |
|---|---|
| `/tasks` | `GET`, `POST`, `OPTIONS` |
| `/tasks/{id}` | `GET`, `PUT`, `DELETE`, `OPTIONS` |
| `/tasks/{id}/attachment` | `POST`, `OPTIONS` |

### Enable CORS:

For each resource, click **Actions → Enable CORS** and accept the defaults. This auto-creates the `OPTIONS` method.

### Add Cognito Authorization:

1. In the left sidebar → **Authorizers** → **Create New Authorizer**.
2. **Name:** `CognitoAuthorizer`.
3. **Type:** Cognito.
4. **Cognito User Pool:** select `TaskFlowUserPool`.
5. **Token Source:** `Authorization`.
6. **Create.**

Then for **each** non-OPTIONS method (GET/POST/PUT/DELETE):
- Click the method → **Method Request** → **Authorization** → set to `CognitoAuthorizer`.

### Deploy the API:

1. **Actions → Deploy API**.
2. **Stage:** `prod` (create new).
3. **Deploy.**

📝 **Save:** Invoke URL shown at the top → `API_BASE_URL`.

---

## 9️⃣ Configure & Deploy the Frontend

### A. Update `frontend/config.js`

Open `frontend/config.js` and replace the placeholders:

```js
const CONFIG = {
    REGION: "us-east-1",
    COGNITO_USER_POOL_ID: "us-east-1_AbCdEfGhI",            // ← your value
    COGNITO_APP_CLIENT_ID: "1a2b3c4d5e6f7g8h9i0j1k2l3m",   // ← your value
    API_BASE_URL: "https://abc123.execute-api.us-east-1.amazonaws.com/prod" // ← your value
};
```

### B. Option 1 — Host on S3 (simple, recommended)

```bash
# Create a bucket for the frontend
aws s3 mb s3://taskflow-web-yourname --region us-east-1

# Enable static website hosting
aws s3 website s3://taskflow-web-yourname --index-document index.html

# Upload the frontend
aws s3 sync frontend/ s3://taskflow-web-yourname --acl public-read
```

Then in the bucket → **Permissions** → **Block public access** → uncheck and confirm. Add a bucket policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicRead",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::taskflow-web-yourname/*"
  }]
}
```

Open the **Bucket website endpoint** URL and you're done.

### B. Option 2 — Host on EC2

1. Launch a `t2.micro` Amazon Linux 2 instance in the **default VPC, public subnet**.
2. Security group: open ports `22` (SSH from your IP) and `80` (HTTP from anywhere).
3. SSH in and install nginx:
   ```bash
   sudo yum install -y nginx
   sudo systemctl enable --now nginx
   ```
4. Copy the frontend files:
   ```bash
   scp -i your-key.pem -r frontend/* ec2-user@<EC2_IP>:/tmp/web/
   ssh -i your-key.pem ec2-user@<EC2_IP> 'sudo cp -r /tmp/web/* /usr/share/nginx/html/'
   ```
5. Visit `http://<EC2_IP>` in your browser.

---

## 🔟 CloudWatch Monitoring

1. Open **CloudWatch Console** → **Dashboards** → **Create dashboard** → name it `TaskFlowDashboard`.
2. Add widgets:
   - **Lambda invocations** (metric: `AWS/Lambda` → `Invocations` → `TaskFlowAPIHandler`).
   - **Lambda errors** (metric: `Errors`).
   - **Lambda duration** (metric: `Duration`, statistic: Average + p99).
   - **API Gateway 4XX/5XX errors** (metric: `AWS/ApiGateway` → `4XXError`, `5XXError`).
   - **DynamoDB read/write capacity** (metric: `AWS/DynamoDB` → `ConsumedReadCapacityUnits`).
   - **SQS messages** (metric: `AWS/SQS` → `ApproximateNumberOfMessagesVisible`).

3. **Create an alarm:**
   - **Alarms → Create alarm** → metric: Lambda `Errors` for `TaskFlowAPIHandler`.
   - Threshold: greater than `5` in 5 minutes.
   - Action: Create SNS topic → email yourself → Confirm.

---

## ✅ Verify Everything Works

1. Open the frontend URL.
2. **Sign Up** with a real email.
3. Check your inbox for the Cognito verification code → enter it.
4. **Sign In**.
5. **Create a task** → it should appear immediately.
6. **Attach a file** → it should upload to S3.
7. **Edit & delete** a task.
8. Check **CloudWatch Logs** under `/aws/lambda/TaskFlowAPIHandler` for runtime logs.
9. Check **DynamoDB** → table → **Explore items** to see your data.
10. Check **SQS** → `TaskFlowNotifications` → see message activity.

---

## 🐛 Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Unauthorized` on every API call | Authorizer not attached to method, or wrong token source name |
| CORS error in browser | Forgot to enable CORS on a resource, or `OPTIONS` method missing |
| `Internal Server Error` from Lambda | Check `/aws/lambda/TaskFlowAPIHandler` logs in CloudWatch |
| `Could not connect to RDS` | RDS security group doesn't allow Lambda's IP (or set RDS public access = Yes for class) |
| File upload fails | S3 CORS config missing or bucket name wrong in env var |
| `User does not exist` on sign-up | Cognito app client has secret enabled — recreate without secret |

---

## 💰 Cost Estimate (Free Tier)

If you stay within Free Tier limits, this entire stack costs **$0/month** for the first 12 months.

After Free Tier:
- Lambda: ~$0.20 per million requests
- DynamoDB on-demand: ~$1.25 per million writes
- RDS `db.t3.micro`: ~$15/month (only this one is meaningfully chargeable)
- API Gateway: ~$3.50 per million requests
- S3: ~$0.023/GB/month

> 🛑 **Don't forget to delete resources after the course ends!** Especially the RDS instance.

---

## 🧹 Tear-Down (when you're done)

```bash
# Delete in reverse order of creation
aws apigateway delete-rest-api --rest-api-id <id>
aws lambda delete-function --function-name TaskFlowAPIHandler
aws lambda delete-function --function-name TaskFlowNotificationHandler
aws cognito-idp delete-user-pool --user-pool-id <id>
aws sqs delete-queue --queue-url <url>
aws rds delete-db-instance --db-instance-identifier taskflow-db --skip-final-snapshot
aws dynamodb delete-table --table-name TaskFlowTasks
aws s3 rb s3://taskflow-attachments-yourname --force
aws s3 rb s3://taskflow-web-yourname --force
```

---

## 📚 What You Learned

- ✅ Designing a serverless cloud architecture
- ✅ Securing APIs with Cognito + IAM
- ✅ Combining relational (RDS) and NoSQL (DynamoDB) storage
- ✅ Asynchronous processing with SQS
- ✅ Real-time monitoring with CloudWatch
- ✅ Using S3 presigned URLs for direct uploads
- ✅ Cost-aware cloud engineering

Good luck and have fun with AWS! ☁️🚀
