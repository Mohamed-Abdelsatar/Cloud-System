"""
============================================================
TaskFlow Notification Lambda — SQS-triggered
============================================================
Triggered by messages in the notifications SQS queue.
Sends an email via SES (or just logs if SES not verified).

Environment variables:
  SES_FROM_ADDRESS     (optional) verified sender email
  USE_SES              "true" to actually send emails

Trigger: SQS event source mapping on the notifications queue.
"""

import json
import os
import logging
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ses = boto3.client("ses")
SES_FROM = os.environ.get("SES_FROM_ADDRESS", "")
USE_SES = os.environ.get("USE_SES", "false").lower() == "true"


def lambda_handler(event, context):
    """Process SQS messages in batches."""
    processed = 0
    failures = []

    for record in event.get("Records", []):
        try:
            msg = json.loads(record["body"])
            send_email(msg)
            processed += 1
        except Exception as e:
            logger.error(f"Failed to process record {record.get('messageId')}: {e}")
            # Add to batch item failures so SQS retries only this message
            failures.append({"itemIdentifier": record["messageId"]})

    logger.info(f"Processed {processed} notifications, {len(failures)} failed")
    return {"batchItemFailures": failures}


def send_email(msg):
    user_email = msg.get("userEmail")
    action = msg.get("action", "updated")
    task_title = msg.get("taskTitle", "(untitled)")

    if not user_email:
        logger.warning("No userEmail in message; skipping")
        return

    subject = f"TaskFlow: Your task was {action}"
    body_text = (
        f"Hi,\n\n"
        f"Your task '{task_title}' was {action} at {msg.get('timestamp')}.\n\n"
        f"— TaskFlow"
    )
    body_html = f"""
    <html><body style="font-family: sans-serif;">
        <h2 style="color: #A78BFA;">TaskFlow Notification</h2>
        <p>Your task <strong>{task_title}</strong> was <strong>{action}</strong>.</p>
        <p style="color: #888; font-size: 12px;">{msg.get("timestamp")}</p>
    </body></html>
    """

    if not USE_SES or not SES_FROM:
        logger.info(f"[DRY RUN] Would email {user_email}: {subject}")
        return

    ses.send_email(
        Source=SES_FROM,
        Destination={"ToAddresses": [user_email]},
        Message={
            "Subject": {"Data": subject},
            "Body": {
                "Text": {"Data": body_text},
                "Html": {"Data": body_html},
            },
        },
    )
    logger.info(f"Sent email to {user_email}")
