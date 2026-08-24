const write = (level, message, metadata) => {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
  };

  const output = JSON.stringify(entry);
  if (level === 'error') {
    console.error(output);
  } else {
    console.log(output);
  }
};

const logger = {
  debug: (message, metadata) => write('debug', message, metadata),
  info: (message, metadata) => write('info', message, metadata),
  warn: (message, metadata) => write('warn', message, metadata),
  error: (message, metadata) => write('error', message, metadata),
};

module.exports = logger;
module.exports.logger = logger;
