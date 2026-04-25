// Web UI server: serves the dashboard and streams pipeline logs in real time.

const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

const { loadConfig, checkApiKeys } = require('./config');
const { collectLeadsForCity } = require('./pipeline/collector');
const { flushDuplicates, resetCache, getCacheStats } = require('./pipeline/deduplicator');
const { writeOutputs } = require('./output/writer');
const { getCitiesByState } = require('./utils/cityList');
const { logEmitter } = require('./utils/logger');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let isRunning = false;

// Return current config.json so the UI can pre-populate the form
app.get('/api/config', (req, res) => {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, '..', 'config.json'), 'utf8');
    res.json(JSON.parse(raw));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Return which API keys are present (never returns the values)
app.get('/api/keys', (req, res) => {
  require('dotenv').config();
  res.json({
    google: !!process.env.GOOGLE_PLACES_API_KEY,
    hunter: !!process.env.HUNTER_API_KEY,
  });
});

// Run the pipeline — responds as an SSE stream so logs appear live in the browser
app.post('/api/run', async (req, res) => {
  if (isRunning) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(409).json({ error: 'A run is already in progress. Please wait.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (type, data) => {
    try { res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); } catch (_) {}
  };

  const onLog = (entry) => send('log', entry);
  logEmitter.on('log', onLog);
  isRunning = true;

  const startTime = Date.now();

  try {
    require('dotenv').config();
    resetCache();

    const config = loadConfig({
      states: req.body.states,
      target: req.body.target,
      specialty: req.body.specialty,
      industry: req.body.industry,
      citiesPerState: req.body.citiesPerState,
      searchTerms: req.body.searchTerms,
    });

    const allLeads = [];
    const stateBreakdown = {};
    let targetReached = false;

    for (const state of config.target_states) {
      if (targetReached) break;
      const cities = getCitiesByState(state, config.cities_per_state);
      stateBreakdown[state] = 0;

      for (const city of cities) {
        if (allLeads.length >= config.leads_target) {
          targetReached = true;
          break;
        }
        try {
          const cityLeads = await collectLeadsForCity(city, state, config);
          allLeads.push(...cityLeads);
          stateBreakdown[state] += cityLeads.length;
          send('progress', { total: allLeads.length, target: config.leads_target });
        } catch (_) {}
      }
    }

    const cacheStats = getCacheStats();
    const outputDir = path.resolve(process.cwd(), config.output_directory);
    flushDuplicates(outputDir);
    const outputFiles = await writeOutputs(allLeads, config);

    send('done', {
      totalLeads: allLeads.length,
      duplicatesRemoved: cacheStats.duplicatesFound || 0,
      duration: ((Date.now() - startTime) / 1000).toFixed(1),
      stateBreakdown,
      csvPath: outputFiles.csvPath,
      jsonPath: outputFiles.jsonPath,
      outputDir,
    });
  } catch (err) {
    send('error', { message: err.message });
  } finally {
    logEmitter.off('log', onLog);
    isRunning = false;
    res.end();
  }
});

// Open the output folder in Finder (Mac)
app.post('/api/open-output', (req, res) => {
  const outputDir = path.resolve(process.cwd(), req.body.outputDir || './output');
  exec(`open "${outputDir}"`);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Bristol Lead Sourcer`);
  console.log(`  http://localhost:${PORT}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  exec(`open http://localhost:${PORT}`);
});
