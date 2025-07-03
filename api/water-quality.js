import initSqlJs from 'sql.js';

// Cache database instance
let db = null;

async function getDatabase() {
  if (!db) {
    // Initialize SQL.js
    const SQL = await initSqlJs({
      locateFile: file => `https://sql.js.org/dist/${file}`
    });
    
    // Fetch SQLite database from Vercel Blob or GitHub releases
    const dbUrl = process.env.DATABASE_URL || 
      process.env.VERCEL_BLOB_URL ||
      'https://github.com/ADS-CORP/ucmr5-occurrence-data/releases/download/latest/ucmr5-data.db.gz';
    
    const response = await fetch(dbUrl);
    const buffer = await response.arrayBuffer();
    
    // Decompress if gzipped
    let data = new Uint8Array(buffer);
    if (dbUrl.endsWith('.gz')) {
      const DecompressionStream = globalThis.DecompressionStream;
      const stream = new Response(data).body.pipeThrough(new DecompressionStream('gzip'));
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    
    db = new SQL.Database(data);
  }
  return db;
}

function parseQueryParams(url) {
  const params = new URL(url).searchParams;
  return {
    zipcode: params.get('zipcode'),
    pwsid: params.get('pwsid'),
    pws_name: params.get('pws_name'),
    city: params.get('city'),
    state: params.get('state'),
    limit: parseInt(params.get('limit') || '50'),
    offset: parseInt(params.get('offset') || '0')
  };
}

function buildWhereClause(params) {
  const conditions = [];
  const values = [];
  
  if (params.pwsid) {
    conditions.push('s.pwsid = ?');
    values.push(params.pwsid.toUpperCase());
  }
  
  if (params.zipcode) {
    conditions.push(`EXISTS (
      SELECT 1 FROM pws_zipcodes z 
      WHERE z.pwsid = s.pwsid AND z.zipcode = ?
    )`);
    values.push(params.zipcode);
  }
  
  if (params.pws_name) {
    conditions.push('LOWER(s.pws_name) LIKE ?');
    values.push(`%${params.pws_name.toLowerCase()}%`);
  }
  
  if (params.state) {
    conditions.push('s.state = ?');
    values.push(params.state.toUpperCase());
  }
  
  // Note: City search would require external geocoding or ZIP to city mapping
  if (params.city) {
    console.warn('City search not implemented - use zipcode instead');
  }
  
  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    values
  };
}

async function getWaterSystems(params) {
  const database = await getDatabase();
  const { where, values } = buildWhereClause(params);
  
  // Get water systems matching criteria
  const query = `
    SELECT 
      s.pwsid,
      s.pws_name,
      s.state,
      s.region,
      s.size,
      s.zip_codes,
      s.contaminants_detected,
      s.last_test_date,
      s.total_samples
    FROM pws_summary s
    ${where}
    ORDER BY s.pws_name
    LIMIT ? OFFSET ?
  `;
  
  const systemsResult = database.exec(query, [...values, params.limit, params.offset]);
  const systems = systemsResult[0]?.values.map(row => ({
    pwsid: row[0],
    pws_name: row[1],
    state: row[2],
    region: row[3],
    size: row[4],
    zip_codes: row[5],
    contaminants_detected: row[6],
    last_test_date: row[7],
    total_samples: row[8]
  })) || [];
  
  // Get detailed contaminant data for each system
  const results = [];
  for (const system of systems) {
    const contaminantQuery = `
      SELECT 
        contaminant,
        MAX(result_value) as max_value,
        result_sign,
        units,
        mrl,
        COUNT(*) as test_count,
        MAX(collection_date) as latest_test
      FROM water_quality
      WHERE pwsid = ?
      GROUP BY contaminant, units, mrl
      ORDER BY contaminant
    `;
    const contaminants = database.exec(contaminantQuery, [system.pwsid])[0]?.values.map(row => ({
      contaminant: row[0],
      max_value: row[1],
      result_sign: row[2],
      units: row[3],
      mrl: row[4],
      test_count: row[5],
      latest_test: row[6]
    })) || [];
    
    // Format contaminant data
    const contaminantData = {};
    for (const c of contaminants) {
      contaminantData[c.contaminant] = {
        value: c.result_sign === '<' ? `<${c.mrl}` : c.max_value,
        unit: c.units,
        detected: c.result_sign === '=',
        mrl: c.mrl,
        test_count: c.test_count,
        latest_test: c.latest_test
      };
    }
    
    results.push({
      pwsid: system.pwsid,
      name: system.pws_name,
      state: system.state,
      region: system.region,
      size: system.size,
      zip_codes: JSON.parse(system.zip_codes || '[]'),
      contaminants: contaminantData,
      summary: {
        contaminants_detected: system.contaminants_detected,
        last_tested: system.last_test_date,
        total_samples: system.total_samples
      }
    });
  }
  
  // Get total count for pagination
  const countQuery = `
    SELECT COUNT(*) as total
    FROM pws_summary s
    ${where}
  `;
  const countResult = database.exec(countQuery, values)[0];
  const total = countResult?.values[0][0] || 0;
  
  return {
    water_systems: results,
    pagination: {
      total: total,
      limit: params.limit,
      offset: params.offset,
      has_more: params.offset + params.limit < total
    }
  };
}

export default async function handler(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const params = parseQueryParams(request.url);
    
    // Validate at least one search parameter
    if (!params.zipcode && !params.pwsid && !params.pws_name && !params.state) {
      return new Response(JSON.stringify({
        error: 'At least one search parameter required (zipcode, pwsid, pws_name, or state)'
      }), {
        status: 400,
        headers: corsHeaders
      });
    }
    
    const data = await getWaterSystems(params);
    
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: corsHeaders
    });
    
  } catch (error) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

export const config = {
  runtime: 'edge',
};