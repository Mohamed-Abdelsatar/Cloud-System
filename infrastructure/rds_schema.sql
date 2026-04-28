-- ============================================================
-- TaskFlow RDS Schema (MySQL / PostgreSQL compatible-ish)
-- ============================================================
-- Run this once after your RDS instance is up.
-- Connect via: mysql -h <RDS_ENDPOINT> -u admin -p
-- Then: source rds_schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS taskflow;
USE taskflow;

-- User profiles (Cognito holds auth; this stores extra profile data + relations)
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id        VARCHAR(64) PRIMARY KEY,         -- Cognito sub
    email          VARCHAR(255) UNIQUE NOT NULL,
    full_name      VARCHAR(255),
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login_at  DATETIME
);

-- Audit / activity log of all task actions
CREATE TABLE IF NOT EXISTS task_audit (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     VARCHAR(64) NOT NULL,
    user_email  VARCHAR(255),
    action      VARCHAR(32) NOT NULL,   -- create | update | delete
    task_id     VARCHAR(64) NOT NULL,
    ts          DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_task (task_id),
    INDEX idx_ts (ts)
);

-- Optional: shared/collaborative tasks (relational data — RDS shines here)
CREATE TABLE IF NOT EXISTS task_shares (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    task_id         VARCHAR(64) NOT NULL,
    owner_user_id   VARCHAR(64) NOT NULL,
    shared_with     VARCHAR(64) NOT NULL,
    permission      ENUM('view', 'edit') DEFAULT 'view',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_share (task_id, shared_with),
    INDEX idx_shared_with (shared_with)
);
