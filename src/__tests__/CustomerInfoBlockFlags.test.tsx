import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CustomerInfoBlock from '@/components/project/CustomerInfoBlock';

describe('CustomerInfoBlock logistics flags', () => {
  it('shows "Mer än 10 m" when carryMoreThan10m is true', () => {
    render(<CustomerInfoBlock client="Test" carryMoreThan10m={true} />);
    expect(screen.getByText('Bärväg')).toBeInTheDocument();
    expect(screen.getByText('Mer än 10 m')).toBeInTheDocument();
  });

  it('shows "Mindre än 10 m" when carryMoreThan10m is false', () => {
    render(<CustomerInfoBlock client="Test" carryMoreThan10m={false} />);
    expect(screen.getByText('Bärväg')).toBeInTheDocument();
    expect(screen.getByText('Mindre än 10 m')).toBeInTheDocument();
  });

  it('shows "Tillåtet" when groundNailsAllowed is true', () => {
    render(<CustomerInfoBlock client="Test" groundNailsAllowed={true} />);
    expect(screen.getByText('Spett')).toBeInTheDocument();
    expect(screen.getByText('Tillåtet')).toBeInTheDocument();
  });

  it('shows "Ej tillåtet" when groundNailsAllowed is false', () => {
    render(<CustomerInfoBlock client="Test" groundNailsAllowed={false} />);
    expect(screen.getByText('Spett')).toBeInTheDocument();
    expect(screen.getByText('Ej tillåtet')).toBeInTheDocument();
  });

  it('hides flag rows when values are null', () => {
    render(<CustomerInfoBlock client="Test" carryMoreThan10m={null} groundNailsAllowed={null} />);
    expect(screen.queryByText('Bärväg')).not.toBeInTheDocument();
    expect(screen.queryByText('Spett')).not.toBeInTheDocument();
  });
});
