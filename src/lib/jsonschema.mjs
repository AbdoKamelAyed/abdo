// A small, dependency-free JSON Schema validator.
//
// It implements exactly the subset of JSON Schema (draft-07 style) that the ABDO
// schemas use. Anything outside that subset throws when a schema is registered,
// so a typo in a schema can never silently disable a rule.
//
// Why not Ajv? The build must run with zero npm dependencies (see docs/architecture.md).

const ANNOTATION_KEYWORDS = new Set([
  '$schema', '$id', '$comment', 'title', 'description', 'default', 'examples', '$defs', 'definitions',
]);

const ASSERTION_KEYWORDS = new Set([
  'type', 'enum', 'const', 'required', 'properties', 'additionalProperties', 'propertyNames',
  'items', 'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength', 'minimum', 'maximum',
  'pattern', 'format', '$ref', 'allOf', 'anyOf', 'oneOf', 'if', 'then', 'else',
  'minProperties', 'maxProperties',
]);

const SUBSCHEMA_MAP_KEYWORDS = ['properties', '$defs', 'definitions'];
const SUBSCHEMA_KEYWORDS = ['additionalProperties', 'propertyNames', 'items', 'if', 'then', 'else'];
const SUBSCHEMA_ARRAY_KEYWORDS = ['allOf', 'anyOf', 'oneOf'];

const FORMATS = {
  date(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return false;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
  },
  'date-time'(v) {
    const m = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(\.\d+)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(v);
    return Boolean(m) && FORMATS.date(m[1]);
  },
  // An address a visitor can safely be sent to: web, mail or phone. Anything else (javascript:, data:, vbscript:, file:)
  // is refused, because these fields end up as the href of a link on the public site.
  uri(v) {
    return /^(?:https?|mailto|tel):[^\s]+$/i.test(v);
  },
  email(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  },
};

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

function matchesType(value, type) {
  const actual = typeOf(value);
  return actual === type || (type === 'number' && actual === 'integer');
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Edit distance where swapping two adjacent letters ("cuont" for "count") costs one edit, since
// transpositions are the most common typo.
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[a.length][b.length];
}

/** Suggest the closest candidate for a mistyped key/value, or null. */
export function didYouMean(input, candidates) {
  let best = null;
  let bestDistance = Infinity;
  for (const c of candidates) {
    const d = levenshtein(String(input).toLowerCase(), String(c).toLowerCase());
    if (d < bestDistance) { best = c; bestDistance = d; }
  }
  const limit = Math.max(1, Math.floor(String(input).length / 3));
  return best !== null && bestDistance <= limit ? best : null;
}

/** Format a path array like ['translations','ar','body',2,'text'] as translations.ar.body[2].text */
export function formatPath(path) {
  if (path.length === 0) return '(root)';
  let out = '';
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`;
    else out += out ? `.${seg}` : seg;
  }
  return out;
}

function assertKnownKeywords(schema, where) {
  if (schema === true || schema === false) return;
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    throw new Error(`Schema error at ${where}: a schema must be an object`);
  }
  for (const key of Object.keys(schema)) {
    if (!ANNOTATION_KEYWORDS.has(key) && !ASSERTION_KEYWORDS.has(key)) {
      throw new Error(`Schema error at ${where}: unsupported keyword "${key}"`);
    }
  }
  for (const k of SUBSCHEMA_MAP_KEYWORDS) {
    if (schema[k] && typeof schema[k] === 'object') {
      for (const [name, sub] of Object.entries(schema[k])) assertKnownKeywords(sub, `${where}/${k}/${name}`);
    }
  }
  for (const k of SUBSCHEMA_KEYWORDS) {
    if (schema[k] !== undefined && typeof schema[k] === 'object') assertKnownKeywords(schema[k], `${where}/${k}`);
  }
  for (const k of SUBSCHEMA_ARRAY_KEYWORDS) {
    if (Array.isArray(schema[k])) schema[k].forEach((sub, i) => assertKnownKeywords(sub, `${where}/${k}/${i}`));
  }
  if (schema.format !== undefined && !FORMATS[schema.format]) {
    throw new Error(`Schema error at ${where}: unsupported format "${schema.format}"`);
  }
}

export class SchemaRegistry {
  constructor() {
    this.byId = new Map();
    this.regexCache = new Map();
  }

  add(schema) {
    if (!schema.$id) throw new Error('Every registered schema needs an $id');
    assertKnownKeywords(schema, schema.$id);
    this.byId.set(schema.$id, schema);
    return this;
  }

  has(id) {
    return this.byId.has(id);
  }

  resolveRef(ref, baseId) {
    const hashIndex = ref.indexOf('#');
    const uriPart = hashIndex === -1 ? ref : ref.slice(0, hashIndex);
    const fragment = hashIndex === -1 ? '' : ref.slice(hashIndex + 1);
    const id = uriPart ? new URL(uriPart, baseId).href : baseId;
    const root = this.byId.get(id);
    if (!root) throw new Error(`Unresolved $ref "${ref}" (looked for ${id})`);
    let node = root;
    if (fragment) {
      for (const raw of fragment.replace(/^\//, '').split('/')) {
        const seg = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
        node = node?.[seg];
        if (node === undefined) throw new Error(`Unresolved $ref "${ref}" (no "${seg}" in ${id})`);
      }
    }
    return { schema: node, baseId: id };
  }

  /** Validate data against a registered schema. Returns an array of { path, message }. */
  validate(schemaId, data) {
    const root = this.byId.get(schemaId);
    if (!root) throw new Error(`Unknown schema "${schemaId}"`);
    const errors = [];
    this.#check(root, schemaId, data, [], errors);
    return errors;
  }

  #regex(pattern) {
    let re = this.regexCache.get(pattern);
    if (!re) {
      re = new RegExp(pattern, 'u');
      this.regexCache.set(pattern, re);
    }
    return re;
  }

  #check(schema, baseId, value, path, errors) {
    if (schema === true) return;
    if (schema === false) { errors.push({ path, message: 'is not allowed here' }); return; }

    if (schema.$ref !== undefined) {
      const resolved = this.resolveRef(schema.$ref, baseId);
      this.#check(resolved.schema, resolved.baseId, value, path, errors);
    }

    if (schema.type !== undefined) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!types.some((t) => matchesType(value, t))) {
        errors.push({ path, message: `must be ${types.join(' or ')} (found ${typeOf(value)})` });
        return; // other keywords would only produce noise
      }
    }

    if (schema.enum !== undefined && !schema.enum.some((e) => deepEqual(e, value))) {
      const hint = typeof value === 'string' ? didYouMean(value, schema.enum.filter((e) => typeof e === 'string')) : null;
      errors.push({
        path,
        message: `must be one of: ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}${hint ? ` (did you mean "${hint}"?)` : ''}`,
      });
    }

    if (schema.const !== undefined && !deepEqual(schema.const, value)) {
      errors.push({ path, message: `must be ${JSON.stringify(schema.const)}` });
    }

    if (typeof value === 'string') this.#checkString(schema, value, path, errors);
    if (typeof value === 'number') this.#checkNumber(schema, value, path, errors);
    if (Array.isArray(value)) this.#checkArray(schema, baseId, value, path, errors);
    if (typeOf(value) === 'object') this.#checkObject(schema, baseId, value, path, errors);

    if (schema.allOf) schema.allOf.forEach((s) => this.#check(s, baseId, value, path, errors));

    if (schema.anyOf) this.#checkChoice('anyOf', schema.anyOf, baseId, value, path, errors);
    if (schema.oneOf) this.#checkChoice('oneOf', schema.oneOf, baseId, value, path, errors);

    if (schema.if !== undefined) {
      const probe = [];
      this.#check(schema.if, baseId, value, path, probe);
      if (probe.length === 0) {
        if (schema.then !== undefined) this.#check(schema.then, baseId, value, path, errors);
      } else if (schema.else !== undefined) {
        this.#check(schema.else, baseId, value, path, errors);
      }
    }
  }

  #checkChoice(keyword, branches, baseId, value, path, errors) {
    const results = branches.map((branch) => {
      const branchErrors = [];
      this.#check(branch, baseId, value, path, branchErrors);
      return branchErrors;
    });
    const matches = results.filter((r) => r.length === 0).length;
    if (keyword === 'anyOf' && matches >= 1) return;
    if (keyword === 'oneOf' && matches === 1) return;
    if (matches > 1) {
      errors.push({ path, message: 'matches more than one allowed shape' });
      return;
    }
    // None matched: surface the errors of the closest branch (fewest problems).
    const closest = results.reduce((a, b) => (b.length < a.length ? b : a));
    errors.push({ path, message: 'does not match any allowed shape; closest match reported below' });
    errors.push(...closest);
  }

  #checkString(schema, value, path, errors) {
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength) {
      errors.push({ path, message: schema.minLength === 1 ? 'must not be empty' : `must have at least ${schema.minLength} characters` });
    }
    if (schema.maxLength !== undefined && length > schema.maxLength) {
      errors.push({ path, message: `must have at most ${schema.maxLength} characters (has ${length})` });
    }
    if (schema.pattern !== undefined && !this.#regex(schema.pattern).test(value)) {
      errors.push({ path, message: `has an invalid format: "${value}" (expected pattern ${schema.pattern})` });
    }
    if (schema.format !== undefined && !FORMATS[schema.format](value)) {
      errors.push({ path, message: `must be a valid ${schema.format}: "${value}"` });
    }
  }

  #checkNumber(schema, value, path, errors) {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push({ path, message: `must be >= ${schema.minimum}` });
    if (schema.maximum !== undefined && value > schema.maximum) errors.push({ path, message: `must be <= ${schema.maximum}` });
  }

  #checkArray(schema, baseId, value, path, errors) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path, message: `must have at least ${schema.minItems} item(s)` });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({ path, message: `must have at most ${schema.maxItems} item(s)` });
    }
    if (schema.uniqueItems) {
      const seen = new Set();
      value.forEach((item, i) => {
        const key = JSON.stringify(item);
        if (seen.has(key)) errors.push({ path: [...path, i], message: 'is a duplicate' });
        seen.add(key);
      });
    }
    if (schema.items !== undefined) {
      value.forEach((item, i) => this.#check(schema.items, baseId, item, [...path, i], errors));
    }
  }

  #checkObject(schema, baseId, value, path, errors) {
    const keys = Object.keys(value);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
      errors.push({ path, message: `must have at least ${schema.minProperties} propert${schema.minProperties === 1 ? 'y' : 'ies'}` });
    }
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) {
      errors.push({ path, message: `must have at most ${schema.maxProperties} properties` });
    }
    for (const req of schema.required ?? []) {
      if (!(req in value)) errors.push({ path, message: `is missing required property "${req}"` });
    }
    const declared = schema.properties ?? {};
    for (const [key, sub] of Object.entries(declared)) {
      if (key in value) this.#check(sub, baseId, value[key], [...path, key], errors);
    }
    if (schema.propertyNames !== undefined) {
      for (const key of keys) {
        const probe = [];
        this.#check(schema.propertyNames, baseId, key, path, probe);
        if (probe.length) errors.push({ path, message: `has an invalid property name "${key}": ${probe[0].message}` });
      }
    }
    if (schema.additionalProperties !== undefined) {
      const extras = keys.filter((k) => !(k in declared));
      if (schema.additionalProperties === false) {
        for (const key of extras) {
          const hint = didYouMean(key, Object.keys(declared));
          errors.push({ path, message: `has an unknown property "${key}"${hint ? ` (did you mean "${hint}"?)` : ''}` });
        }
      } else if (schema.additionalProperties !== true) {
        for (const key of extras) this.#check(schema.additionalProperties, baseId, value[key], [...path, key], errors);
      }
    }
  }
}
