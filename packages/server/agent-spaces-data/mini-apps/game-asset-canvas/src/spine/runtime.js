const VENDOR_BASE = 'vendor/spine/';

const RUNTIME_FILES = [
  'pixi-7.3.3.min.js',
  'pixi-spine-3.8-4.0.6.js',
];

let runtimePromise = null;
let spine42Promise = null;
let spine42Runtime = null;
let jszipPromise = null;

async function fetchVendor(fileName) {
  const AS = window.AgentSpaces;
  if (!AS?.srcFileUrl) {
    throw new Error('宿主未提供 srcFileUrl，无法加载 Spine 本地运行时');
  }
  const response = await fetch(AS.srcFileUrl(`${VENDOR_BASE}${fileName}`));
  if (!response.ok) {
    throw new Error(`Spine vendor 加载失败 (${response.status}): ${fileName}`);
  }
  return response.text();
}

async function evalGlobalVendor(fileName, wrapUmd = false) {
  const code = await fetchVendor(fileName);
  if (wrapUmd) {
    const wrapped = `(function(exports,module,define){${code}\n}).call(globalThis,undefined,undefined,undefined)`;
    (0, eval)(wrapped);
    return;
  }
  (0, eval)(code);
}

async function evalSpine42Vendor(fileName) {
  const code = await fetchVendor(fileName);
  return new Function(`${code}\nreturn typeof spine !== 'undefined' ? spine : null;`)();
}

export async function loadSpineRuntime() {
  if (window.PIXI?.VERSION === '7.3.3' && window.PIXI?.spine?.Spine) return window.PIXI;
  if (!runtimePromise) {
    runtimePromise = (async () => {
      for (const fileName of RUNTIME_FILES) {
        if (fileName.startsWith('pixi-') && !fileName.startsWith('pixi-spine') && window.PIXI?.VERSION === '7.3.3') continue;
        if (fileName.startsWith('pixi-spine') && window.PIXI?.spine?.Spine) continue;
        await evalGlobalVendor(fileName);
      }
      if (!window.PIXI?.Application || !window.PIXI?.spine?.Spine) {
        throw new Error('Spine 本地运行时初始化失败');
      }
      return window.PIXI;
    })().catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

export function getSpineRuntime() {
  if (!window.PIXI?.spine?.Spine) {
    throw new Error('Spine 运行时尚未加载');
  }
  return window.PIXI.spine;
}

export async function loadSpine42Runtime() {
  if (spine42Runtime?.Spine && spine42Runtime?.SkeletonJson) return spine42Runtime;
  if (!spine42Promise) {
    spine42Promise = (async () => {
      await loadSpineRuntime();
      const previousSpine = window.spine;
      const previousRequire = window.require;
      try {
        const loaded = await evalSpine42Vendor('spine-pixi-v7-4.2.119.min.js');
        console.debug('[SpineEditor] Spine 4.2 runtime exports:', loaded ? Object.keys(loaded).slice(0, 12) : []);
        if (!loaded?.Spine || !loaded?.SkeletonJson || !loaded?.SpineTexture) {
          throw new Error('Spine 4.2 本地运行时初始化失败');
        }
        spine42Runtime = loaded;
        return loaded;
      } finally {
        window.spine = previousSpine;
        if (previousRequire === undefined) delete window.require;
        else window.require = previousRequire;
      }
    })().catch((error) => {
      spine42Promise = null;
      throw error;
    });
  }
  return spine42Promise;
}

export async function getJSZip() {
  if (window.JSZip) return window.JSZip;
  if (!jszipPromise) {
    jszipPromise = evalGlobalVendor('jszip-3.10.1.min.js', true)
      .then(() => {
        if (!window.JSZip) throw new Error('JSZip 本地运行时初始化失败');
        return window.JSZip;
      })
      .catch((error) => {
        jszipPromise = null;
        throw error;
      });
  }
  return jszipPromise;
}

export const PIXI = new Proxy({}, {
  get(_target, key) {
    if (!window.PIXI) throw new Error('PixiJS 运行时尚未加载');
    return window.PIXI[key];
  },
});
