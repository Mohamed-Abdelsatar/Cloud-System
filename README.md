# 🌊 TaskFlow — Cloud Task Manager on AWS

A complete, production-ready task management application built for the **Cloud Computing course project**. Students deploy this pre-built system on AWS to learn cloud architecture hands-on.

![TaskFlow](https://img.shields.io/badge/AWS-Ready-orange) ![Status](https://img.shields.io/badge/Status-Ready_to_Deploy-success) ![License](https://img.shields.io/badge/License-MIT-blue)

---

## 📦 What's Inside

```
task-manager/
├── frontend/                    ← Static web app (HTML/CSS/JS)
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── config.js                ← STUDENTS EDIT THIS
│
├── backend/lambdas/             ← Python Lambda functions
│   ├── task_handler.py          ← Main API logic (CRUD + S3)
│   ├── notification_handler.py  ← SQS → email
│   └── requirements.txt
│
├── infrastructure/
│   └── rds_schema.sql           ← Run once on RDS
│
└── docs/
    ├── DEPLOYMENT_GUIDE.md      ← Step-by-step AWS setup
    ├── USER_MANUAL.md           ← How to use the app
    └── ARCHITECTURE.md          ← Architecture diagram & flow
```

---

## ✅ Project Requirements Coverage

Every requirement from the project brief is implemented:

| Requirement | Implementation |
|---|---|
| **Amazon Cognito** — User auth | Sign-up, sign-in, email verification |
| **IAM** — Resource access control | `TaskFlowLambdaRole` with least-needed policies |
| **EC2 + VPC** — Hosting option | Frontend can be hosted on EC2 in default VPC |
| **Amazon S3** — File attachments | Direct browser upload via presigned URLs |
| **DynamoDB** — Non-relational data | Stores task metadata (partition `userId`, sort `taskId`) |
| **RDS (MySQL)** — Relational data | User profiles + task audit log + sharing table |
| **Lambda** — Serverless backend | `task_handler.py` for CRUD, `notification_handler.py` for SQS |
| **API Gateway** — REST API | `/tasks`, `/tasks/{id}`, `/tasks/{id}/attachment` |
| **CloudWatch** — Monitoring | Dashboard + alarms for Lambda errors |
| **SQS** — Async notifications | Queues task updates → notification Lambda → email |

### Key Features
- ✅ Secure user sign-up, sign-in, email verification
- ✅ Create / read / update / delete tasks
- ✅ Filter by status (pending / in progress / completed)
- ✅ Priority levels (high / medium / low)
- ✅ Due dates
- ✅ File attachments (uploaded directly to S3)
- ✅ Async email notifications on task changes
- ✅ Real-time dashboard stats
- ✅ Beautiful, colorful, fully responsive UI

---

## 🚀 Quick Start for Students

1. **Read** `docs/DEPLOYMENT_GUIDE.md` — full step-by-step instructions
2. **Deploy AWS resources** in this order:
   - IAM role → S3 → DynamoDB → RDS → SQS → Cognito → Lambda → API Gateway → CloudWatch
3. **Edit `frontend/config.js`** with your AWS resource IDs
4. **Upload `frontend/`** to an S3 bucket (or EC2 instance)
5. **Sign up** through the UI and start creating tasks

⏱️ **Estimated deployment time:** 3–5 hours

---

## 🎨 UI Preview

The frontend uses a vibrant pastel palette (coral pink, mint teal, sun yellow, lavender purple) with the *Bricolage Grotesque* display font for a modern, friendly feel — built with vanilla HTML/CSS/JS so no build tools are needed.

---

## 📚 For TAs / Instructors

- The system is **deployment-ready** — students only configure AWS, they don't write code.
- All AWS service interactions are wired up and tested.
- The deployment guide is written for students who have completed the Cloud Computing lectures.
- Each major step has verification checkpoints so students know they're on track.
- A troubleshooting section in `DEPLOYMENT_GUIDE.md` covers the most common issues.

### Suggested Grading Rubric

| Component | Weight |
|---|---|
| All 10 AWS services correctly deployed | 40% |
| Working end-to-end functionality (sign-up → create → notify) | 25% |
| CloudWatch dashboard + alarm configured | 10% |
| Architecture diagram (drawn by student) | 10% |
| Setup guide / documentation | 10% |
| Presentation / demo | 5% |

---

## 📄 License

MIT — free for educational use.
