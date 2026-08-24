const axios = require('axios');
const logger = require('../../../../shared/logger');

/**
 * Authenticates with OAuth 2.0 and retrieves content
 * @param {string} url - The URL to access
 * @param {Object} config - Authentication configuration
 * @returns {Object} - Result with success status and HTML content
 */
const authenticateRequest = async (url, config = {}) => {
  if (!config || !config.type) {
    return { success: false, error: 'Authentication configuration required' };
  }

  try {
    // Handle different authentication types
    switch (config.type) {
      case 'oauth2':
        return await handleOAuth2(url, config);
      case 'basic':
        return await handleBasicAuth(url, config);
      case 'token':
        return await handleTokenAuth(url, config);
      default:
        return { success: false, error: `Unsupported authentication type: ${config.type}` };
    }
  } catch (error) {
    logger.error(`Authentication error: ${error.message}`, { error });
    return { success: false, error: error.message };
  }
};

/**
 * Handle OAuth 2.0 authentication
 */
const handleOAuth2 = async (targetUrl, config) => {
  // Get the token
  const tokenResponse = await axios.post(config.tokenUrl, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: config.grantType || 'client_credentials',
    scope: config.scope || ''
  }, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  if (!tokenResponse.data.access_token) {
    return { success: false, error: 'Failed to obtain access token' };
  }

  // Use the token to access the protected resource
  const response = await axios.get(targetUrl, {
    headers: {
      'Authorization': `Bearer ${tokenResponse.data.access_token}`,
      'User-Agent': process.env.USER_AGENT || 'web-crawler-bot/1.0'
    }
  });

  return {
    success: true,
    html: response.data
  };
};

/**
 * Handle Basic authentication
 */
const handleBasicAuth = async (targetUrl, config) => {
  const response = await axios.get(targetUrl, {
    auth: {
      username: config.username,
      password: config.password
    },
    headers: {
      'User-Agent': process.env.USER_AGENT || 'web-crawler-bot/1.0'
    }
  });

  return {
    success: true,
    html: response.data
  };
};

/**
 * Handle API Token authentication
 */
const handleTokenAuth = async (targetUrl, config) => {
  const headers = {
    'User-Agent': process.env.USER_AGENT || 'web-crawler-bot/1.0'
  };

  // Add the token to the specified header or as a query parameter
  if (config.headerName) {
    headers[config.headerName] = config.token;
  } else {
    // Add token as query parameter
    const separator = targetUrl.includes('?') ? '&' : '?';
    targetUrl = `${targetUrl}${separator}${config.paramName || 'access_token'}=${config.token}`;
  }

  const response = await axios.get(targetUrl, { headers });

  return {
    success: true,
    html: response.data
  };
};

module.exports = { authenticateRequest };
