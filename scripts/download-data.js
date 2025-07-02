#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');

const DATA_SOURCES = {
  // GitHub Release (will be created after first push)
  github: 'https://github.com/ADS-CORP/ucmr5-occurrence-data/releases/download/data-files/UCMR5_All.txt',
  
  // Direct EPA download (backup)
  epa: 'https://www.epa.gov/system/files/documents/2025-01/ucmr5_all.txt',
  
  // Cloudflare R2 (optional, add your URL here)
  cdn: process.env.DATA_CDN_URL
};

async function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        return downloadFile(response.headers.location, destination)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;
      
      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
        process.stdout.write(`\rDownloading: ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(1)}MB / ${(totalSize / 1024 / 1024).toFixed(1)}MB)`);
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log('\nDownload complete!');
        resolve();
      });
    }).on('error', reject);
  });
}

async function downloadData() {
  const dataPath = path.join(__dirname, '..', 'UCMR5_All.txt');
  
  // Check if file already exists
  if (fs.existsSync(dataPath)) {
    const stats = fs.statSync(dataPath);
    const sizeMB = stats.size / 1024 / 1024;
    
    if (sizeMB > 200) { // File is likely complete
      console.log(`UCMR5_All.txt already exists (${sizeMB.toFixed(1)}MB)`);
      return;
    }
  }
  
  console.log('Downloading UCMR5_All.txt...');
  
  // Try sources in order
  for (const [source, url] of Object.entries(DATA_SOURCES)) {
    if (!url) continue;
    
    console.log(`Trying ${source}...`);
    try {
      await downloadFile(url, dataPath);
      console.log(`Successfully downloaded from ${source}`);
      return;
    } catch (error) {
      console.error(`Failed to download from ${source}:`, error.message);
    }
  }
  
  throw new Error('Failed to download from all sources');
}

// Run if called directly
if (require.main === module) {
  downloadData().catch(console.error);
}

module.exports = { downloadData };