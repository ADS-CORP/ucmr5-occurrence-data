#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function processDataStream() {
  console.log('Processing UCMR5 data into JSON format...');
  
  const inputPath = path.join(__dirname, '..', 'UCMR5_All.txt');
  const outputDir = path.join(__dirname, '..', 'api', 'data');
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // State data storage
  const stateData = {};
  const zipIndex = {};
  const pwsIndex = {};
  
  // Read and process line by line
  const fileStream = fs.createReadStream(inputPath, { encoding: 'latin1' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  let headers = null;
  let lineCount = 0;
  
  for await (const line of rl) {
    if (lineCount === 0) {
      headers = line.split('\t');
      lineCount++;
      continue;
    }
    
    const values = line.split('\t');
    
    const record = {
      pwsid: values[0],
      pws_name: values[1],
      state: values[22],  // State is column 22
      size: values[21],   // Size is column 21
      region: values[3],
      contaminant: values[4],
      result_value: parseFloat(values[7]),
      result_sign: values[8],
      mrl: parseFloat(values[9]),
      units: values[10],
      collection_date: values[11]
    };
    
    // Initialize state data
    if (!stateData[record.state]) {
      stateData[record.state] = {};
    }
    
    // Initialize PWS data
    if (!stateData[record.state][record.pwsid]) {
      stateData[record.state][record.pwsid] = {
        pwsid: record.pwsid,
        name: record.pws_name,
        state: record.state,
        zip_codes: [],
        contaminants: {},
        last_tested: record.collection_date
      };
      
      // Add to PWS index
      pwsIndex[record.pwsid] = record.state;
    }
    
    // Update contaminant data
    const pws = stateData[record.state][record.pwsid];
    if (!pws.contaminants[record.contaminant]) {
      pws.contaminants[record.contaminant] = {
        value: record.result_sign === '<' ? `<${record.mrl}` : record.result_value,
        unit: record.units,
        detected: record.result_sign === '=',
        mrl: record.mrl
      };
    }
    
    // Update last tested date
    if (record.collection_date > pws.last_tested) {
      pws.last_tested = record.collection_date;
    }
    
    lineCount++;
    if (lineCount % 10000 === 0) {
      process.stdout.write(`\rProcessed ${lineCount} rows...`);
    }
  }
  
  console.log(`\nProcessed ${lineCount} total rows`);
  
  // Load ZIP codes
  console.log('Loading ZIP code mappings...');
  const zipPath = path.join(__dirname, '..', 'UCMR5_ZIPCodes.txt');
  if (fs.existsSync(zipPath)) {
    const zipStream = fs.createReadStream(zipPath, { encoding: 'latin1' });
    const zipRl = readline.createInterface({
      input: zipStream,
      crlfDelay: Infinity
    });
    
    let zipLineCount = 0;
    for await (const line of zipRl) {
      if (zipLineCount === 0) {
        zipLineCount++;
        continue;
      }
      
      const [pwsid, zipcode] = line.split('\t');
      
      // Add to zip index
      if (!zipIndex[zipcode]) {
        zipIndex[zipcode] = [];
      }
      zipIndex[zipcode].push({ 
        pwsid, 
        state: pwsIndex[pwsid] 
      });
      
      // Add to PWS data
      const state = pwsIndex[pwsid];
      if (state && stateData[state] && stateData[state][pwsid]) {
        if (!stateData[state][pwsid].zip_codes.includes(zipcode)) {
          stateData[state][pwsid].zip_codes.push(zipcode);
        }
      }
      
      zipLineCount++;
    }
    console.log(`Processed ${zipLineCount} ZIP code mappings`);
  }
  
  // Write state files
  console.log('Writing state data files...');
  const stateIndex = {};
  
  for (const [state, pwsData] of Object.entries(stateData)) {
    const systems = Object.values(pwsData);
    stateIndex[state] = systems.length;
    
    fs.writeFileSync(
      path.join(outputDir, `${state}.json`),
      JSON.stringify(systems)
    );
    
    console.log(`Wrote ${state}.json (${systems.length} systems)`);
  }
  
  // Write index files
  fs.writeFileSync(
    path.join(outputDir, 'index.json'),
    JSON.stringify(stateIndex, null, 2)
  );
  
  fs.writeFileSync(
    path.join(outputDir, 'zip-index.json'),
    JSON.stringify(zipIndex)
  );
  
  console.log('Data processing complete!');
}

processDataStream().catch(console.error);