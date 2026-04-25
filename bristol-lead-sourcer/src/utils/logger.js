// Configures and exports a winston logger instance for consistent pipeline logging.

const path = require('path');
const fs = require('fs');
const winston = require('winston');
const { EventEmitter } = require('events');
const Transport = require('winston-transport');

const outputDir = path.resolve(process.cwd(), 'output');
fs.mkdirSync(outputDir, { recursive: true });

// Emitter used by the web UI to stream live log entries
const logEmitter = new EventEmitter();
logEmitter.setMaxListeners(50);

class EmitterTransport extends Transport {
  log(info, callback) {
    logEmitter.emit('log', {
      level: info.level,
      module: info.module || 'app',
      message: info.message,
      timestamp: info.timestamp || new Date().toISOString().slice(0, 19).replace('T', ' '),
    });
    if (callback) callback();
  }
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, module: mod }) => {
    const modulePart = mod ? `[${mod}]` : '[app]';
    return `${timestamp} ${level.toUpperCase().padEnd(5)} ${modulePart} ${message}`;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({ format: logFormat }),
    new winston.transports.File({ filename: path.join(outputDir, 'pipeline.log'), format: logFormat }),
    new EmitterTransport(),
  ],
});

function createLogger(moduleName) {
  return logger.child({ module: moduleName });
}

module.exports = { logger, createLogger, logEmitter };
