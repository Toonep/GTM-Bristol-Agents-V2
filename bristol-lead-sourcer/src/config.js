// Loads and merges config.json with environment variables for use across the pipeline.

const path = require('path');
const fs = require('fs');
const { createLogger } = require('./utils/logger');

const log = createLogger('config');

const API_KEY_SLOTS = [
  'GOOGLE_PLACES_API_KEY',
  'HUNTER_API_KEY',
];

function checkApiKeys() {
  const present = [];
  const missing = [];

  for (const key of API_KEY_SLOTS) {
    if (process.env[key]) {
      present.push(key);
    } else {
      missing.push(key);
    }
  }

  log.debug(`API keys present (${present.length}/2): ${present.length ? present.join(', ') : 'none'}`);
  log.debug(`API keys missing (${missing.length}/2): ${missing.length ? missing.join(', ') : 'none'}`);

  return { present, missing };
}

function loadConfig(overrides = {}) {
  require('dotenv').config();

  const configPath = path.resolve(__dirname, '..', 'config.json');
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    log.error(`Failed to read config.json at ${configPath}: ${err.message}`);
    process.exit(1);
  }

  const config = { ...fileConfig };

  if (overrides.states) {
    config.target_states = (Array.isArray(overrides.states) ? overrides.states : overrides.states.split(','))
      .map(s => s.trim().toUpperCase()).filter(Boolean);
  }
  if (overrides.target) config.leads_target = parseInt(overrides.target, 10);
  if (overrides.citiesPerState) config.cities_per_state = parseInt(overrides.citiesPerState, 10);
  if (overrides.specialty) {
    if (overrides.specialty !== fileConfig.specialty) {
      config.specialty_search_terms = [overrides.specialty];
    }
    config.specialty = overrides.specialty;
  }
  if (overrides.industry) config.industry = overrides.industry;
  if (overrides.searchTerms) {
    config.specialty_search_terms = (Array.isArray(overrides.searchTerms) ? overrides.searchTerms : overrides.searchTerms.split(','))
      .map(s => s.trim()).filter(Boolean);
  }

  config.cities_per_state = config.cities_per_state || 20;
  config.leads_target = config.leads_target || 2000;
  config.output_directory = config.output_directory || './output';
  config.specialty_search_terms = config.specialty_search_terms || [config.specialty];

  log.debug(`Config: ${config.industry} / ${config.specialty} | states: ${config.target_states.join(', ')} | target: ${config.leads_target}`);
  checkApiKeys();

  return config;
}

module.exports = { loadConfig, checkApiKeys };
