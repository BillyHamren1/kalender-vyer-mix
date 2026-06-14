import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { openPdfPreviewShell, presentPdfBlob } from '../pdfPreviewWindow';

describe('pdfPreviewWindow', () => {
  const originalOpen = window.open;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.open = originalOpen;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('pre-opens an empty preview tab synchronously', () => {
    const mockWindow = {
      document: { title: '', body: { innerHTML: '' } },
      closed: false,
    } as unknown as Window;

    window.open = vi.fn(() => mockWindow);

    const result = openPdfPreviewShell('Packlista - Test.pdf');

    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(result).toBe(mockWindow);
    expect(mockWindow.document.title).toBe('Packlista - Test.pdf');
    expect(mockWindow.document.body.innerHTML).toContain('Genererar PDF');
  });

  it('navigates the pre-opened tab to the generated blob URL', () => {
    const mockWindow = {
      closed: false,
      location: { href: '' },
    } as unknown as Window;

    const createObjectURL = vi.fn(() => 'blob:test-url');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    presentPdfBlob(mockWindow, new Blob(['pdf']), 'Packlista - Test.pdf');

    expect(createObjectURL).toHaveBeenCalled();
    expect(mockWindow.location.href).toBe('blob:test-url');
  });

  it('falls back to download when popup navigation is unavailable', () => {
    const secondaryWindow = null;
    window.open = vi.fn(() => secondaryWindow);

    const createObjectURL = vi.fn(() => 'blob:test-url');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(HTMLElement.prototype, 'remove');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    presentPdfBlob(null, new Blob(['pdf']), 'Packlista - Test.pdf');

    expect(window.open).toHaveBeenCalledWith('blob:test-url', '_blank');
    expect(appendSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
  });
});