/**
 * Utility functions to map between frontend team IDs (team-1, team-2, etc.)
 * and database team IDs (a, b, c, etc.)
 */

// Map frontend team ID to database team ID
export const toDbTeamId = (frontendId: string): string => {
  const mapping: Record<string, string> = {
    'team-1': 'a',
    'team-2': 'b',
    'team-3': 'c',
    'team-4': 'd',
    'team-5': 'e',
    'team-6': 'f',
  };
  
  return mapping[frontendId] || frontendId;
};

// Map database team ID to frontend team ID
export const toFrontendTeamId = (dbId: string): string => {
  const mapping: Record<string, string> = {
    'a': 'team-1',
    'b': 'team-2',
    'c': 'team-3',
    'd': 'team-4',
    'e': 'team-5',
    'f': 'team-6',
  };
  
  return mapping[dbId] || dbId;
};

// Map resource ID (can be either format) to frontend format
export const normalizeToFrontendId = (resourceId: string): string => {
  // If already in frontend format, return as is
  if (resourceId.startsWith('team-')) {
    return resourceId;
  }
  // Otherwise, convert from database format
  return toFrontendTeamId(resourceId);
};

// Map resource ID (can be either format) to database format
export const normalizeToDbId = (resourceId: string): string => {
  // If already in database format (single letter), return as is
  if (resourceId.length === 1 && /[a-z]/.test(resourceId)) {
    return resourceId;
  }
  // Otherwise, convert from frontend format
  return toDbTeamId(resourceId);
};
