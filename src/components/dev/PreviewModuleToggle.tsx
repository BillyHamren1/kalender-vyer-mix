import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Preview-only module switcher.
 *
 * Visas ENDAST i Lovable-preview (id-preview--*.lovable.app) och lokalt
 * (localhost). Renderar aldrig i produktion (planning.e-flow.se,
 * *.lovable.app publicerad domän) eller i scanner/time-appen.
 */
const isPreviewHost = (): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host.startsWith('id-preview--');
};

const PLANNING_PURPLE = '#7357C8';
const WAREHOUSE_ORANGE = '#C77922';

const PreviewModuleToggle: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  if (!isPreviewHost()) return null;

  const isWarehouse = location.pathname.startsWith('/warehouse');

  const baseStyle: React.CSSProperties = {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid rgba(0,0,0,0.12)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 120ms ease',
    background: 'rgba(255,255,255,0.85)',
  };

  return (
    <div
      aria-label="Preview: växla modul"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 9999,
        display: 'flex',
        gap: 8,
        padding: 6,
        borderRadius: 999,
        background: 'rgba(255,255,255,0.9)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        border: '1px solid rgba(0,0,0,0.08)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <button
        type="button"
        onClick={() => navigate('/projects')}
        style={{
          ...baseStyle,
          background: !isWarehouse ? PLANNING_PURPLE : baseStyle.background,
          color: !isWarehouse ? '#fff' : PLANNING_PURPLE,
          borderColor: !isWarehouse ? PLANNING_PURPLE : baseStyle.border as string,
        }}
      >
        Planning
      </button>
      <button
        type="button"
        onClick={() => navigate('/warehouse')}
        style={{
          ...baseStyle,
          background: isWarehouse ? WAREHOUSE_ORANGE : baseStyle.background,
          color: isWarehouse ? '#fff' : WAREHOUSE_ORANGE,
          borderColor: isWarehouse ? WAREHOUSE_ORANGE : baseStyle.border as string,
        }}
      >
        Lager
      </button>
    </div>
  );
};

export default PreviewModuleToggle;
