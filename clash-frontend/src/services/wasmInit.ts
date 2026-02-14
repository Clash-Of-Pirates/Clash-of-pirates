import initNoirC from "@noir-lang/noirc_abi";
import initACVM from "@noir-lang/acvm_js";
import acvm from "@noir-lang/acvm_js/web/acvm_js_bg.wasm?url";
import noirc from "@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url";


let wasmInitialized = false;

/**
 * Initialize WASM modules once
 * Call this before using Noir/bb.js
 */
export async function initializeWasm(): Promise<void> {
  if (wasmInitialized) {
    console.log('[WASM] Already initialized');
    return;
  }

  console.log('[WASM] Initializing ACVM and NoirC...');
  
  try {
    await Promise.all([
      initACVM(fetch(acvm)),
      initNoirC(fetch(noirc))
    ]);
    
    wasmInitialized = true;
    console.log('[WASM] Initialization complete ✅');
  } catch (error) {
    console.error('[WASM] Initialization failed:', error);
    throw new Error('Failed to initialize WASM modules');
  }
}

export function isWasmInitialized(): boolean {
  return wasmInitialized;
}