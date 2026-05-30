const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });

async function fetchSecret(secretName) {
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);

  if (!response.SecretString) {
    throw new Error(`AWS Secrets Manager returned no secret for ${secretName}`);
  }

  return response.SecretString;
}

function assignSecrets(secretString) {
  let secretData;

  try {
    secretData = JSON.parse(secretString);
  } catch (error) {
    throw new Error('AWS Secrets Manager secret must be valid JSON');
  }

  if (!secretData || typeof secretData !== 'object') {
    throw new Error('AWS Secrets Manager secret must contain a JSON object');
  }

  Object.entries(secretData).forEach(([key, value]) => {
    if (typeof value !== 'string') {
      return;
    }
    process.env[key] = value;
  });
}

async function loadSecrets() {
  const enabled = process.env.USE_AWS_SECRETS_MANAGER === 'true';
  const secretName = process.env.AWS_SECRETS_MANAGER_SECRET_NAME;

  if (!enabled) {
    return;
  }

  if (!secretName) {
    throw new Error('AWS_SECRETS_MANAGER_SECRET_NAME is required when secrets manager is enabled');
  }

  const secretString = await fetchSecret(secretName);
  assignSecrets(secretString);
}

module.exports = {
  loadSecrets,
};
