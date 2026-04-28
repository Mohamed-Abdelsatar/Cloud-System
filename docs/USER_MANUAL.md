# 📘 TaskFlow — User Manual

A guide for end-users of the TaskFlow application.

---

## 🌟 Getting Started

### Sign Up

1. Open the TaskFlow URL in your browser.
2. Click the **Sign Up** tab.
3. Enter your full name, email, and a password (minimum 8 characters).
4. Click **Create Account**.
5. Check your email for a 6-digit verification code from Amazon Cognito.

### Verify Your Email

1. After signing up, you're auto-redirected to the **Verify** tab.
2. Enter your email and the 6-digit code from your inbox.
3. Click **Verify Account**.

### Sign In

1. Switch to the **Sign In** tab.
2. Enter your email and password.
3. Click **Sign In**.

You'll land on your personal dashboard. Your session stays active across browser refreshes.

---

## 🎯 Managing Tasks

### Create a Task

1. Click the **+ New Task** button (top right of dashboard).
2. Fill in:
   - **Title** (required)
   - **Description** (optional)
   - **Status:** Pending / In Progress / Completed
   - **Priority:** 🟢 Low / 🟡 Medium / 🔴 High
   - **Due Date** (optional)
   - **Attachment** (optional file upload)
3. Click **Create Task**.

The task appears immediately on your board, and a notification is queued (you'll receive an email if SES is configured).

### Edit a Task

Hover over a task card and click the **pencil ✏️ icon**. Update any field, then click **Save Changes**.

### Quickly Toggle Status

Click the **checkmark ✅ icon** on a task to cycle through:
**Pending → In Progress → Completed → Pending**

### Delete a Task

Click the **trash 🗑️ icon** on the task. Confirm the deletion. The task's S3 attachment (if any) is also removed.

### Attach Files

When creating or editing a task, click **Choose File** and select any file (PDF, image, doc, etc.). Once saved, the attachment shows as a clickable link on the task card. Clicking the link opens a presigned S3 URL valid for 1 hour.

---

## 🔍 Filtering & Stats

### Stats Cards

The top of the dashboard shows live counts:
- 📋 **Total Tasks** — everything you've created
- ⏳ **Pending** — not started yet
- ⚡ **In Progress** — actively being worked on
- ✅ **Completed** — done!

### Filter Tasks

Use the filter buttons above the task grid:
- **All** — show everything
- **Pending** — only pending tasks
- **In Progress** — only active tasks
- **Done** — only completed tasks

---

## 🎨 Visual Cues

### Priority Stripe

Each task card has a colored stripe on its left edge:
- **Pink** = High priority
- **Yellow** = Medium priority
- **Teal** = Low priority

### Completed Tasks

Completed tasks appear faded with a strikethrough title.

### Status Badges

Each task shows badges for:
- Current status (color-coded)
- Priority level
- Due date (if set)

---

## 🚪 Sign Out

Click the **Logout** button in the top-right of the dashboard. Your session is cleared and you're returned to the login screen.

---

## 🔐 Security Notes

- Your password is **never** stored on TaskFlow's servers — it's handled by Amazon Cognito.
- All API requests are authenticated with a JWT token.
- File attachments are stored privately in S3 — only you can access them through presigned URLs.
- Each user can only see and modify their own tasks.

---

## 💡 Tips

- **Keyboard:** Press `Esc` to close the task modal.
- **Mobile:** The interface works on phones — try it!
- **Multiple devices:** Sign in from anywhere; all tasks sync via DynamoDB.
- **Large files:** Attachments are limited only by your browser's upload capabilities and S3's 5GB single-PUT limit.

---

## 🆘 Troubleshooting

| Problem | What to try |
|---|---|
| Didn't get verification email | Check spam folder; codes expire in 24h — request a new one by signing up again |
| "Unauthorized" message | Sign out and sign back in to refresh your token |
| Tasks not loading | Check your internet connection; the API might be cold-starting (wait a few seconds) |
| File won't upload | Check the file isn't too large (>5GB) or that your network isn't blocking S3 |

For other issues, contact your TA or course instructor.

---

Enjoy organizing your work with TaskFlow! ☁️✨
