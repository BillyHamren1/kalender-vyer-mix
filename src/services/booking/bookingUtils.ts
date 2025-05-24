
// Helper function to extract client name from various formats
export const extractClientName = (clientData: any): string => {
  if (typeof clientData === 'string') {
    // Try to parse as JSON first in case it's a JSON string
    try {
      const parsed = JSON.parse(clientData);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed.name || parsed.client_name || clientData;
      }
      return clientData;
    } catch {
      // If it's not valid JSON, return as-is
      return clientData;
    }
  } else if (typeof clientData === 'object' && clientData !== null) {
    // If it's already an object, extract the name
    return clientData.name || clientData.client_name || String(clientData);
  }
  
  // Fallback to string conversion
  return String(clientData || '');
};
