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
    const url = new URL(request.url);
    const params = {
      zipcode: url.searchParams.get('zipcode'),
      pwsid: url.searchParams.get('pwsid'),
      pws_name: url.searchParams.get('pws_name'),
      state: url.searchParams.get('state'),
      limit: parseInt(url.searchParams.get('limit') || '50'),
      offset: parseInt(url.searchParams.get('offset') || '0')
    };
    
    // Validate parameters
    if (!params.zipcode && !params.pwsid && !params.pws_name && !params.state) {
      return new Response(JSON.stringify({
        error: 'At least one search parameter required (zipcode, pwsid, pws_name, or state)'
      }), {
        status: 400,
        headers: corsHeaders
      });
    }
    
    let results = [];
    
    // Handle ZIP code search
    if (params.zipcode) {
      const zipIndexUrl = new URL('/api/data/zip-index.json', request.url);
      const zipResponse = await fetch(zipIndexUrl);
      const zipIndex = await zipResponse.json();
      
      const systems = zipIndex[params.zipcode] || [];
      for (const { pwsid, state } of systems) {
        const stateDataUrl = new URL(`/api/data/${state}.json`, request.url);
        const stateResponse = await fetch(stateDataUrl);
        const stateData = await stateResponse.json();
        
        const system = stateData.find(s => s.pwsid === pwsid);
        if (system) results.push(system);
      }
    }
    
    // Handle state search
    else if (params.state && !params.pws_name && !params.pwsid) {
      // Load state codes mapping
      const stateCodesUrl = new URL('/api/data/state-codes.json', request.url);
      const stateCodesResponse = await fetch(stateCodesUrl);
      const stateCodes = await stateCodesResponse.json();
      
      // Convert state abbreviation to code if needed
      let stateCode = params.state.toUpperCase();
      
      // If it's a 2-letter abbreviation that's not numeric, check if we have that file directly
      if (stateCode.length === 2 && !/^\d+$/.test(stateCode)) {
        // First check if we have a file for this abbreviation
        const abbrevUrl = new URL(`/api/data/${stateCode}.json`, request.url);
        const abbrevResponse = await fetch(abbrevUrl);
        if (abbrevResponse.ok) {
          results = await abbrevResponse.json();
          return new Response(JSON.stringify({
            water_systems: results.slice(params.offset, params.offset + params.limit),
            pagination: {
              total: results.length,
              limit: params.limit,
              offset: params.offset,
              has_more: params.offset + params.limit < results.length
            }
          }, null, 2), {
            status: 200,
            headers: corsHeaders
          });
        }
        
        // Otherwise try to find the numeric code
        stateCode = Object.entries(stateCodes).find(([code, abbr]) => abbr === stateCode)?.[0] || stateCode;
      }
      
      const stateDataUrl = new URL(`/api/data/${stateCode}.json`, request.url);
      const response = await fetch(stateDataUrl);
      
      if (!response.ok) {
        return new Response(JSON.stringify({
          error: `State ${params.state} not found`
        }), {
          status: 404,
          headers: corsHeaders
        });
      }
      
      results = await response.json();
    }
    
    // Handle other searches (need to search all states)
    else {
      const indexUrl = new URL('/api/data/index.json', request.url);
      const indexResponse = await fetch(indexUrl);
      const stateIndex = await indexResponse.json();
      
      // Search relevant states
      const statesToSearch = params.state ? [params.state] : Object.keys(stateIndex);
      
      for (const state of statesToSearch) {
        const stateDataUrl = new URL(`/api/data/${state}.json`, request.url);
        const response = await fetch(stateDataUrl);
        const stateData = await response.json();
        
        for (const system of stateData) {
          if (params.pwsid && system.pwsid === params.pwsid.toUpperCase()) {
            results.push(system);
          } else if (params.pws_name && system.pws_name.toLowerCase().includes(params.pws_name.toLowerCase())) {
            results.push(system);
          }
        }
      }
    }
    
    // Apply pagination
    const total = results.length;
    const paginatedResults = results.slice(params.offset, params.offset + params.limit);
    
    // Add raw JSON and summaries for each water system for Zapier
    const resultsWithRaw = paginatedResults.map(system => {
      // Calculate detected contaminants
      const detectedContaminants = Object.entries(system.contaminants || {})
        .filter(([_, info]) => info.detected)
        .map(([name, info]) => ({
          name,
          value: info.value,
          unit: info.unit
        }));
      
      return {
        ...system,
        summary: {
          detected_count: detectedContaminants.length,
          detected_contaminants: detectedContaminants,
          detected_names: detectedContaminants.map(c => c.name).join(', '),
          detected_values: detectedContaminants.map(c => `${c.name}: ${c.value} ${c.unit}`).join('; ')
        },
        raw_json: JSON.stringify(system)
      };
    });
    
    return new Response(JSON.stringify({
      water_systems: resultsWithRaw,
      pagination: {
        total,
        limit: params.limit,
        offset: params.offset,
        has_more: params.offset + params.limit < total
      }
    }, null, 2), {
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