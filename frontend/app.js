// ============================================================
// TaskFlow — Frontend Application
// Connects to Amazon Cognito, API Gateway, and S3
// ============================================================

const { CognitoUserPool, CognitoUser, AuthenticationDetails, CognitoUserAttribute } =
    AmazonCognitoIdentity;

const userPool = new CognitoUserPool({
    UserPoolId: CONFIG.COGNITO_USER_POOL_ID,
    ClientId: CONFIG.COGNITO_APP_CLIENT_ID,
});

let currentUser = null;
let idToken = null;
let allTasks = [];
let currentFilter = "all";
let editingTaskId = null;

// ============================================================
// DOM
// ============================================================
const $ = (id) => document.getElementById(id);
const authScreen = $("auth-screen");
const appScreen = $("app-screen");
const authMsg = $("auth-message");
const tasksContainer = $("tasks-container");
const taskModal = $("task-modal");
const toast = $("toast");

// ============================================================
// AUTH UI
// ============================================================
document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".auth-form").forEach((f) => f.classList.remove("active"));
        btn.classList.add("active");
        $(btn.dataset.tab + "-form").classList.add("active");
        authMsg.className = "auth-message";
        authMsg.textContent = "";
    });
});

function showAuthMessage(text, type = "error") {
    authMsg.textContent = text;
    authMsg.className = "auth-message " + type;
}

// ============================================================
// SIGN UP
// ============================================================
$("signup-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("signup-name").value.trim();
    const email = $("signup-email").value.trim();
    const password = $("signup-password").value;

    const attrs = [
        new CognitoUserAttribute({ Name: "email", Value: email }),
        new CognitoUserAttribute({ Name: "name", Value: name }),
    ];

    userPool.signUp(email, password, attrs, null, (err, result) => {
        if (err) {
            showAuthMessage(err.message || "Sign up failed", "error");
            return;
        }
        showAuthMessage("Account created! Check your email for the verification code.", "success");
        $("confirm-email").value = email;
        setTimeout(() => {
            document.querySelector('[data-tab="confirm"]').click();
        }, 1200);
    });
});

// ============================================================
// CONFIRM
// ============================================================
$("confirm-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = $("confirm-email").value.trim();
    const code = $("confirm-code").value.trim();

    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
    cognitoUser.confirmRegistration(code, true, (err) => {
        if (err) {
            showAuthMessage(err.message || "Verification failed", "error");
            return;
        }
        showAuthMessage("Email verified! You can now sign in.", "success");
        setTimeout(() => {
            document.querySelector('[data-tab="signin"]').click();
            $("signin-email").value = email;
        }, 1200);
    });
});

// ============================================================
// SIGN IN
// ============================================================
$("signin-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = $("signin-email").value.trim();
    const password = $("signin-password").value;

    const authDetails = new AuthenticationDetails({ Username: email, Password: password });
    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });

    cognitoUser.authenticateUser(authDetails, {
        onSuccess: (session) => {
            currentUser = cognitoUser;
            idToken = session.getIdToken().getJwtToken();
            const payload = session.getIdToken().payload;
            const displayName = payload.name || payload.email || "User";

            $("user-name").textContent = displayName;
            $("user-avatar").textContent = displayName.charAt(0).toUpperCase();

            authScreen.classList.add("hidden");
            appScreen.classList.remove("hidden");
            loadTasks();
        },
        onFailure: (err) => {
            showAuthMessage(err.message || "Sign in failed", "error");
        },
    });
});

// ============================================================
// SESSION RESTORE
// ============================================================
function restoreSession() {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) return;

    cognitoUser.getSession((err, session) => {
        if (err || !session.isValid()) return;
        currentUser = cognitoUser;
        idToken = session.getIdToken().getJwtToken();
        const payload = session.getIdToken().payload;
        const displayName = payload.name || payload.email || "User";

        $("user-name").textContent = displayName;
        $("user-avatar").textContent = displayName.charAt(0).toUpperCase();

        authScreen.classList.add("hidden");
        appScreen.classList.remove("hidden");
        loadTasks();
    });
}

// ============================================================
// LOGOUT
// ============================================================
$("logout-btn").addEventListener("click", () => {
    if (currentUser) currentUser.signOut();
    idToken = null;
    currentUser = null;
    allTasks = [];
    appScreen.classList.add("hidden");
    authScreen.classList.remove("hidden");
});

// ============================================================
// API CALLS
// ============================================================
async function apiCall(method, path, body = null) {
    const opts = {
        method,
        headers: {
            "Content-Type": "application/json",
            Authorization: idToken,
        },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(CONFIG.API_BASE_URL + path, opts);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
    }
    if (res.status === 204) return null;
    return res.json();
}

async function loadTasks() {
    try {
        const data = await apiCall("GET", "/tasks");
        allTasks = data.tasks || [];
        renderTasks();
        updateStats();
    } catch (err) {
        showToast("Failed to load tasks: " + err.message, "error");
    }
}

// ============================================================
// RENDER
// ============================================================
function renderTasks() {
    const filtered =
        currentFilter === "all"
            ? allTasks
            : allTasks.filter((t) => t.status === currentFilter);

    if (filtered.length === 0) {
        tasksContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-illustration">${currentFilter === "all" ? "🎯" : "✨"}</div>
                <h3>${currentFilter === "all" ? "No tasks yet" : "Nothing here"}</h3>
                <p>${currentFilter === "all" ? 'Click "New Task" to create your first one' : "Try a different filter"}</p>
            </div>`;
        return;
    }

    // Sort: pending → in_progress → completed; then by createdAt desc
    const order = { pending: 0, in_progress: 1, completed: 2 };
    filtered.sort((a, b) => {
        const s = (order[a.status] ?? 3) - (order[b.status] ?? 3);
        if (s !== 0) return s;
        return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

    tasksContainer.innerHTML = filtered.map(renderTaskCard).join("");

    // Wire up actions
    tasksContainer.querySelectorAll("[data-action='edit']").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            openTaskModal(btn.dataset.id);
        });
    });
    tasksContainer.querySelectorAll("[data-action='delete']").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            deleteTask(btn.dataset.id);
        });
    });
    tasksContainer.querySelectorAll("[data-action='toggle']").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleStatus(btn.dataset.id);
        });
    });
}

function renderTaskCard(task) {
    const statusLabel = {
        pending: "Pending",
        in_progress: "In Progress",
        completed: "Completed",
    }[task.status] || task.status;

    const priorityLabel = {
        high: "🔴 High",
        medium: "🟡 Medium",
        low: "🟢 Low",
    }[task.priority] || "Medium";

    const dueBadge = task.dueDate
        ? `<span class="badge badge-due">📅 ${task.dueDate}</span>`
        : "";

    const attachment = task.attachmentUrl
        ? `<a href="${task.attachmentUrl}" target="_blank" class="task-attachment" rel="noopener">
                <svg viewBox="0 0 20 20" fill="none"><path d="M14.5 7.5L8 14a3 3 0 11-4.24-4.24l8-8a2 2 0 012.83 2.83l-8 8a1 1 0 11-1.42-1.42L11 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span>${escapeHtml(task.attachmentName || "Attachment")}</span>
            </a>`
        : "";

    return `
        <article class="task-card priority-${task.priority || "medium"} status-${task.status}">
            <div class="task-card-header">
                <h4 class="task-title-text">${escapeHtml(task.title)}</h4>
                <div class="task-actions-mini">
                    <button class="icon-btn" data-action="toggle" data-id="${task.taskId}" title="Toggle status">
                        <svg viewBox="0 0 20 20" fill="none"><path d="M4 10l4 4 8-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                    <button class="icon-btn" data-action="edit" data-id="${task.taskId}" title="Edit">
                        <svg viewBox="0 0 20 20" fill="none"><path d="M14 3l3 3-9 9H5v-3l9-9z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
                    </button>
                    <button class="icon-btn" data-action="delete" data-id="${task.taskId}" title="Delete">
                        <svg viewBox="0 0 20 20" fill="none"><path d="M5 6h10m-8 0V4a1 1 0 011-1h4a1 1 0 011 1v2m1 0v10a1 1 0 01-1 1H7a1 1 0 01-1-1V6h8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                </div>
            </div>
            ${task.description ? `<p class="task-desc">${escapeHtml(task.description)}</p>` : ""}
            <div class="task-meta">
                <span class="badge badge-status-${task.status}">${statusLabel}</span>
                <span class="badge badge-priority-${task.priority || "medium"}">${priorityLabel}</span>
                ${dueBadge}
            </div>
            ${attachment}
        </article>
    `;
}

function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function updateStats() {
    $("stat-total").textContent = allTasks.length;
    $("stat-progress").textContent = allTasks.filter((t) => t.status === "in_progress").length;
    $("stat-done").textContent = allTasks.filter((t) => t.status === "completed").length;
    $("stat-pending").textContent = allTasks.filter((t) => t.status === "pending").length;
}

// ============================================================
// FILTERS
// ============================================================
document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentFilter = btn.dataset.filter;
        renderTasks();
    });
});

// ============================================================
// MODAL
// ============================================================
$("new-task-btn").addEventListener("click", () => openTaskModal());
$("modal-close-btn").addEventListener("click", closeTaskModal);
$("cancel-task-btn").addEventListener("click", closeTaskModal);
document.querySelector(".modal-backdrop").addEventListener("click", closeTaskModal);

$("task-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    $("file-label-text").textContent = file ? file.name : "Choose file";
});

function openTaskModal(taskId = null) {
    editingTaskId = taskId;
    $("task-form").reset();
    $("file-label-text").textContent = "Choose file";

    if (taskId) {
        const t = allTasks.find((x) => x.taskId === taskId);
        if (!t) return;
        $("modal-title").textContent = "Edit Task";
        $("task-submit-text").textContent = "Save Changes";
        $("task-id").value = t.taskId;
        $("task-title").value = t.title || "";
        $("task-desc").value = t.description || "";
        $("task-status").value = t.status || "pending";
        $("task-priority").value = t.priority || "medium";
        $("task-due").value = t.dueDate || "";
    } else {
        $("modal-title").textContent = "New Task";
        $("task-submit-text").textContent = "Create Task";
        $("task-id").value = "";
    }

    taskModal.classList.remove("hidden");
}

function closeTaskModal() {
    taskModal.classList.add("hidden");
    editingTaskId = null;
}

// ============================================================
// CREATE / UPDATE TASK
// ============================================================
$("task-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector("button[type='submit']");
    submitBtn.disabled = true;

    try {
        const file = $("task-file").files[0];
        const taskData = {
            title: $("task-title").value.trim(),
            description: $("task-desc").value.trim(),
            status: $("task-status").value,
            priority: $("task-priority").value,
            dueDate: $("task-due").value || null,
        };

        let taskId = editingTaskId;
        let savedTask;

        if (editingTaskId) {
            savedTask = await apiCall("PUT", "/tasks/" + editingTaskId, taskData);
        } else {
            savedTask = await apiCall("POST", "/tasks", taskData);
            taskId = savedTask.task.taskId;
        }

        // Upload attachment if provided
        if (file) {
            await uploadAttachment(taskId, file);
        }

        closeTaskModal();
        await loadTasks();
        showToast(editingTaskId ? "Task updated ✨" : "Task created 🎉", "success");
    } catch (err) {
        showToast("Error: " + err.message, "error");
    } finally {
        submitBtn.disabled = false;
    }
});

async function uploadAttachment(taskId, file) {
    // Step 1: Get a presigned upload URL from the backend
    const presigned = await apiCall("POST", `/tasks/${taskId}/attachment`, {
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
    });

    // Step 2: Upload directly to S3
    const uploadRes = await fetch(presigned.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
    });
    if (!uploadRes.ok) throw new Error("Upload to S3 failed");
}

async function deleteTask(taskId) {
    if (!confirm("Delete this task?")) return;
    try {
        await apiCall("DELETE", "/tasks/" + taskId);
        await loadTasks();
        showToast("Task deleted 🗑️", "success");
    } catch (err) {
        showToast("Error: " + err.message, "error");
    }
}

async function toggleStatus(taskId) {
    const t = allTasks.find((x) => x.taskId === taskId);
    if (!t) return;
    const next = {
        pending: "in_progress",
        in_progress: "completed",
        completed: "pending",
    }[t.status] || "pending";

    try {
        await apiCall("PUT", "/tasks/" + taskId, { ...t, status: next });
        await loadTasks();
        showToast("Status: " + next.replace("_", " "), "success");
    } catch (err) {
        showToast("Error: " + err.message, "error");
    }
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = "success") {
    toast.textContent = message;
    toast.className = "toast " + type + " show";
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => (toast.className = "toast hidden"), 350);
    }, 3000);
}

// ============================================================
// INIT
// ============================================================
restoreSession();

// Config validation hint
if (CONFIG.COGNITO_USER_POOL_ID.includes("XXX") || CONFIG.API_BASE_URL.includes("XXX")) {
    setTimeout(() => {
        showAuthMessage(
            "⚠️ config.js still contains placeholder values. Update it with your AWS resource IDs.",
            "error"
        );
    }, 100);
}
