#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const readline = require('readline');

async function processLineByLine(filePath, processor) {
  const fileStream = fs.createReadStream(filePath, { encoding: 'latin1' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineNumber = 0;
  for await (const line of rl) {
    await processor(line, lineNumber++);
  }
}

async function convertToSQLite() {
  console.log('Starting UCMR5 data conversion to SQLite...');
  
  // Create database
  const dbPath = path.join(__dirname, '..', 'ucmr5-data.db');
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  
  const db = new Database(dbPath);
  
  // Create tables
  db.exec(`
    -- Main water quality results table
    CREATE TABLE water_quality (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pwsid TEXT NOT NULL,
      pws_name TEXT NOT NULL,
      state TEXT NOT NULL,
      region INTEGER,
      contaminant TEXT NOT NULL,
      result_value REAL,
      result_sign TEXT,
      mrl REAL,
      units TEXT,
      collection_date TEXT,
      sample_id TEXT,
      facility_id TEXT,
      facility_name TEXT,
      sample_point_id TEXT,
      sample_point_name TEXT,
      size TEXT,
      monitoring_requirement TEXT,
      method_id TEXT
    );
    
    -- ZIP codes mapping table
    CREATE TABLE pws_zipcodes (
      pwsid TEXT NOT NULL,
      zipcode TEXT NOT NULL,
      PRIMARY KEY (pwsid, zipcode)
    );
    
    -- Additional data elements table
    CREATE TABLE additional_data (
      pwsid TEXT NOT NULL,
      facility_id TEXT,
      sample_point_id TEXT,
      sample_event_code TEXT,
      data_element TEXT,
      response TEXT,
      other_text TEXT
    );
    
    -- Aggregated view for faster API queries
    CREATE TABLE pws_summary (
      pwsid TEXT PRIMARY KEY,
      pws_name TEXT NOT NULL,
      state TEXT NOT NULL,
      region INTEGER,
      size TEXT,
      zip_codes TEXT, -- JSON array
      contaminants_detected INTEGER,
      last_test_date TEXT,
      total_samples INTEGER
    );
  `);
  
  // Prepare insert statements
  const insertWaterQuality = db.prepare(`
    INSERT INTO water_quality (
      pwsid, pws_name, state, region, contaminant, result_value, result_sign,
      mrl, units, collection_date, sample_id, facility_id, facility_name,
      sample_point_id, sample_point_name, size, monitoring_requirement, method_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertZipcode = db.prepare(`
    INSERT OR IGNORE INTO pws_zipcodes (pwsid, zipcode) VALUES (?, ?)
  `);
  
  const insertAdditional = db.prepare(`
    INSERT INTO additional_data (
      pwsid, facility_id, sample_point_id, sample_event_code,
      data_element, response, other_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  // Process main water quality file
  console.log('Processing UCMR5_All.txt...');
  let headers = null;
  let rowCount = 0;
  
  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      insertWaterQuality.run(...row);
    }
  });
  
  let batch = [];
  await processLineByLine(path.join(__dirname, '..', 'UCMR5_All.txt'), (line, lineNum) => {
    if (lineNum === 0) {
      headers = line.split('\t');
      return;
    }
    
    const values = line.split('\t');
    const row = [
      values[0], // pwsid
      values[1], // pws_name
      values[2], // state
      parseInt(values[3]) || null, // region
      values[4], // contaminant
      parseFloat(values[7]) || null, // result_value
      values[8], // result_sign
      parseFloat(values[9]) || null, // mrl
      values[10], // units
      values[11], // collection_date
      values[13], // sample_id
      values[14], // facility_id
      values[15], // facility_name
      values[16], // sample_point_id
      values[17], // sample_point_name
      values[21], // size
      values[22], // monitoring_requirement
      values[23] // method_id
    ];
    
    batch.push(row);
    rowCount++;
    
    if (batch.length >= 1000) {
      insertMany(batch);
      batch = [];
      if (rowCount % 100000 === 0) {
        console.log(`  Processed ${rowCount} rows...`);
      }
    }
  });
  
  if (batch.length > 0) {
    insertMany(batch);
  }
  console.log(`  Total rows processed: ${rowCount}`);
  
  // Process ZIP codes file
  console.log('Processing UCMR5_ZIPCodes.txt...');
  rowCount = 0;
  
  await processLineByLine(path.join(__dirname, '..', 'UCMR5_ZIPCodes.txt'), (line, lineNum) => {
    if (lineNum === 0) return;
    
    const [pwsid, zipcode] = line.split('\t');
    insertZipcode.run(pwsid, zipcode);
    rowCount++;
  });
  console.log(`  ZIP codes processed: ${rowCount}`);
  
  // Process additional data file
  console.log('Processing UCMR5_AddtlDataElem.txt...');
  rowCount = 0;
  
  await processLineByLine(path.join(__dirname, '..', 'UCMR5_AddtlDataElem.txt'), (line, lineNum) => {
    if (lineNum === 0) return;
    
    const values = line.split('\t');
    insertAdditional.run(
      values[0], // pwsid
      values[1], // facility_id
      values[2], // sample_point_id
      values[3], // sample_event_code
      values[4], // data_element
      values[5], // response
      values[6]  // other_text
    );
    rowCount++;
  });
  console.log(`  Additional data rows processed: ${rowCount}`);
  
  // Create indexes
  console.log('Creating indexes...');
  db.exec(`
    CREATE INDEX idx_wq_pwsid ON water_quality(pwsid);
    CREATE INDEX idx_wq_state ON water_quality(state);
    CREATE INDEX idx_wq_contaminant ON water_quality(contaminant);
    CREATE INDEX idx_wq_collection_date ON water_quality(collection_date);
    CREATE INDEX idx_pz_zipcode ON pws_zipcodes(zipcode);
    CREATE INDEX idx_ad_pwsid ON additional_data(pwsid);
  `);
  
  // Create summary table
  console.log('Creating summary table...');
  db.exec(`
    INSERT INTO pws_summary
    SELECT 
      wq.pwsid,
      wq.pws_name,
      wq.state,
      wq.region,
      wq.size,
      COALESCE(
        (SELECT json_group_array(DISTINCT zipcode) 
         FROM pws_zipcodes 
         WHERE pwsid = wq.pwsid),
        '[]'
      ) as zip_codes,
      COUNT(DISTINCT CASE 
        WHEN wq.result_sign = '=' AND wq.result_value IS NOT NULL 
        THEN wq.contaminant 
      END) as contaminants_detected,
      MAX(wq.collection_date) as last_test_date,
      COUNT(DISTINCT wq.sample_id) as total_samples
    FROM water_quality wq
    GROUP BY wq.pwsid, wq.pws_name, wq.state, wq.region, wq.size;
  `);
  
  // Vacuum to optimize database
  console.log('Optimizing database...');
  db.exec('VACUUM');
  
  // Get database stats
  const stats = db.prepare('SELECT COUNT(DISTINCT pwsid) as systems FROM water_quality').get();
  const dbSize = fs.statSync(dbPath).size / 1024 / 1024;
  
  console.log('\nConversion complete!');
  console.log(`Database size: ${dbSize.toFixed(2)} MB`);
  console.log(`Total water systems: ${stats.systems}`);
  
  db.close();
}

// Run the conversion
convertToSQLite().catch(console.error);