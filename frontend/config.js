// ============================================================
// AWS CONFIGURATION
// ============================================================
// FILL IN THESE VALUES FROM YOUR AWS DEPLOYMENT
// You will get these values after completing the AWS setup
// described in DEPLOYMENT_GUIDE.md
// ============================================================

const CONFIG = {
    // Region where your AWS resources are deployed
    REGION: "us-east-1",

    // ---- Amazon Cognito ----
    // Get these from: Cognito Console > User Pools > Your Pool
    COGNITO_USER_POOL_ID: "us-east-1_XXXXXXXXX",
    COGNITO_APP_CLIENT_ID: "XXXXXXXXXXXXXXXXXXXXXXXXXX",

    // ---- API Gateway ----
    // Get this from: API Gateway Console > Your API > Stages
    // Format: https://xxxxxxxxxx.execute-api.<region>.amazonaws.com/<stage>
    API_BASE_URL: "https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/prod"
};
