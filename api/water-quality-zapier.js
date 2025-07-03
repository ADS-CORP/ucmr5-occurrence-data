// Zapier-optimized version of the water quality API
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
    // Forward request to main API
    const mainApiUrl = new URL('/api/water-quality', request.url);
    mainApiUrl.search = new URL(request.url).search;
    
    const response = await fetch(mainApiUrl);
    const data = await response.json();
    
    if (!response.ok) {
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: corsHeaders
      });
    }
    
    // Transform data for Zapier - flatten contaminants and add summary fields
    const zapierData = {
      ...data,
      water_systems: data.water_systems.map(system => {
        // Create flattened contaminant fields
        const flatContaminants = {};
        const detectedContaminants = [];
        const allContaminantsList = [];
        
        Object.entries(system.contaminants || {}).forEach(([name, info]) => {
          // Create individual fields for each contaminant
          flatContaminants[`contaminant_${name}_value`] = info.value;
          flatContaminants[`contaminant_${name}_detected`] = info.detected;
          flatContaminants[`contaminant_${name}_unit`] = info.unit;
          flatContaminants[`contaminant_${name}_mrl`] = info.mrl;
          
          // Track detected contaminants
          if (info.detected) {
            detectedContaminants.push({
              name: name,
              value: info.value,
              unit: info.unit
            });
          }
          
          // Build summary list
          allContaminantsList.push(`${name}: ${info.value} ${info.unit}`);
        });
        
        return {
          // Basic info
          pwsid: system.pwsid,
          name: system.name,
          state: system.state,
          zip_codes_count: system.zip_codes.length,
          zip_codes_list: system.zip_codes.join(', '),
          last_tested: system.last_tested,
          
          // Summary fields
          detected_count: detectedContaminants.length,
          detected_contaminants: detectedContaminants,
          detected_summary: detectedContaminants.map(c => `${c.name}: ${c.value} ${c.unit}`).join('; '),
          
          // All contaminants summary
          all_contaminants_summary: allContaminantsList.join('; '),
          
          // Flattened contaminant fields
          ...flatContaminants,
          
          // Original nested data as JSON strings
          contaminants_json: JSON.stringify(system.contaminants),
          zip_codes_json: JSON.stringify(system.zip_codes),
          full_record_json: JSON.stringify(system)
        };
      })
    };
    
    return new Response(JSON.stringify(zapierData, null, 2), {
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