/**
 * UX-API-001 contract tests.
 *
 * These tests prove that every schema-backed operation can produce a minimal
 * self-consistent example and that the public contract has not shrunk relative
 * to the frozen 2026-08-10 baseline. The explicit untyped-operation ledger is
 * intentionally kept red in the requirements registry: preventing the debt
 * from growing cannot make an undocumented response safe for generated clients.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ReceiptDtoSchema } from '../../src/api/routes/v2_receipts_schemas.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';
type CompatibilityDirection = 'request' | 'response';

interface JsonSchema {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  default?: unknown;
  example?: unknown;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  additionalProperties?: boolean | JsonSchema;
}

interface MediaContainer {
  required?: boolean;
  content?: Record<string, { schema?: JsonSchema }>;
}

interface Parameter {
  name?: string;
  in?: string;
  required?: boolean;
  schema?: JsonSchema;
}

interface Operation {
  responses?: Record<string, MediaContainer>;
  requestBody?: MediaContainer;
  parameters?: Parameter[];
}

interface OpenApiDocument {
  paths: Record<string, Partial<Record<HttpMethod, Operation>>>;
  components?: { schemas?: Record<string, JsonSchema> };
}

const openapi = JSON.parse(readFileSync(join(repoRoot, 'schema', 'openapi.json'), 'utf8')) as OpenApiDocument;
const frozen = JSON.parse(
  readFileSync(join(here, 'fixtures', 'openapi_frozen_20260810.json'), 'utf8'),
) as OpenApiDocument;

const METHODS: readonly HttpMethod[] = ['get', 'post', 'put', 'delete', 'patch'];

/**
 * Operations that still have at least one undocumented successful response.
 * Exact matching makes newly introduced undocumented operations fail closed.
 * Removing an entry requires documenting every declared 2xx media surface.
 */
const UNTYPED_RESPONSE_DEBT = [
  'GET /api/v1/benchmark',
  'POST /api/v1/court',
  'GET /api/v1/evidence/chain/{headHash}',
  'GET /api/v1/evidence/{id}',
  'POST /api/v1/hypothesize',
  'GET /api/v1/lifecycle/events',
  'GET /api/v1/monitor/history',
  'GET /api/v1/monitor/latest',
  'GET /api/v1/monitor/stream',
  'GET /api/v1/report/{runId}/paper',
  'GET /api/v1/report/{runId}',
  'GET /api/v1/research',
  'POST /api/v1/research',
  'GET /api/v1/research/{runId}',
  'POST /api/v1/research/{runId}/analyze',
  'POST /api/v1/research/{runId}/cancel',
  'GET /api/v1/research/{runId}/evaluate',
  'GET /api/v1/research/{runId}/events',
  'POST /api/v1/research/{runId}/feedback',
  'GET /api/v1/research/{runId}/status',
  'GET /api/v1/verdict',
  'GET /api/v1/verdict/by_hypothesis/{hypoId}',
  'GET /api/v1/verdict/{id}',
  'POST /api/v1/arena',
] as const;

/** Deliberate removals need a decision reference; all other shrinkage fails. */
const REMOVED_BY_DESIGN: Readonly<Record<string, string>> = {
  '/api/v1/arena/demo': 'R9 authenticity: canned demo route removed by owner decision 2026-08-16, PR #44',
  '/api/v1/court/demo': 'R9 authenticity: canned demo route removed by owner decision 2026-08-16, PR #44',
};

function operationEntries(document: OpenApiDocument): Array<[string, HttpMethod, Operation]> {
  const entries: Array<[string, HttpMethod, Operation]> = [];
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of METHODS) {
      const operation = item[method];
      if (operation !== undefined) entries.push([path, method, operation]);
    }
  }
  return entries;
}

function untypedSuccessOperations(document: OpenApiDocument): string[] {
  return operationEntries(document)
    .filter(([, , operation]) => {
      const successes = Object.entries(operation.responses ?? {})
        .filter(([status]) => /^2\d\d$/.test(status));
      if (successes.length === 0) return true;
      return successes.some(([status, response]) => {
        const media = Object.values(response.content ?? {});
        if ((status === '204' || status === '205') && media.length === 0) return false;
        return media.length === 0 || media.some((entry) => entry.schema === undefined);
      });
    })
    .map(([path, method]) => `${method.toUpperCase()} ${path}`)
    .sort();
}

function mediaSchema(target: MediaContainer | undefined, context: string): JsonSchema {
  const schema = target?.content?.['application/json']?.schema;
  if (schema === undefined) throw new Error(`${context}: missing application/json schema`);
  return schema;
}

function decodePointerToken(token: string): string {
  return token.replaceAll('~1', '/').replaceAll('~0', '~');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveSchema(schema: JsonSchema, document: OpenApiDocument): JsonSchema {
  if (schema.$ref === undefined) return schema;
  if (!schema.$ref.startsWith('#/')) throw new Error(`external schema reference is unsupported: ${schema.$ref}`);
  let cursor: unknown = document;
  for (const token of schema.$ref.slice(2).split('/').map(decodePointerToken)) {
    if (!isRecord(cursor) || !(token in cursor)) throw new Error(`unresolved schema reference: ${schema.$ref}`);
    cursor = cursor[token];
  }
  if (!isRecord(cursor)) throw new Error(`schema reference does not resolve to an object: ${schema.$ref}`);
  return cursor as JsonSchema;
}

function concreteType(schema: JsonSchema): string | undefined {
  const types = Array.isArray(schema.type) ? schema.type : schema.type === undefined ? [] : [schema.type];
  return types.find((type) => type !== 'null');
}

/** Deterministically produce the smallest useful value for the supported OpenAPI subset. */
function generateSample(unresolved: JsonSchema, document: OpenApiDocument): unknown {
  const schema = resolveSchema(unresolved, document);
  if (schema.const !== undefined) return schema.const;
  if (schema.enum !== undefined && schema.enum.length > 0) return schema.enum[0];
  if (schema.default !== undefined) return schema.default;
  if (schema.example !== undefined) return schema.example;
  const union = schema.anyOf ?? schema.oneOf;
  if (union !== undefined && union.length > 0) {
    const branch = union.find((candidate) => concreteType(resolveSchema(candidate, document)) !== 'null') ?? union[0];
    if (branch === undefined) throw new Error('union schema has no branch');
    return generateSample(branch, document);
  }
  if (schema.allOf !== undefined) {
    const values = schema.allOf.map((part) => generateSample(part, document));
    if (values.every(isRecord)) return Object.assign({}, ...values);
    return values.at(-1) ?? null;
  }
  const type = concreteType(schema);
  if (type === 'object' || schema.properties !== undefined) {
    const out: Record<string, unknown> = {};
    for (const key of schema.required ?? []) {
      const property = schema.properties?.[key];
      if (property !== undefined) out[key] = generateSample(property, document);
    }
    return out;
  }
  if (type === 'array') {
    if ((schema.minItems ?? 0) === 0) return [];
    return schema.items === undefined ? [] : [generateSample(schema.items, document)];
  }
  if (type === 'string') return 'sample'.padEnd(schema.minLength ?? 0, 'x');
  if (type === 'number' || type === 'integer') return Math.max(schema.minimum ?? 0, 1);
  if (type === 'boolean') return true;
  if (type === 'null') return null;
  // An empty JSON Schema accepts every value; null is the minimal deterministic witness.
  if (type === undefined) return null;
  throw new Error(`sample generator: unsupported schema type ${type}`);
}

function validateAgainst(
  sample: unknown,
  unresolved: JsonSchema,
  document: OpenApiDocument,
  path: string,
): string[] {
  const schema = resolveSchema(unresolved, document);
  if (schema.const !== undefined && !isDeepStrictEqual(sample, schema.const)) return [`${path}: const mismatch`];
  if (schema.enum !== undefined && !schema.enum.some((value) => isDeepStrictEqual(value, sample))) {
    return [`${path}: value is outside enum`];
  }
  if (schema.anyOf !== undefined || schema.oneOf !== undefined) {
    const branches = schema.anyOf ?? schema.oneOf ?? [];
    if (branches.some((branch) => validateAgainst(sample, branch, document, path).length === 0)) return [];
    return [`${path}: no union branch accepts generated value`];
  }
  if (schema.allOf !== undefined) return schema.allOf.flatMap((part) => validateAgainst(sample, part, document, path));
  const types = Array.isArray(schema.type) ? schema.type : schema.type === undefined ? [] : [schema.type];
  if (sample === null) return types.length === 0 || types.includes('null') ? [] : [`${path}: null is not allowed`];
  const expectsObject = types.includes('object') || schema.properties !== undefined;
  if (expectsObject) {
    if (!isRecord(sample)) return [`${path}: expected object`];
    const errors: string[] = [];
    for (const key of schema.required ?? []) {
      if (!(key in sample)) errors.push(`${path}.${key}: required property is absent`);
    }
    for (const [key, property] of Object.entries(schema.properties ?? {})) {
      if (key in sample) errors.push(...validateAgainst(sample[key], property, document, `${path}.${key}`));
    }
    return errors;
  }
  if (types.includes('array')) {
    if (!Array.isArray(sample)) return [`${path}: expected array`];
    if (sample.length < (schema.minItems ?? 0)) return [`${path}: shorter than minItems`];
    return schema.items === undefined
      ? []
      : sample.flatMap((item, index) => validateAgainst(item, schema.items as JsonSchema, document, `${path}[${index}]`));
  }
  if (types.includes('integer') && (typeof sample !== 'number' || !Number.isInteger(sample))) return [`${path}: expected integer`];
  if (types.includes('number') && typeof sample !== 'number') return [`${path}: expected number`];
  if (types.includes('string') && typeof sample !== 'string') return [`${path}: expected string`];
  if (types.includes('boolean') && typeof sample !== 'boolean') return [`${path}: expected boolean`];
  return [];
}

function schemaTypes(schema: JsonSchema): Set<string> {
  if (schema.type !== undefined) return new Set(Array.isArray(schema.type) ? schema.type : [schema.type]);
  if (schema.properties !== undefined) return new Set(['object']);
  return new Set();
}

function compareSchemas(
  oldUnresolved: JsonSchema,
  newUnresolved: JsonSchema,
  oldDocument: OpenApiDocument,
  newDocument: OpenApiDocument,
  direction: CompatibilityDirection,
  path: string,
  violations: string[],
): void {
  const oldSchema = resolveSchema(oldUnresolved, oldDocument);
  const newSchema = resolveSchema(newUnresolved, newDocument);
  const oldTypes = schemaTypes(oldSchema);
  const newTypes = schemaTypes(newSchema);
  if (oldTypes.size > 0 && !isDeepStrictEqual([...oldTypes].sort(), [...newTypes].sort())) {
    violations.push(`${path}: type changed (${[...oldTypes].join('|')} -> ${[...newTypes].join('|')})`);
  }
  if (oldSchema.enum !== undefined) {
    const lost = oldSchema.enum.filter((value) => !newSchema.enum?.some((candidate) => isDeepStrictEqual(candidate, value)));
    if (lost.length > 0) violations.push(`${path}: enum values removed ${JSON.stringify(lost)}`);
    if (direction === 'response' && newSchema.enum !== undefined) {
      const added = newSchema.enum.filter((value) => !oldSchema.enum?.some((candidate) => isDeepStrictEqual(candidate, value)));
      if (added.length > 0) violations.push(`${path}: response enum values added ${JSON.stringify(added)}`);
    }
  } else if (newSchema.enum !== undefined) {
    violations.push(`${path}: unrestricted value narrowed to enum`);
  }
  if (oldSchema.const !== undefined || newSchema.const !== undefined) {
    if (!isDeepStrictEqual(oldSchema.const, newSchema.const)) violations.push(`${path}: const changed`);
  }
  for (const keyword of ['minItems', 'maxItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'pattern'] as const) {
    if (!isDeepStrictEqual(oldSchema[keyword], newSchema[keyword])) {
      violations.push(`${path}: ${keyword} constraint changed`);
    }
  }
  if (
    typeof oldSchema.additionalProperties === 'boolean' &&
    typeof newSchema.additionalProperties === 'boolean' &&
    oldSchema.additionalProperties !== newSchema.additionalProperties
  ) {
    violations.push(`${path}: additionalProperties policy changed`);
  }
  const oldUnion = oldSchema.anyOf ?? oldSchema.oneOf;
  const newUnion = newSchema.anyOf ?? newSchema.oneOf;
  if (oldUnion !== undefined) {
    if (newUnion === undefined || oldUnion.length !== newUnion.length) {
      violations.push(`${path}: union alternatives changed`);
    } else {
      oldUnion.forEach((branch, index) => {
        const newBranch = newUnion[index];
        if (newBranch !== undefined) compareSchemas(branch, newBranch, oldDocument, newDocument, direction, `${path}.union[${index}]`, violations);
      });
    }
  }
  const oldProperties = oldSchema.properties ?? {};
  const newProperties = newSchema.properties ?? {};
  for (const [name, oldProperty] of Object.entries(oldProperties)) {
    const newProperty = newProperties[name];
    if (newProperty === undefined) violations.push(`${path}.${name}: property removed`);
    else compareSchemas(oldProperty, newProperty, oldDocument, newDocument, direction, `${path}.${name}`, violations);
  }
  const oldRequired = new Set(oldSchema.required ?? []);
  const newRequired = new Set(newSchema.required ?? []);
  if (direction === 'response') {
    for (const name of oldRequired) if (!newRequired.has(name)) violations.push(`${path}.${name}: response guarantee removed`);
  } else {
    for (const name of newRequired) if (!oldRequired.has(name)) violations.push(`${path}.${name}: new required request property`);
  }
  if (oldSchema.items !== undefined) {
    if (newSchema.items === undefined) violations.push(`${path}[]: item schema removed`);
    else compareSchemas(oldSchema.items, newSchema.items, oldDocument, newDocument, direction, `${path}[]`, violations);
  }
  if (oldSchema.allOf !== undefined) {
    if (newSchema.allOf === undefined || oldSchema.allOf.length !== newSchema.allOf.length) {
      violations.push(`${path}: allOf clauses changed`);
    } else {
      oldSchema.allOf.forEach((part, index) => {
        const newPart = newSchema.allOf?.[index];
        if (newPart !== undefined) compareSchemas(part, newPart, oldDocument, newDocument, direction, `${path}.allOf[${index}]`, violations);
      });
    }
  }
}

function compatibilityViolations(oldDocument: OpenApiDocument, newDocument: OpenApiDocument): string[] {
  const violations: string[] = [];
  for (const [path, oldItem] of Object.entries(oldDocument.paths)) {
    if (path in REMOVED_BY_DESIGN) continue;
    const newItem = newDocument.paths[path];
    if (newItem === undefined) {
      violations.push(`${path}: path removed`);
      continue;
    }
    for (const method of METHODS) {
      const oldOperation = oldItem[method];
      if (oldOperation === undefined) continue;
      const newOperation = newItem[method];
      if (newOperation === undefined) {
        violations.push(`${method.toUpperCase()} ${path}: operation removed`);
        continue;
      }
      const operationPath = `${method.toUpperCase()} ${path}`;
      for (const [status, oldResponse] of Object.entries(oldOperation.responses ?? {})) {
        const newResponse = newOperation.responses?.[status];
        if (newResponse === undefined) {
          violations.push(`${operationPath}: response ${status} removed`);
          continue;
        }
        const oldSchema = oldResponse.content?.['application/json']?.schema;
        const newSchema = newResponse.content?.['application/json']?.schema;
        if (oldSchema !== undefined && newSchema === undefined) violations.push(`${operationPath} ${status}: response schema removed`);
        else if (oldSchema !== undefined && newSchema !== undefined) compareSchemas(oldSchema, newSchema, oldDocument, newDocument, 'response', `${operationPath} ${status}`, violations);
      }
      const oldBody = oldOperation.requestBody?.content?.['application/json']?.schema;
      const newBody = newOperation.requestBody?.content?.['application/json']?.schema;
      if (oldBody !== undefined && newBody === undefined) violations.push(`${operationPath}: request body schema removed`);
      else if (oldBody !== undefined && newBody !== undefined) compareSchemas(oldBody, newBody, oldDocument, newDocument, 'request', `${operationPath} request`, violations);
      if (oldOperation.requestBody?.required !== true && newOperation.requestBody?.required === true) {
        violations.push(`${operationPath}: request body became required`);
      }
      for (const oldParameter of oldOperation.parameters ?? []) {
        const match = newOperation.parameters?.find((candidate) => candidate.name === oldParameter.name && candidate.in === oldParameter.in);
        if (match === undefined) violations.push(`${operationPath}: parameter ${oldParameter.in}:${oldParameter.name} removed`);
        else if (oldParameter.required !== true && match.required === true) {
          violations.push(`${operationPath}: parameter ${oldParameter.in}:${oldParameter.name} became required`);
        } else if (oldParameter.schema !== undefined && match.schema === undefined) {
          violations.push(`${operationPath}: parameter ${oldParameter.in}:${oldParameter.name} schema removed`);
        } else if (oldParameter.schema !== undefined && match.schema !== undefined) compareSchemas(oldParameter.schema, match.schema, oldDocument, newDocument, 'request', `${operationPath} parameter ${oldParameter.in}:${oldParameter.name}`, violations);
      }
      for (const parameter of newOperation.parameters ?? []) {
        const existed = oldOperation.parameters?.some((candidate) => candidate.name === parameter.name && candidate.in === parameter.in);
        if (parameter.required === true && existed !== true) violations.push(`${operationPath}: new required parameter ${parameter.in}:${parameter.name}`);
      }
    }
  }
  return violations;
}

test('generated examples satisfy every currently schema-backed request and response media type', () => {
  let checked = 0;
  for (const [path, method, operation] of operationEntries(openapi)) {
    const bodySchema = operation.requestBody?.content?.['application/json']?.schema;
    if (bodySchema !== undefined) {
      const context = `${method.toUpperCase()} ${path} request`;
      assert.deepEqual(validateAgainst(generateSample(bodySchema, openapi), bodySchema, openapi, context), []);
      checked += 1;
    }
    for (const [status, response] of Object.entries(operation.responses ?? {})) {
      for (const [mediaType, media] of Object.entries(response.content ?? {})) {
        const responseSchema = media.schema;
        if (responseSchema === undefined) continue;
        const context = `${method.toUpperCase()} ${path} ${status} ${mediaType}`;
        assert.deepEqual(validateAgainst(generateSample(responseSchema, openapi), responseSchema, openapi, context), []);
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 26, `expected at least 26 schema-backed request/response surfaces, got ${checked}`);
});

test('untyped success-response debt is explicit and cannot silently grow', () => {
  const actual = untypedSuccessOperations(openapi);
  assert.deepEqual(actual, [...UNTYPED_RESPONSE_DEBT].sort());
});

test('untyped success oracle cannot be fooled by documenting only an error response', () => {
  const mutated = structuredClone(openapi);
  const operation = mutated.paths['/api/v1/benchmark']?.get;
  assert.ok(operation !== undefined);
  operation.responses = {
    ...operation.responses,
    400: {
      content: {
        'application/problem+json': {
          schema: { type: 'object', properties: { message: { type: 'string' } } },
        },
      },
    },
  };
  assert.ok(untypedSuccessOperations(mutated).includes('GET /api/v1/benchmark'));

  const partiallyTyped = structuredClone(openapi);
  const llmStatus = partiallyTyped.paths['/api/v1/llm-status']?.get;
  assert.ok(llmStatus?.responses?.['200']?.content !== undefined);
  llmStatus.responses['200'].content['application/problem+json'] = {};
  assert.ok(untypedSuccessOperations(partiallyTyped).includes('GET /api/v1/llm-status'));
});

test('ReceiptDto zod SSOT and generated OpenAPI response expose the same fields', () => {
  const converted = zodToJsonSchema(ReceiptDtoSchema) as JsonSchema;
  const zodProperties = converted.properties;
  assert.ok(zodProperties !== undefined && Object.keys(zodProperties).length > 0, 'zod conversion must expose fields');
  const detail = openapi.paths['/api/v2/receipts/{id}']?.get;
  assert.ok(detail !== undefined, 'receipt detail operation must exist');
  const inline = mediaSchema(detail.responses?.['200'], 'GET /api/v2/receipts/{id} 200').properties?.data?.properties?.receipt?.properties;
  assert.ok(inline !== undefined, 'generated response must contain data.receipt object');
  assert.deepEqual(Object.keys(zodProperties).sort(), Object.keys(inline).sort());
});

test('frozen public contract remains backward compatible recursively', () => {
  const violations = compatibilityViolations(frozen, openapi);
  assert.deepEqual(violations, [], `unexpected compatibility shrinkage:\n${violations.join('\n')}`);
});

test('compatibility oracle catches nested field, type, required-input, and status regressions', () => {
  const withoutNestedReceipt = structuredClone(openapi);
  const nestedSchema = mediaSchema(withoutNestedReceipt.paths['/api/v2/receipts/{id}']?.get?.responses?.['200'], 'mutated receipt detail');
  const nestedProperties = nestedSchema.properties?.data?.properties;
  assert.ok(nestedProperties !== undefined);
  delete nestedProperties.receipt;
  assert.ok(compatibilityViolations(frozen, withoutNestedReceipt).some((item) => item.includes('data.receipt: property removed')));

  const changedRequestType = structuredClone(openapi);
  const requestSchema = mediaSchema(changedRequestType.paths['/api/v2/receipts']?.post?.requestBody, 'mutated receipt request');
  const proofHash = requestSchema.properties?.proofHash;
  assert.ok(proofHash !== undefined);
  proofHash.type = 'number';
  assert.ok(compatibilityViolations(frozen, changedRequestType).some((item) => item.includes('proofHash: type changed')));

  const newRequiredInput = structuredClone(openapi);
  const requiredSchema = mediaSchema(newRequiredInput.paths['/api/v2/receipts']?.post?.requestBody, 'mutated required receipt request');
  requiredSchema.properties = { ...requiredSchema.properties, clientNonce: { type: 'string' } };
  requiredSchema.required = [...(requiredSchema.required ?? []), 'clientNonce'];
  assert.ok(compatibilityViolations(frozen, newRequiredInput).some((item) => item.includes('clientNonce: new required request property')));

  const withoutStatus = structuredClone(openapi);
  const responses = withoutStatus.paths['/api/v2/receipts']?.post?.responses;
  assert.ok(responses !== undefined);
  delete responses['201'];
  assert.ok(compatibilityViolations(frozen, withoutStatus).some((item) => item.includes('response 201 removed')));
});

test('intentional-removal allowlist is anchored and cannot rot silently', () => {
  for (const path of Object.keys(REMOVED_BY_DESIGN)) {
    assert.ok(frozen.paths[path] !== undefined, `${path} must exist in frozen baseline`);
    assert.ok(openapi.paths[path] === undefined, `${path} was restored and must leave removal allowlist`);
  }
});
