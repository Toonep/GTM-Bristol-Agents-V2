// Configures and exports a winston logger instance for consistent pipeline logging.

const path = require('path');
const fs = require('fs');
const winston = require('winston');

const outputDir = path.resolve(process.cwd(), 'output');
fs.mkdirSync(outputDir, { recursive: true });

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, module: mod, ...meta }) => {
    const modulePart = mod ? `[${mod}]` : '[app]';
    const metaPart = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `${timestamp} ${level.toUpperCase().padEnd(5)} ${modulePart} ${message}${metaPart}`;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new winston.transports.Console({ format: logFormat }),
    new winston.transports.File({
      filename: path.join(outputDir, 'pipeline.log'),
      format: logFormat,
    }),
  ],
});

function createLogger(moduleName) {
  return logger.child({ module: moduleName });
}

module.exports = { logger, createLogger };
