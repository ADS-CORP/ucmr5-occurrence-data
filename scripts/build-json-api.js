#!/usr/bin/env node

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

async function buildJsonApi() {
  console.log('Building JSON API files from SQLite database...');
  
  const dbPath = path.join(__dirname, '..', 'ucmr5-data.db');
  
  if (!fs.existsSync(dbPath)) {
    console.error('Database not found. Run convert-to-sqlite.js first.');
    process.exit(1);
  }
  
  const db = new Database(dbPath, { readonly: true });
  const outputDir = path.join(__dirname, '..', 'api', 'data');
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Get all states
  const states = db.prepare('SELECT DISTINCT state FROM pws_summary ORDER BY state').all();
  
  // Build state index
  const stateIndex = {};
  
  for (const { state } of states) {
    console.log(`Processing ${state}...`);
    
    // Get all water systems for this state
    const systems = db.prepare(`
      SELECT 
        s.pwsid,
        s.pws_name,
        s.state,
        s.zip_codes,
        s.contaminants_detected,
        s.last_test_date
      FROM pws_summary s
      WHERE s.state = ?
      ORDER BY s.pws_name
    `).all(state);
    
    // Get contaminants for each system
    const stateData = [];
    for (const system of systems) {
      const contaminants = db.prepare(`
        SELECT 
          contaminant,
          MAX(result_value) as max_value,
          result_sign,
          units,
          mrl
        FROM water_quality
        WHERE pwsid = ?
        GROUP BY contaminant
      `).all(system.pwsid);
      
      // Format contaminants
      const contaminantData = {};
      for (const c of contaminants) {
        contaminantData[c.contaminant] = {
          value: c.result_sign === '<' ? `<${c.mrl}` : c.max_value,
          unit: c.units,
          detected: c.result_sign === '='
        };
      }
      
      stateData.push({
        ...system,
        zip_codes: JSON.parse(system.zip_codes || '[]'),
        contaminants: contaminantData
      });
    }
    
    // Write state file
    fs.writeFileSync(
      path.join(outputDir, `${state}.json`),
      JSON.stringify(stateData)
    );
    
    stateIndex[state] = systems.length;
  }
  
  // Write index file
  fs.writeFileSync(
    path.join(outputDir, 'index.json'),
    JSON.stringify(stateIndex, null, 2)
  );
  
  // Create ZIP code index
  console.log('Building ZIP code index...');
  const zipIndex = {};
  const zipData = db.prepare(`
    SELECT z.zipcode, z.pwsid, s.state 
    FROM pws_zipcodes z
    JOIN pws_summary s ON z.pwsid = s.pwsid
    ORDER BY z.zipcode
  `).all();
  
  for (const { zipcode, pwsid, state } of zipData) {
    if (!zipIndex[zipcode]) {
      zipIndex[zipcode] = [];
    }
    zipIndex[zipcode].push({ pwsid, state });
  }
  
  fs.writeFileSync(
    path.join(outputDir, 'zip-index.json'),
    JSON.stringify(zipIndex)
  );
  
  console.log('JSON API build complete!');
  console.log(`Generated ${states.length} state files`);
  
  db.close();
}

buildJsonApi().catch(console.error);