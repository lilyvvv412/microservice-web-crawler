const jwt = require('jsonwebtoken');
const { config } = require('../../../../shared/config');
const { logger } = require('../../../../shared/logger');

/**
 * Middleware to authenticate requests using JWT
 */
const authenticate = (req, res, next) => {
  try {
    // Get the token from the Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required. Please provide a valid token.'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify the token
    const decoded = jwt.verify(token, config.JWT_SECRET);

    // Add the user to the request object
    req.user = decoded;

    next();
  } catch (error) {
    logger.error(`Authentication error: ${error.message}`);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token expired. Please login again.'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token. Please login again.'
      });
    }

    return res.status(500).json({
      status: 'error',
      message: 'Authentication error'
    });
  }
};

/**
 * Generate a JWT token for a user
 * @param {Object} user - User object containing id and other necessary info
 * @returns {String} JWT token
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email
    },
    config.JWT_SECRET,
    {
      expiresIn: config.JWT_EXPIRES_IN || '24h'
    }
  );
};

module.exports = {
  authenticate,
  generateToken
};
