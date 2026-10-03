'use strict';

// Preloaded before npm and lifecycle Node processes.  Every request is rebuilt
// from captured plain data only; URL and second-options authority cannot differ.
const http = require('node:http');
const https = require('node:https');
const {urlToHttpOptions} = require('node:url');

const originalHttpsRequest = https.request.bind(https);
const originalHttpsGlobalAgent = https.globalAgent;
const ORIGIN = 'registry.npmjs.org';
const FORBIDDEN = new Set([
  'createConnection', 'lookup', 'socketPath', 'Connection',
  '_defaultAgent', 'checkServerIdentity', 'secureContext', 'ca', 'pfx', 'key', 'cert',
]);

function denied() {
  const error = new Error('compatible_full_app_npm_origin_denied');
  error.code = 'EVENTFLOW_NPM_ORIGIN_DENIED';
  throw error;
}

function plainData(value) {
  if (value === undefined || value === null) return Object.create(null);
  if (typeof value !== 'object' || Array.isArray(value)) return denied();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return denied();
  const result = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') return denied();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return denied();
    result[key] = descriptor.value;
  }
  return result;
}

function mergeInput(input, options) {
  let base;
  if (typeof input === 'string' || input instanceof URL) {
    let parsed;
    try { parsed = new URL(input); } catch (_) { return denied(); }
    base = plainData(urlToHttpOptions(parsed));
  } else {
    base = plainData(input);
  }
  const override = plainData(options);
  const merged = Object.create(null);
  Object.assign(merged, base, override);
  return merged;
}

function hostName(value) {
  if (typeof value !== 'string' || value.length === 0) return denied();
  if (value === ORIGIN) return ORIGIN;
  if (value === ORIGIN + ':443') return ORIGIN;
  return denied();
}

function normalize(input, options) {
  const merged = mergeInput(input, options);
  for (const key of FORBIDDEN) {
    if (Object.prototype.hasOwnProperty.call(merged, key)) return denied();
  }
  if (merged.protocol !== undefined && merged.protocol !== 'https:') return denied();
  const hostname = merged.hostname === undefined ? hostName(merged.host) : hostName(merged.hostname);
  if (merged.host !== undefined && hostName(merged.host) !== hostname) return denied();
  if (merged.port !== undefined && merged.port !== null && merged.port !== '' &&
      merged.port !== 443 && merged.port !== '443') return denied();
  if (merged.auth !== undefined && merged.auth !== null && merged.auth !== '') return denied();
  if (merged.username !== undefined && merged.username !== '') return denied();
  if (merged.password !== undefined && merged.password !== '') return denied();
  if (merged.agent !== undefined && merged.agent !== false && merged.agent !== originalHttpsGlobalAgent) {
    return denied();
  }
  if (merged.rejectUnauthorized === false) return denied();
  if (merged.servername !== undefined && merged.servername !== ORIGIN) return denied();
  if (merged.path !== undefined &&
      (typeof merged.path !== 'string' || !merged.path.startsWith('/') || merged.path.startsWith('//') ||
       /[\u0000-\u001f\u007f]/.test(merged.path))) {
    return denied();
  }
  if (merged.headers !== undefined) {
    const headers = plainData(merged.headers);
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'host' && value !== ORIGIN && value !== ORIGIN + ':443') return denied();
    }
    merged.headers = headers;
  }
  merged.protocol = 'https:';
  merged.hostname = ORIGIN;
  merged.host = ORIGIN;
  merged.port = 443;
  // A fresh built-in one-shot agent avoids post-preload globalAgent replacement.
  merged.agent = false;
  delete merged.href;
  delete merged.origin;
  delete merged.username;
  delete merged.password;
  delete merged.auth;
  const normalized = Object.create(null);
  for (const [key, value] of Object.entries(merged)) normalized[key] = value;
  return Object.freeze(normalized);
}

function split(options, callback) {
  if (typeof options === 'function') return [undefined, options];
  if (callback !== undefined && typeof callback !== 'function') return denied();
  return [options, callback];
}

function guardedHttpsRequest(input, options, callback) {
  const selected = split(options, callback);
  return originalHttpsRequest(normalize(input, selected[0]), selected[1]);
}

function guardedHttpsGet(input, options, callback) {
  const request = guardedHttpsRequest(input, options, callback);
  request.end();
  return request;
}

Object.defineProperty(http, 'request', {value: denied, writable: false, configurable: false});
Object.defineProperty(http, 'get', {value: denied, writable: false, configurable: false});
Object.defineProperty(https, 'request', {value: guardedHttpsRequest, writable: false, configurable: false});
Object.defineProperty(https, 'get', {value: guardedHttpsGet, writable: false, configurable: false});
