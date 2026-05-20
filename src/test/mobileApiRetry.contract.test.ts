/**
 * Kontraktstest: mobileApiService retry-policy
 *
 * Låser den additiva retry-lagrets beteende:
 *   - Whitelistade läs-actions (login, me, get_bookings, ...) retryas EN gång
 *     vid transient nätverksfel (TypeError "Failed to fetch").
 *   - Mutationer (create_time_report, send_message, ...) retryas ALDRIG —
 *     skulle kunna skapa dubbletter.
 *   - Timeouts (AbortError) retryas ALDRIG.
 *   - HTTP 500-fel retryas ALDRIG (servern svarade, det är inte transient).
 */
import { describe, it, expect } from 'vitest';
import { __isRetryableAction, __isTransientNetworkError } from '@/services/mobileApiService';

describe('mobileApiService: retry whitelist (kontrakt)', () => {
  it('whitelistade läs-actions är retryable', () => {
    const reads = [
      'login',
      'me',
      'get_bookings',
      'get_inbox_jobs',
      'get_inbox_all',
      'get_booking_details',
      'get_time_reports',
      'get_project_comments',
      'get_project_files',
      'get_project_purchases',
      'get_direct_messages',
      'get_job_messages',
    ];
    for (const action of reads) {
      expect(__isRetryableAction(action)).toBe(true);
    }
  });

  it('mutationer är ALDRIG retryable (skydd mot dubbletter)', () => {
    const writes = [
      'create_time_report',
      'update_time_report',
      'delete_time_report',
      'admin_create_time_report',
      'admin_update_time_report',
      'admin_delete_time_report',
      'admin_close_open_entry',
      'create_purchase',
      'create_comment',
      'upload_file',
      'send_message',
      'send_direct_message',
      'mark_dm_read',
      'archive_dm',
      'unarchive_dm',
      'upload_chat_attachment',
      'upload_location_batch',
    ];
    for (const action of writes) {
      expect(__isRetryableAction(action)).toBe(false);
    }
  });

  it('okända actions är defensiva (ej retryable)', () => {
    expect(__isRetryableAction('something_new_we_never_added')).toBe(false);
    expect(__isRetryableAction('')).toBe(false);
  });
});

describe('mobileApiService: transient error classification', () => {
  it('TypeError klassas som transient', () => {
    expect(__isTransientNetworkError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('Error med "Failed to fetch" klassas som transient', () => {
    expect(__isTransientNetworkError(new Error('Kunde inte nå servern: Failed to fetch'))).toBe(true);
  });

  it('Error med "Load failed" (iOS WebView) klassas som transient', () => {
    expect(__isTransientNetworkError(new Error('Load failed'))).toBe(true);
  });

  it('Error med "NetworkError" klassas som transient', () => {
    expect(__isTransientNetworkError(new Error('NetworkError when attempting to fetch'))).toBe(true);
  });

  it('AbortError (timeout) klassas INTE som transient', () => {
    const abort = new DOMException('Aborted', 'AbortError');
    expect(__isTransientNetworkError(abort)).toBe(false);
  });

  it('vanliga affärsfel klassas INTE som transient', () => {
    expect(__isTransientNetworkError(new Error('Serverfel (500)'))).toBe(false);
    expect(__isTransientNetworkError(new Error('Anropet tog för lång tid'))).toBe(false);
    expect(__isTransientNetworkError(null)).toBe(false);
    expect(__isTransientNetworkError(undefined)).toBe(false);
  });
});
