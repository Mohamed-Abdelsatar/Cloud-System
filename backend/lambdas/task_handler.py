"""
============================================================
TaskFlow Lambda Handler — Main API
============================================================
Handles all /tasks routes through API Gateway (proxy integration).

Routes:
  GET    /tasks                  -> list tasks for the user
  POST   /tasks                  -> create a task
  GET    /tasks/{id}             -> get one task
  PUT    /tasks/{id}             -> update task
  DELETE /tasks/{id}             -> delete task
  POST   /tasks/{id}/attachment  -> generate presigned S3 upload URL

AWS services used:
  - DynamoDB: stores task metadata
  - RDS (MySQL): stores user profile + task->user relation log
  - S3: stores attachments
  - SQS: queues notification messages on task updates
  - CloudWatch: implicit logging via print()

Environment variables required:
  TASKS_TABLE          DynamoDB table name (e.g., TaskFlowTasks)
  ATTACHMENTS_BUCKET   S3 bucket name for attachments
  NOTIFICATIONS_QUEUE  SQS queue URL for notifications
  RDS_HOST             RDS endpoint hostname
  RDS_USER             RDS username
  RDS_PASSWORD         RDS password
  RDS_DB               RDS database name (e.g., taskflow)
"""

import json
import os
import uuid
import datetime
import logging
import boto3
from boto3.dynamodb.conditions import Key

# ============================================================
# Setup
# ============================================================
logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")
sqs = boto3.client("sqs")

TASKS_TABLE = os.environ.get("TASKS_TABLE", "TaskFlowTasks")
ATTACHMENTS_BUCKET = os.environ.get("ATTACHMENTS_BUCKET", "")
NOTIFICATIONS_QUEUE = os.environ.get("NOTIFICATIONS_QUEUE", "")

table = dynamodb.Table(TASKS_TABLE)

# CORS headers — allow the frontend (hosted on S3 / EC2 / wherever) to call this API
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
}


# ============================================================
# Helpers
# ============================================================
def respond(status, body):
    return {
        "statusCode": status,
        "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
        "body": json.dumps(body, default=str),
    }


def get_user_id(event):
    """Extract Cognito user ID (sub) from the API Gateway authorizer claims."""
    try:
        claims = event["requestContext"]["authorizer"]["claims"]
        return claims["sub"], claims.get("email", "")
    except (KeyError, TypeError):
        return None, None


def send_notification(user_email, task, action):
    """Push a message to SQS so a separate Lambda can email the user."""
    if not NOTIFICATIONS_QUEUE:
        return
    try:
        sqs.send_message(
            QueueUrl=NOTIFICATIONS_QUEUE,
            MessageBody=json.dumps({
                "userEmail": user_email,
                "action": action,
                "taskTitle": task.get("title", ""),
                "taskId": task.get("taskId", ""),
                "timestamp": datetime.datetime.utcnow().isoformat(),
            }),
        )
    except Exception as e:
        logger.error(f"SQS send failed: {e}")


def log_to_rds(user_id, user_email, action, task_id):
    """
    Optional: write an audit row into RDS.

    This is wrapped so that if RDS is not yet configured the API still works.
    Students can flesh this out — the connection string is loaded from env vars.
    """
    try:
        import pymysql
        conn = pymysql.connect(
            host=os.environ["RDS_HOST"],
            user=os.environ["RDS_USER"],
            password=os.environ["RDS_PASSWORD"],
            database=os.environ["RDS_DB"],
            connect_timeout=3,
        )
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO task_audit (user_id, user_email, action, task_id, ts) "
                "VALUES (%s, %s, %s, %s, %s)",
                (user_id, user_email, action, task_id, datetime.datetime.utcnow()),
            )
        conn.commit()
        conn.close()
    except Exception as e:
        # Non-fatal — RDS may not be wired up yet
        logger.warning(f"RDS log skipped: {e}")


# ============================================================
# Handler entrypoint
# ============================================================
def lambda_handler(event, context):
    logger.info(f"Event: {json.dumps(event)[:500]}")

    method = event.get("httpMethod", "")
    path = event.get("resource", "")  # e.g., "/tasks/{id}"

    # CORS preflight
    if method == "OPTIONS":
        return respond(200, {"ok": True})

    # Auth
    user_id, user_email = get_user_id(event)
    if not user_id:
        return respond(401, {"error": "Unauthorized"})

    path_params = event.get("pathParameters") or {}
    task_id = path_params.get("id")

    try:
        body = json.loads(event["body"]) if event.get("body") else {}
    except json.JSONDecodeError:
        return respond(400, {"error": "Invalid JSON body"})

    # ---- Route dispatch ----
    if path == "/tasks" and method == "GET":
        return list_tasks(user_id)
    if path == "/tasks" and method == "POST":
        return create_task(user_id, user_email, body)
    if path == "/tasks/{id}" and method == "GET":
        return get_task(user_id, task_id)
    if path == "/tasks/{id}" and method == "PUT":
        return update_task(user_id, user_email, task_id, body)
    if path == "/tasks/{id}" and method == "DELETE":
        return delete_task(user_id, user_email, task_id)
    if path == "/tasks/{id}/attachment" and method == "POST":
        return generate_upload_url(user_id, task_id, body)

    return respond(404, {"error": f"Route not found: {method} {path}"})


# ============================================================
# Operations
# ============================================================
def list_tasks(user_id):
    """Query all tasks owned by this user (userId is the partition key)."""
    res = table.query(KeyConditionExpression=Key("userId").eq(user_id))
    items = res.get("Items", [])

    # Generate presigned download URLs for any attachments
    for item in items:
        if item.get("attachmentKey"):
            try:
                item["attachmentUrl"] = s3.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": ATTACHMENTS_BUCKET, "Key": item["attachmentKey"]},
                    ExpiresIn=3600,
                )
            except Exception as e:
                logger.error(f"Presign GET failed: {e}")

    return respond(200, {"tasks": items})


def get_task(user_id, task_id):
    res = table.get_item(Key={"userId": user_id, "taskId": task_id})
    item = res.get("Item")
    if not item:
        return respond(404, {"error": "Task not found"})
    if item.get("attachmentKey"):
        item["attachmentUrl"] = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": ATTACHMENTS_BUCKET, "Key": item["attachmentKey"]},
            ExpiresIn=3600,
        )
    return respond(200, {"task": item})


def create_task(user_id, user_email, body):
    if not body.get("title", "").strip():
        return respond(400, {"error": "Title is required"})

    now = datetime.datetime.utcnow().isoformat()
    task = {
        "userId": user_id,
        "taskId": str(uuid.uuid4()),
        "title": body["title"].strip(),
        "description": body.get("description", "").strip(),
        "status": body.get("status", "pending"),
        "priority": body.get("priority", "medium"),
        "dueDate": body.get("dueDate"),
        "createdAt": now,
        "updatedAt": now,
    }

    table.put_item(Item=task)
    log_to_rds(user_id, user_email, "create", task["taskId"])
    send_notification(user_email, task, "created")

    return respond(201, {"task": task})


def update_task(user_id, user_email, task_id, body):
    # Verify ownership
    existing = table.get_item(Key={"userId": user_id, "taskId": task_id}).get("Item")
    if not existing:
        return respond(404, {"error": "Task not found"})

    updates = {
        "title": body.get("title", existing["title"]).strip(),
        "description": body.get("description", existing.get("description", "")).strip(),
        "status": body.get("status", existing.get("status", "pending")),
        "priority": body.get("priority", existing.get("priority", "medium")),
        "dueDate": body.get("dueDate", existing.get("dueDate")),
        "updatedAt": datetime.datetime.utcnow().isoformat(),
    }

    expr_parts = []
    attr_values = {}
    attr_names = {}
    for k, v in updates.items():
        # 'status' is a DynamoDB reserved word — alias it
        attr_names[f"#{k}"] = k
        attr_values[f":{k}"] = v
        expr_parts.append(f"#{k} = :{k}")

    table.update_item(
        Key={"userId": user_id, "taskId": task_id},
        UpdateExpression="SET " + ", ".join(expr_parts),
        ExpressionAttributeNames=attr_names,
        ExpressionAttributeValues=attr_values,
    )

    refreshed = table.get_item(Key={"userId": user_id, "taskId": task_id})["Item"]
    log_to_rds(user_id, user_email, "update", task_id)
    send_notification(user_email, refreshed, "updated")

    return respond(200, {"task": refreshed})


def delete_task(user_id, user_email, task_id):
    existing = table.get_item(Key={"userId": user_id, "taskId": task_id}).get("Item")
    if not existing:
        return respond(404, {"error": "Task not found"})

    # Clean up S3 attachment if present
    if existing.get("attachmentKey") and ATTACHMENTS_BUCKET:
        try:
            s3.delete_object(Bucket=ATTACHMENTS_BUCKET, Key=existing["attachmentKey"])
        except Exception as e:
            logger.error(f"S3 delete failed: {e}")

    table.delete_item(Key={"userId": user_id, "taskId": task_id})
    log_to_rds(user_id, user_email, "delete", task_id)
    send_notification(user_email, existing, "deleted")

    return respond(200, {"deleted": task_id})


def generate_upload_url(user_id, task_id, body):
    """
    Returns a presigned S3 PUT URL for direct browser upload.
    After upload, the task's attachmentKey is updated.
    """
    if not ATTACHMENTS_BUCKET:
        return respond(500, {"error": "ATTACHMENTS_BUCKET not configured"})

    file_name = body.get("fileName", "attachment")
    content_type = body.get("contentType", "application/octet-stream")

    existing = table.get_item(Key={"userId": user_id, "taskId": task_id}).get("Item")
    if not existing:
        return respond(404, {"error": "Task not found"})

    key = f"attachments/{user_id}/{task_id}/{uuid.uuid4()}-{file_name}"

    upload_url = s3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": ATTACHMENTS_BUCKET,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=900,
    )

    # Save the key + filename onto the task
    table.update_item(
        Key={"userId": user_id, "taskId": task_id},
        UpdateExpression="SET attachmentKey = :k, attachmentName = :n, updatedAt = :u",
        ExpressionAttributeValues={
            ":k": key,
            ":n": file_name,
            ":u": datetime.datetime.utcnow().isoformat(),
        },
    )

    return respond(200, {"uploadUrl": upload_url, "key": key})
