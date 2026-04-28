# 🏛️ TaskFlow — Architecture

## High-Level Diagram

```
                              ┌──────────────────┐
   👤 User Browser ──────────▶│  Web Frontend    │
                              │ HTML/CSS/JS      │
                              │ (S3 or EC2)      │
                              └────────┬─────────┘
                                       │ HTTPS
                ┌──────────────────────┼──────────────────────┐
                ▼                      ▼                      ▼
         ┌─────────────┐         ┌─────────────┐       ┌──────────────┐
         │   Cognito   │         │ API Gateway │       │      S3      │
         │ User Pool   │◀────────│ /tasks/*    │       │ Attachments  │
         │ (JWT)       │  verify │ (REST API)  │       │ (Presigned)  │
         └─────────────┘         └──────┬──────┘       └──────────────┘
                                        │
                                        ▼
                              ┌────────────────────┐
                              │  Lambda            │
                              │ TaskFlowAPIHandler │ ──── CloudWatch Logs
                              │  (Python 3.11)     │
                              └──┬──────────┬──┬───┘
                                 │          │  │
                ┌────────────────┘          │  └─────────────────┐
                ▼                           ▼                    ▼
         ┌──────────────┐           ┌──────────────┐      ┌─────────────┐
         │  DynamoDB    │           │     RDS      │      │     SQS     │
         │ TaskFlowTasks│           │ MySQL        │      │ Notifications│
         │ (NoSQL)      │           │ taskflow DB  │      │ Queue       │
         └──────────────┘           └──────────────┘      └──────┬──────┘
                                                                 │
                                                                 ▼
                                                  ┌──────────────────────┐
                                                  │ Lambda               │
                                                  │ NotificationHandler  │
                                                  │ → SES → Email        │
                                                  └──────────────────────┘
```

---

## Service Roles

| Service | Role | Why this service |
|---|---|---|
| **Cognito** | User identity + JWT issuance | Managed auth, free tier covers 50K MAU, integrates natively with API Gateway |
| **API Gateway** | REST API gateway, request routing, auth enforcement | Pay-per-request, auto-scales, built-in Cognito authorizer |
| **Lambda (API)** | Stateless backend logic | Serverless, scales to zero, no server management |
| **DynamoDB** | Task storage | Single-digit ms reads, perfect for `userId`-keyed access |
| **RDS (MySQL)** | Audit log + user profiles | Strong consistency, joins, transactions for relational data |
| **S3** | File storage | Cheap, durable, supports presigned URLs for direct uploads |
| **SQS** | Decouples API from notifications | Survives Lambda failures, retries automatically |
| **Lambda (Notif)** | Sends emails async | Triggered by SQS, isolated from main API path |
| **CloudWatch** | Observability | Logs, metrics, dashboards, alarms — all built-in |

---

## Data Flow: Creating a Task with Attachment

1. **User submits** the New Task form (with a file).
2. **Frontend** calls `POST /tasks` with the JWT in the `Authorization` header.
3. **API Gateway** validates the JWT against the Cognito User Pool.
4. **Lambda** receives the event, extracts `sub` (user ID) from claims.
5. Lambda **writes the task** to DynamoDB (partition key = `userId`, sort key = `taskId`).
6. Lambda **enqueues a "created"** message to SQS.
7. Lambda **returns** `201 Created` with the new task's ID.
8. **Frontend** then calls `POST /tasks/{id}/attachment` to get a presigned S3 PUT URL.
9. Lambda **generates a presigned URL** scoped to the user's task and updates the DynamoDB record with the S3 key.
10. **Frontend uploads the file directly to S3** using the presigned URL — bytes never pass through Lambda or API Gateway, saving cost and time.
11. Meanwhile, **SQS triggers** the notification Lambda.
12. **Notification Lambda** sends an email via SES (or logs in dry-run mode).
13. **CloudWatch** captures all logs along the way.

---

## Why DynamoDB AND RDS?

The project requires both. Here's the rationale:

- **DynamoDB** stores the actual tasks. Each user only ever queries their own tasks (`userId` partition key), and we never need cross-user joins. This is a textbook NoSQL access pattern: predictable, low-latency, scales infinitely.

- **RDS** stores:
  - **`user_profiles`** — extended profile info beyond what Cognito tracks
  - **`task_audit`** — append-only log of every task action (good for analytics, compliance, time-series queries)
  - **`task_shares`** — many-to-many relationships between tasks and users (a future "share task" feature)

  These workloads benefit from SQL: aggregations (`COUNT(*) GROUP BY action`), foreign-key relationships, transactional integrity.

This dual-database pattern is real-world common — fast NoSQL for hot-path reads, relational for analytics and complex relationships.

---

## Security Posture

- **Authentication:** Cognito JWTs, validated at API Gateway (no custom code).
- **Authorization:** Lambda extracts `sub` from validated claims; every DynamoDB query is scoped to that `sub`. A user **cannot** access another user's tasks.
- **Network:** Lambda runs outside a VPC for class simplicity; in production you'd put RDS in a private subnet and run Lambda inside the VPC.
- **Secrets:** No secrets in code. RDS password lives in Lambda env vars (in production use AWS Secrets Manager).
- **Files:** S3 bucket blocks all public access. All file access goes through time-limited presigned URLs (1 hour for downloads, 15 min for uploads).
- **CORS:** Configured at both S3 and API Gateway levels.

---

## Cost Optimization

- **DynamoDB on-demand** — pay only per request, no idle cost
- **Lambda** — pay only per invocation + duration
- **API Gateway** — pay only per request
- **S3** — pay only for what's stored
- **SQS** — first 1M requests/month free
- **RDS `db.t3.micro`** — the only always-on cost (~$15/month after free tier)

For a class project staying within Free Tier, **total cost = $0** for the first 12 months.

---

## Monitoring Strategy

The CloudWatch dashboard tracks:

1. **API Gateway** — Request count, 4XX errors, 5XX errors, latency
2. **Lambda (API)** — Invocations, errors, duration, throttles, concurrent executions
3. **Lambda (Notification)** — Same metrics
4. **DynamoDB** — Consumed read/write capacity, throttled requests
5. **SQS** — Visible messages, age of oldest message (alerts if backed up)
6. **RDS** — CPU, connections, free storage

### Alarms
- Lambda errors > 5 in 5 min → email alert
- SQS oldest message > 5 minutes → email alert (queue is backing up)
- API Gateway 5XX rate > 1% → email alert

---

## Scalability

The architecture scales horizontally with no code changes:

- **Lambda** auto-scales up to 1,000 concurrent executions per region (request limit increase if more)
- **DynamoDB on-demand** scales reads and writes automatically
- **API Gateway** handles ~10K RPS out of the box
- **S3** is effectively unlimited
- **SQS** handles unlimited messages
- **RDS** is the bottleneck — for serious scale, move to Aurora or use read replicas

The audit log writes to RDS are non-blocking (wrapped in try/except), so even if RDS is slow, the API stays responsive.
