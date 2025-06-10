
export interface WallSelectionState {
  showWallDialog: boolean;
  pendingLine: any | null;
  pendingFeatureId: string | null;
  currentSegment: number;
  wallChoices: ('transparent' | 'white')[];
  highlightedWallId: string | null;
  wallLinesData: any[];
  selectedWallLineId: string | null;
  isDraggingWallLine: boolean;
  dragWallLineIndex: number | null;
  dragWallPointIndex: number | null;
  segmentDistance: string;
}

export interface WallLineFeature {
  type: "Feature";
  geometry: {
    type: "LineString";
    coordinates: number[][];
  };
  properties: {
    color: string;
    wallType: 'transparent' | 'white';
    id: string;
  };
}

export interface ArrowFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: number[];
  };
  properties: {
    segmentNumber: number;
    isCurrent: boolean;
    rotation: number;
  };
}

export interface HighlightFeature {
  type: "Feature";
  geometry: {
    type: "LineString";
    coordinates: number[][];
  };
  properties: {
    segmentNumber: number;
    isCurrent: boolean;
  };
}
