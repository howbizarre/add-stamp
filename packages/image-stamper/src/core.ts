/// <reference lib="esnext.disposable" />
// The directive above travels into dist/core.d.ts. The declarations (ours and the generated
// glue's) mention `Symbol.dispose`, which only exists in that lib; without it a consumer on
// `lib: ["ES2022", "DOM"]` with `skipLibCheck: false` would fail to type-check this package.

/**
 * The typed wrapper around the wasm-bindgen output in ../wasm.
 *
 * What it adds over the raw bindings:
 *
 *   - options as a plain object with camelCase keys and CSS hex colours, built into the
 *     WebAssembly `StampOptions` handle per call and freed in a `finally`;
 *   - input as bytes, an `ArrayBuffer`, any typed array view, or a `Blob`/`File`;
 *   - a result that carries the MIME type and extension for the chosen encoding;
 *   - a clear error when the module has not been instantiated, instead of a `TypeError`
 *     from deep inside the glue, and a clear error after `free()`.
 *
 * Nothing here is framework-specific. The entries (./index.js and ./node.js) only differ
 * in how they locate the `.wasm`.
 */

import * as wasm from '../wasm/image_stamper.js';
import type {
  InitInput,
  InitOutput,
  SyncInitInput,
  ImageStamper as RawImageStamper,
  StampOptions as RawStampOptions
} from '../wasm/image_stamper.js';
import { packColor, unpackColor } from './color.js';

export { packColor, unpackColor };
export type { InitInput, InitOutput, SyncInitInput };

/** Output encodings. */
export type OutputFormat = 'jpeg' | 'webp';

/**
 * Every tunable in the pipeline. All optional: anything left out keeps the default compiled
 * into the crate, which {@link defaultOptions} reports at runtime. The numbers are
 * deliberately not repeated in this file: a copy here would drift from the Rust one.
 *
 * Numbers are clamped to a usable range inside the crate, so an out-of-range value is
 * corrected rather than refused. A `NaN` or an infinite value falls back to the default,
 * except for `lanczosMaxUpscale`, which keeps `Infinity`.
 */
export interface StampOptions {
  /** 1-100. JPEG only. The WebP encoder is lossless and ignores it. */
  quality?: number;

  /** Stamp opacity, 0-100. */
  opacity?: number;

  /** `'jpeg'` (alias `'jpg'`) or `'webp'`. */
  format?: OutputFormat | 'jpg';

  /** Clear space left around the stamp, in pixels of the source image. */
  stampPadding?: number;

  /** Largest image to decode, in megapixels. Anything bigger is refused from its header. */
  maxMegapixels?: number;

  /** Largest single dimension to decode, in pixels. */
  maxDimension?: number;

  /**
   * Colour that translucent pixels are composited onto when encoding JPEG, which has no
   * alpha channel. CSS hex; any alpha is ignored.
   */
  jpegMatte?: string;

  /**
   * Upscale factor above which the stamp is resized with the cheaper Triangle filter
   * instead of Lanczos3. `Infinity` for always-Lanczos3, 0 for never.
   */
  lanczosMaxUpscale?: number;

  /** Caption height as a fraction of the frame's shorter side. */
  textSizeRatio?: number;

  /** Floor on the caption size, in pixels. */
  textSizeMin?: number;

  /** Ceiling on the caption size, in pixels. */
  textSizeMax?: number;

  /** Padding below the caption, as a fraction of the caption size. */
  textPaddingRatio?: number;

  /** Floor on that padding, in pixels. */
  textPaddingMin?: number;

  /** Caption colour as CSS hex, alpha honoured, e.g. `#7d7d7d80` for grey at 50 %. */
  textColor?: string;
}

/** Options for one {@link ImageStamper.stamp} call. */
export interface StampInput extends StampOptions {
  /**
   * Text drawn centred along the bottom edge, typically the filename without its
   * extension. Omit it, or pass an empty string, to draw nothing.
   */
  caption?: string;
}

/** Every option with its value filled in, as {@link defaultOptions} returns it. */
export type ResolvedStampOptions = Required<Omit<StampOptions, 'format'>> & { format: OutputFormat };

/** Anything the encoded image bytes can arrive as. A `File` is a `Blob`. */
export type ImageSource = ArrayBuffer | ArrayBufferView | Blob;

/** The synchronous subset of {@link ImageSource}: no `Blob`, which can only be read async. */
export type ImageBytes = ArrayBuffer | ArrayBufferView;

export interface StampResult {
  /**
   * The encoded image. A fresh copy out of WebAssembly memory, so it is backed by a plain
   * `ArrayBuffer` and can go straight into `new Blob([...])`, `new File([...])` or
   * `fs.writeFile`.
   */
  bytes: Uint8Array<ArrayBuffer>;

  format: OutputFormat;
  mimeType: 'image/jpeg' | 'image/webp';
  extension: 'jpg' | 'webp';
}

/** Accepted by `createImageStamper` in both entries. */
export interface CreateOptions {
  /**
   * Where to get the `.wasm` from. Anything the generated glue accepts: a URL as a string
   * or `URL` (under Node only `http(s)`, since Node's `fetch` does not read `file:`), a
   * `Request`, a `Response`, the bytes, a compiled `WebAssembly.Module`, or a promise of
   * any of these. Leave it out to use the copy shipped next to the glue.
   */
  wasm?: InitInput | Promise<InitInput>;
}

/**
 * What {@link initWasm} accepts: the input, a promise of it, or a function returning
 * either. The function is only called when an instantiation actually starts, so an
 * expensive default (reading the file from disk) is not paid by callers who arrive while
 * another instantiation is already in flight.
 */
export type WasmSource = InitInput | Promise<InitInput> | (() => InitInput | Promise<InitInput> | undefined);

// ---------------------------------------------------------------------------------------
// Module instantiation
// ---------------------------------------------------------------------------------------

let initialization: Promise<InitOutput> | null = null;
let ready = false;

/**
 * The glue is a module-level singleton that a consumer can also initialise through the
 * raw `image-stamper/wasm` entry, in which case this wrapper's flag was never set. Probing
 * the glue once (a constructor call fails with a TypeError while its exports are undefined)
 * keeps the two in agreement.
 */
function detectReady(): boolean {
  if (ready) {
    return true;
  }

  try {
    new wasm.StampOptions().free();
  } catch {
    return false;
  }

  ready = true;
  // Already instantiated, so the glue's init returns its exports without loading anything.
  initialization ??= wasm.default();

  return true;
}

/**
 * Instantiates the WebAssembly module. Idempotent: concurrent and repeated calls share one
 * instantiation, and a `wasm` argument given after the first call is ignored. A failed
 * attempt is forgotten, so the next call retries.
 *
 * The input is awaited here rather than handed to the glue as a promise: the glue decides
 * whether to `fetch` by looking at the value's type before awaiting it, so a promise of a
 * URL would otherwise reach `WebAssembly.instantiate` as a string.
 */
export function initWasm(input?: WasmSource): Promise<InitOutput> {
  if (initialization || detectReady()) {
    return initialization!;
  }

  // Called synchronously, so a caller can rely on it having run (or not) by the time this
  // returns, and so a throwing function becomes a rejection like every other failure here.
  let source: InitInput | Promise<InitInput> | undefined;

  try {
    source = typeof input === 'function' ? input() : input;
  } catch (error) {
    return Promise.reject(error);
  }

  initialization = Promise.resolve(source)
    .then((resolved) => wasm.default(resolved == null ? undefined : { module_or_path: resolved }))
    .then((output) => {
      ready = true;

      return output;
    })
    .catch((error: unknown) => {
      initialization = null;

      throw error;
    });

  return initialization;
}

/**
 * Synchronous instantiation from bytes or a compiled `WebAssembly.Module`, for code that
 * already holds them, such as a worker that was handed the module.
 *
 * Refuses to run while an asynchronous {@link initWasm} is in flight: the glue would
 * instantiate a second time when that one settles and swap its exports underneath every
 * handle created in between.
 */
export function initWasmSync(module: SyncInitInput): InitOutput {
  if (initialization && !ready) {
    throw new Error('image-stamper: an asynchronous initWasm() is in flight. Await it instead of calling initWasmSync().');
  }

  const output = wasm.initSync({ module });

  ready = true;
  initialization = Promise.resolve(output);

  return output;
}

/** Whether the module has been instantiated and stampers can be created. */
export function isWasmReady(): boolean {
  return detectReady();
}

function assertReady(): void {
  if (!detectReady()) {
    throw new Error(
      'image-stamper: the WebAssembly module is not instantiated yet. ' +
        'Call createImageStamper(), or initWasm() / initWasmSync(), first and await it.'
    );
  }
}

// ---------------------------------------------------------------------------------------
// Input conversion
// ---------------------------------------------------------------------------------------

/**
 * A `Uint8Array` over the same bytes, without copying where possible. Honours the view's
 * offset and length: a `Buffer` from Node's `fs` is often a window onto a larger pool, and
 * `new Uint8Array(view.buffer)` would hand the whole pool to the decoder.
 */
export function toBytesSync(source: ImageBytes): Uint8Array {
  // Widened on purpose: the checks below also have to recognise what a caller passed
  // *wrongly*, which the parameter type says cannot happen.
  const value: unknown = source;

  if (value instanceof Uint8Array) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  if (value instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer)) {
    return new Uint8Array(value);
  }

  const isBlob = typeof Blob !== 'undefined' && value instanceof Blob;

  throw new TypeError(
    'image-stamper: expected image bytes as a Uint8Array, another ArrayBuffer view, or an ArrayBuffer' +
      (isBlob ? '. A Blob needs the async method.' : '.')
  );
}

/** Like {@link toBytesSync}, and also reads a `Blob` or `File`. */
export async function toBytes(source: ImageSource): Promise<Uint8Array> {
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    return new Uint8Array(await source.arrayBuffer());
  }

  return toBytesSync(source as ImageBytes);
}

// ---------------------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------------------

function normalizeFormat(format: StampOptions['format']): OutputFormat {
  switch (format) {
    case undefined:
    case null:
    case 'jpeg':
    case 'jpg':
      return 'jpeg';
    case 'webp':
      return 'webp';
    default:
      throw new TypeError(`image-stamper: unknown format "${String(format)}". Expected 'jpeg' or 'webp'.`);
  }
}

function describeFormat(format: OutputFormat): Pick<StampResult, 'format' | 'mimeType' | 'extension'> {
  return format === 'webp'
    ? { format, mimeType: 'image/webp', extension: 'webp' }
    : { format, mimeType: 'image/jpeg', extension: 'jpg' };
}

/**
 * The float fields cross as `f32`. Anything else, a string or a BigInt, would be coerced
 * by the glue without a word, and `NaN` would quietly become the default inside the crate.
 * Neither is what a caller who passed the wrong thing wants.
 */
function float(value: unknown, name: string): number {
  if (typeof value !== 'number') {
    throw new TypeError(`image-stamper: ${name} must be a number, got ${typeof value}.`);
  }

  return value;
}

/**
 * The integer fields cross as `u32`. The glue passes the number straight through, so a
 * negative or an oversized value would wrap (4294967296 into 0, -1 into 4294967295) with
 * no error. Refuse those here.
 */
function uint32(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError(`image-stamper: ${name} must be an integer between 0 and 4294967295, got ${String(value)}.`);
  }

  return value;
}

/**
 * Builds the WebAssembly options handle: the crate's defaults, overridden by whatever the
 * caller actually set. `null` is treated like `undefined`, so a form field that was cleared
 * falls through to the default rather than crossing as 0.
 *
 * The caller owns the handle and must `free()` it. It lives in WebAssembly memory.
 */
function buildRawOptions(options: StampOptions): RawStampOptions {
  const raw = new wasm.StampOptions();

  try {
    const o = options;

    if (o.quality != null) raw.quality = float(o.quality, 'quality');
    if (o.opacity != null) raw.opacity = float(o.opacity, 'opacity');
    if (o.format != null) raw.format = normalizeFormat(o.format) === 'webp' ? wasm.OutputFormat.WebP : wasm.OutputFormat.Jpeg;
    if (o.stampPadding != null) raw.stamp_padding = uint32(o.stampPadding, 'stampPadding');
    if (o.maxMegapixels != null) raw.max_megapixels = float(o.maxMegapixels, 'maxMegapixels');
    if (o.maxDimension != null) raw.max_dimension = uint32(o.maxDimension, 'maxDimension');
    if (o.jpegMatte != null) raw.jpeg_matte = packColor(o.jpegMatte);
    if (o.lanczosMaxUpscale != null) raw.lanczos_max_upscale = float(o.lanczosMaxUpscale, 'lanczosMaxUpscale');
    if (o.textSizeRatio != null) raw.text_size_ratio = float(o.textSizeRatio, 'textSizeRatio');
    if (o.textSizeMin != null) raw.text_size_min = float(o.textSizeMin, 'textSizeMin');
    if (o.textSizeMax != null) raw.text_size_max = float(o.textSizeMax, 'textSizeMax');
    if (o.textPaddingRatio != null) raw.text_padding_ratio = float(o.textPaddingRatio, 'textPaddingRatio');
    if (o.textPaddingMin != null) raw.text_padding_min = float(o.textPaddingMin, 'textPaddingMin');
    if (o.textColor != null) raw.text_color = packColor(o.textColor);
  } catch (error) {
    raw.free();

    throw error;
  }

  return raw;
}

/**
 * An `f32` read back as a JavaScript double carries the rounding of the narrower type:
 * `0.022` comes out as `0.02199999988079071`. Seven significant digits is what an `f32`
 * actually holds, so rounding to that recovers the value the crate was written with.
 */
function fromF32(value: number): number {
  return Number.isFinite(value) ? Number(value.toPrecision(7)) : value;
}

/**
 * The defaults compiled into the crate, read from a fresh options handle so they can never
 * disagree with what the pipeline actually uses. Requires the module to be instantiated.
 */
export function defaultOptions(): ResolvedStampOptions {
  assertReady();

  const raw = new wasm.StampOptions();

  try {
    return {
      quality: fromF32(raw.quality),
      opacity: fromF32(raw.opacity),
      format: raw.format === wasm.OutputFormat.WebP ? 'webp' : 'jpeg',
      stampPadding: raw.stamp_padding,
      maxMegapixels: fromF32(raw.max_megapixels),
      maxDimension: raw.max_dimension,
      jpegMatte: unpackColor(raw.jpeg_matte),
      lanczosMaxUpscale: fromF32(raw.lanczos_max_upscale),
      textSizeRatio: fromF32(raw.text_size_ratio),
      textSizeMin: fromF32(raw.text_size_min),
      textSizeMax: fromF32(raw.text_size_max),
      textPaddingRatio: fromF32(raw.text_padding_ratio),
      textPaddingMin: fromF32(raw.text_padding_min),
      textColor: unpackColor(raw.text_color)
    };
  } finally {
    raw.free();
  }
}

// ---------------------------------------------------------------------------------------
// The stamper
// ---------------------------------------------------------------------------------------

/**
 * One stamp, applied to any number of images.
 *
 * Holds a handle into WebAssembly memory, so it is not reclaimed by the garbage collector
 * on its own in every runtime: call {@link free} when done, or hold it in a `using`
 * declaration. Keeping one instance for a whole batch is also what keeps the scaled-stamp
 * cache warm. The stamp is resized once per distinct frame size, not once per photo.
 */
export class ImageStamper {
  #raw: RawImageStamper | null;

  private constructor(raw: RawImageStamper) {
    this.#raw = raw;
  }

  /**
   * Creates a stamper over the instantiated module. Prefer `createImageStamper()`, which
   * instantiates the module first; this is for code that has already done so.
   */
  static create(): ImageStamper {
    assertReady();

    return new ImageStamper(new wasm.ImageStamper());
  }

  get #handle(): RawImageStamper {
    if (!this.#raw) {
      throw new Error('image-stamper: this ImageStamper has been freed.');
    }

    return this.#raw;
  }

  /** True once {@link free} has been called. */
  get disposed(): boolean {
    return this.#raw === null;
  }

  /** Whether {@link setStamp} has succeeded. */
  get hasStamp(): boolean {
    return this.#handle.hasStamp;
  }

  /** Width of the loaded stamp in pixels, or 0 if none is loaded. */
  get stampWidth(): number {
    return this.#handle.stampWidth;
  }

  /** Height of the loaded stamp in pixels, or 0 if none is loaded. */
  get stampHeight(): number {
    return this.#handle.stampHeight;
  }

  /**
   * Decodes the stamp and keeps it for every following {@link stamp} call. Replaces any
   * stamp set before.
   *
   * Takes the options because the stamp is decoded under the same `maxMegapixels` and
   * `maxDimension` limits as a photo. A PNG with alpha is the usual choice; the alpha is
   * kept and multiplied by `opacity` at composite time.
   */
  async setStamp(stamp: ImageSource, options: StampOptions = {}): Promise<void> {
    this.setStampSync(await toBytes(stamp), options);
  }

  /** {@link setStamp} for bytes already in hand. */
  setStampSync(stamp: ImageBytes, options: StampOptions = {}): void {
    const handle = this.#handle;
    const bytes = toBytesSync(stamp);
    const raw = buildRawOptions(options);

    try {
      handle.setStamp(bytes, raw);
    } finally {
      raw.free();
    }
  }

  /**
   * Uprights the image from its EXIF orientation, scales the stamp to fit inside it with
   * `stampPadding` of clear space, composites it centred at `opacity`, draws the caption,
   * and encodes the result.
   *
   * Rejects with an `Error` whose message names the problem: the file is not a readable
   * image, it exceeds the pixel budget, or no stamp has been set. The instance stays usable
   * after any of these.
   */
  async stamp(image: ImageSource, options: StampInput = {}): Promise<StampResult> {
    return this.stampSync(await toBytes(image), options);
  }

  /** {@link stamp} for bytes already in hand. */
  stampSync(image: ImageBytes, options: StampInput = {}): StampResult {
    const handle = this.#handle;
    const bytes = toBytesSync(image);
    const { caption = '', ...rest } = options;

    if (typeof caption !== 'string') {
      throw new TypeError(`image-stamper: caption must be a string, got ${typeof caption}.`);
    }

    const format = normalizeFormat(rest.format);
    const raw = buildRawOptions(rest);

    try {
      // The glue returns `.slice()` of a view into WebAssembly memory: a copy over a plain
      // ArrayBuffer, which is what makes the narrower type below true.
      const out = handle.applyStamp(bytes, caption, raw) as Uint8Array<ArrayBuffer>;

      return { bytes: out, ...describeFormat(format) };
    } finally {
      raw.free();
    }
  }

  /** Releases the WebAssembly memory. Safe to call twice; every other method throws afterwards. */
  free(): void {
    if (this.#raw) {
      this.#raw.free();
      this.#raw = null;
    }
  }
}

// `using stamper = await createImageStamper()` where the runtime has explicit resource
// management. Assigned conditionally rather than declared in the class body: in a runtime
// without `Symbol.dispose` the computed key would evaluate to `undefined` and define a
// method literally named "undefined".
export interface ImageStamper {
  [Symbol.dispose](): void;
}

if (typeof Symbol.dispose === 'symbol') {
  Object.defineProperty(ImageStamper.prototype, Symbol.dispose, {
    value: ImageStamper.prototype.free,
    writable: true,
    configurable: true
  });
}
