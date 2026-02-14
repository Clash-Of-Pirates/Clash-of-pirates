/**
 * NoirService - Handles Noir circuit execution and UltraHonk proof generation
 *
 * Output format matches exactly what the shell script produces and what the
 * Soroban verifier contract expects:
 *
 *   verify_proof(public_inputs: Bytes, proof_bytes: Bytes)
 *
 * Where:
 *   public_inputs = [player_address (32B)] [session_id (32B)] [commitment_hash (32B)]
 *                 = 96 bytes total (3 field elements × 32 bytes each)
 *
 *   proof_bytes   = raw UltraHonk proof bytes, NO header, NO public inputs prepended
 *                 = proof.proof from bb.js generateProof()
 *
 * This mirrors what the script does:
 *   PUB_BYTES = (pub_param_count + 1_for_return_value) × 32  →  96 bytes
 *   public_inputs = first 96 bytes  of proof.with_public_inputs
 *   proof_bytes   = bytes 97..end   of proof.with_public_inputs
 *
 * The commitment hash (Pedersen hash of all moves + address + session) is the
 * circuit's return value — it appears as the LAST 32 bytes of public_inputs.
 * The Soroban contract extracts it with:
 *   let commitment_hash = public_inputs[len-32..len]
 */

import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';
import { initializeWasm, isWasmInitialized } from '@/services/wasmInit';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClashProofInputs {
  attacks:        [number, number, number]; // 0=Slash 1=Fireball 2=Lightning
  defenses:       [number, number, number]; // 0=Block  1=Dodge    2=Counter
  playerAddress:  string;                   // Stellar G-address
  sessionId:      number;                   // u32 game session
}

export interface ClashProofResult {
  /** 96 bytes: [player_address(32) | session_id(32) | commitment_hash(32)] */
  publicInputs:     Uint8Array;
  /** Raw UltraHonk proof — passed directly to verify_proof / verify_and_attest_commit */
  proofBytes:       Uint8Array;
  /** Commitment hash (last 32 bytes of publicInputs) as 0x-prefixed hex */
  commitmentHash:   string;
  /** 6-byte packed moves for verify_and_attest_reveal: [atk0,atk1,atk2,def0,def1,def2] */
  movesRaw:         Uint8Array;
  /** Wall-clock proof generation time in seconds (display only) */
  proofTime:        string;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class NoirService {

  /**
   * Generate a Clash commitment proof.
   *
   * Returns exactly the bytes the verifier contract needs — no extra framing.
   */
  async generateClashProof(
    circuitName: string,
    inputs: ClashProofInputs,
  ): Promise<ClashProofResult> {
  
    // ── 0. WASM init ────────────────────────────────────────────────────────
    if (!isWasmInitialized()) {
      console.log('[NoirService] Initializing WASM...');
      await initializeWasm();
    }
  
    // ── 1. Load circuit ──────────────────────────────────────────────────────
    console.log(`[1/5] Loading circuit: ${circuitName}`);
    const response = await fetch(`/circuits/${circuitName}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load circuit: ${circuitName} (${response.status})`);
    }
    const circuit = await response.json();
    
    // IMPORTANT: Verify circuit structure matches what we expect
    console.log('[1/5] Circuit ABI:', circuit.abi);
    console.log('[1/5] Bytecode length:', circuit.bytecode?.length || 'missing');
  
    // ── 2. Build Noir inputs ─────────────────────────────────────────────────
    const noirInputs = {
      attacks:        inputs.attacks.map(String),
      defenses:       inputs.defenses.map(String),
      player_address: addressToField(inputs.playerAddress),
      session_id:     `0x${inputs.sessionId.toString(16).padStart(64, '0')}`,
    };
  
    console.log('[2/5] Circuit inputs prepared:', noirInputs);
  
    // ── 3. Execute circuit → witness + return value ──────────────────────────
    console.log('[3/5] Executing circuit...');
    let witness, returnValue;
    
    try {
      const noir = new Noir(circuit);
      const result = await noir.execute(noirInputs);
      witness = result.witness;
      returnValue = result.returnValue;
      console.log('[3/5] Witness generated, return value (commitment hash):', returnValue);
    } catch (err) {
      console.error('[3/5] Circuit execution failed:', err);
      throw new Error(`Circuit execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  
    // ── 4. Generate UltraHonk proof ──────────────────────────────────────────
    console.log('[4/5] Generating UltraHonk proof (may take 3–10s)...');
    
    let backend;
    try {
      // Make sure bytecode is passed correctly
      backend = new UltraHonkBackend(circuit.bytecode, { threads: 1 });
    } catch (err) {
      console.error('[4/5] Backend initialization failed:', err);
      throw new Error(`Failed to initialize UltraHonk backend: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  
    const proofStart = performance.now();
    let proof;
    
    try {
      proof = await backend.generateProof(witness, { keccak: true });
      const proofTime = ((performance.now() - proofStart) / 1000).toFixed(2);
      console.log(`[4/5] Proof generated in ${proofTime}s`);
    } catch (err) {
      console.error('[4/5] Proof generation failed:', err);
      throw new Error(`Proof generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  
    const proofBytes = proof.proof;
  
    // ── 5. Build public_inputs ───────────────────────────────────────────────
    console.log('[5/5] Building public inputs...');
  
    const playerAddressBytes = fieldToBytes32(noirInputs.player_address);
    const sessionIdBytes     = fieldToBytes32(noirInputs.session_id);
    const commitmentHashBytes = fieldToBytes32(returnValue as string);
  
    const publicInputs = new Uint8Array(96); // 3 × 32
    publicInputs.set(playerAddressBytes,    0);
    publicInputs.set(sessionIdBytes,        32);
    publicInputs.set(commitmentHashBytes,   64);
  
    const commitmentHash = '0x' + bufToHex(commitmentHashBytes);
  
    // ── 6. Build moves_raw for reveal attestation ────────────────────────────
    const movesRaw = new Uint8Array([
      ...inputs.attacks,
      ...inputs.defenses,
    ]);
  
    console.log(`[Done] Commitment hash: ${commitmentHash}`);
    console.log(`[Done] public_inputs:   ${publicInputs.length} bytes`);
    console.log(`[Done] proof_bytes:     ${proofBytes.length} bytes`);
  
    return {
      publicInputs,
      proofBytes,
      commitmentHash,
      movesRaw,
      proofTime: ((performance.now() - proofStart) / 1000).toFixed(2),
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert a Stellar G-address to a Noir Field (hex string).
 *
 * The script uses a fixed 32-byte numeric like 0x00...01.
 * In the frontend we derive a deterministic 31-byte representation
 * from the UTF-8 encoding of the address so it fits in a BN254 field.
 * (BN254 field prime is ~254 bits; 31 bytes = 248 bits, always safe.)
 */
export function addressToField(stellarAddress: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(stellarAddress);
  // Take first 31 bytes — safe for BN254 field
  const hex = Array.from(bytes.slice(0, 31))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `0x${hex.padStart(62, '0')}`; // 31 bytes = 62 hex chars
}

/**
 * Convert a 0x-prefixed hex field string to a 32-byte big-endian Uint8Array.
 * Works for both circuit inputs and the return value from noir.execute().
 */
function fieldToBytes32(hexValue: string): Uint8Array {
  const clean = hexValue.startsWith('0x') ? hexValue.slice(2) : hexValue;
  const padded = clean.padStart(64, '0'); // 32 bytes = 64 hex chars
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Uint8Array → lowercase hex string (no 0x prefix) */
function bufToHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convenience: compute just the commitment hash without generating a full proof.
 * Useful for pre-flight checks or displaying the hash in the UI before committing.
 */
export async function computeCommitmentHash(
  attacks:       [number, number, number],
  defenses:      [number, number, number],
  playerAddress: string,
  sessionId:     number,
  circuitName:   string,
): Promise<string> {
  if (attacks.length !== 3 || defenses.length !== 3) {
    throw new Error('Must provide exactly 3 attacks and 3 defenses');
  }

  const response = await fetch(`/circuits/${circuitName}.json`);
  if (!response.ok) throw new Error(`Failed to load circuit: ${circuitName}`);
  const circuit = await response.json();

  const noir = new Noir(circuit);
  const { returnValue } = await noir.execute({
    attacks:        attacks.map(String),
    defenses:       defenses.map(String),
    player_address: addressToField(playerAddress),
    session_id:     `0x${sessionId.toString(16).padStart(64, '0')}`,
  });

  return returnValue as string;
}






// /**
//  * NoirService - Handles Noir circuit execution and UltraHonk proof generation
//  *
//  * This service provides methods to:
//  * - Load compiled Noir circuits
//  * - Execute circuits with user inputs to generate witnesses
//  * - Generate UltraHonk proofs using the bb.js backend
//  * - Build proof blobs compatible with the Stellar verifier contract
//  */

// import { Noir } from '@noir-lang/noir_js';
// import { UltraHonkBackend } from '@aztec/bb.js';
// import { keccak_256 } from '@noble/hashes/sha3.js';
// import { initializeWasm, isWasmInitialized } from "@/services/wasmInit";


// /**
//  * Service for generating UltraHonk proofs from Noir circuits
//  */
// export class NoirService {
//     /**
//      * Generates an UltraHonk proof for a given circuit and inputs
//      *
//      * The proof generation process:
//      * 1. Loads the compiled circuit from /circuits/{circuitName}.json
//      * 2. Executes the circuit with provided inputs to generate a witness
//      * 3. Generates an UltraHonk proof using bb.js with keccak oracle hash
//      * 4. Extracts public inputs from circuit parameters (not from bb.js compact format)
//      * 5. Builds a proof blob: u32_be(total_fields) || public_inputs || proof
//      * 6. Computes proof ID as Keccak-256 hash of the proof blob
//      * 7. Loads the pre-generated verification key
//      *
//      * @param circuitName - Name of the circuit (e.g., 'simple_circuit', 'zkp_maze', 'sudoku')
//      * @param inputs - Circuit input values as key-value pairs
//      * @returns Proof data including proof bytes, public inputs, proof blob, VK, and proof ID
//      */
//     async generateProof(circuitName: string, inputs: Record<string, any>) {
//         // Ensure WASM is initialized before generating proof
//     if (!isWasmInitialized()) {
//         console.log('[NoirService] WASM not initialized, initializing now...');
//         await initializeWasm();
//       }
//       console.log(`[NoirService] Starting proof generation for ${circuitName}`);
  
//       // Load the compiled circuit
//       console.log(`[1/6] Loading circuit...`);
//       const response = await fetch(`/circuits/${circuitName}.json`);
//       if (!response.ok) {
//         throw new Error(`Failed to load circuit: ${circuitName}`);
//       }
//       const circuit = await response.json();
//       console.log(`[1/6] Circuit loaded`);
  
//       // Initialize Noir with the circuit
//       console.log(`[2/6] Initializing Noir...`);
//       const noir = new Noir(circuit);
//       console.log(`[2/6] Noir initialized`);
  
//       // Execute the circuit to generate witness
//       console.log(`[3/6] Executing circuit with inputs:`, inputs);
//       const { witness, returnValue } = await noir.execute(inputs);
//       console.log(`[3/6] Witness generated, length:`, witness.length);
//       console.log(`[3/6] Return value:`, returnValue);
  
//       // Debug: Check circuit public parameters
//       const publicParams = circuit.abi.parameters.filter((p: any) => p.visibility === 'public');
//       const hasPublicReturn = circuit.abi.return_type?.visibility === 'public';
//       console.log(`[DEBUG] Circuit has ${publicParams.length} public parameter(s):`, publicParams.map((p: any) => `${p.name} (${p.type.kind})`));
  
//       // Initialize UltraHonk backend
//       console.log(`[4/6] Initializing UltraHonkBackend...`);
//       const backend = new UltraHonkBackend(circuit.bytecode, {
//         threads: 1  // Use single-threaded mode to avoid worker issues
//       });
//       console.log(`[4/6] Backend initialized`);
  
//       // Generate proof (use keccak oracle hash for Stellar verification)
//       console.log(`[5/6] Generating proof (this may take 3 - 10 seconds)...`);
//       const proofStart = performance.now();
//       try {
//           const proof = await backend.generateProof(witness, { keccak: true });
//           const proofTime = ((performance.now() - proofStart) / 1000).toFixed(2);
//           console.log(`[5/6] Proof generated in ${proofTime}s`);
      
//           // Extract proof bytes
//           const proofBytes = proof.proof;
//    // 1. Get Public Parameters
//         const publicInputFields: Uint8Array[] = [];
//         const publicParams = circuit.abi.parameters.filter((p: any) => p.visibility === 'public');

//         publicParams.forEach((p: any) => {
//             const inputValue = inputs[p.name];
//             publicInputFields.push(this.fieldToBytes(inputValue));
//         });

//         // 2. Add Public Return Value (The Commitment)
//         if (circuit.abi.return_type?.visibility === 'public') {
//             publicInputFields.push(this.fieldToBytes(returnValue));
//         }

//         // 3. Concatenate all public inputs
//         const publicInputsBytes = new Uint8Array(publicInputFields.length * 32);
//         publicInputFields.forEach((field, i) => {
//             publicInputsBytes.set(field, i * 32);
//         });

//         console.log(`[DEBUG] Total public fields: ${publicInputFields.length}`);

//         //   console.log(`[DEBUG] Total public inputs: ${publicInputsBytes.length} bytes (${publicInputsBytes.length / 32} fields)`);
      
//           // Build proof blob using helper method
//         //   const { proofBlob, proofId } = this.buildProofBlob(publicInputsBytes, proofBytes);
      
//           // Load pre-generated VK using helper method
//         //   console.log(`[6/6] Loading verification key...`);
//         //   const vkJson = await this.loadVk(circuitName);
      
//         //   console.log(`[6/6] Complete! Proof ID: ${proofId}`);
//         const { proofBlob, proofId } = this.buildProofBlob(publicInputsBytes, proofBytes);
    
//         console.log(`[DEBUG] Proof blob length: ${proofBlob.length}`);
//         console.log(`[6/6] Complete! Proof ID: ${proofId}`);
      
//           return {
//             proof: proofBytes,
//             publicInputs: publicInputsBytes,
//             proofBlob,
//             // vkJson,
//             proofId,
//             proofTime
//           };       
//       } catch (error) {
//         console.error('[NoirService] Proof generation error:', error);
//         throw error;
//       }
//     }


//     /**
//  * Convert a Field value to 32 bytes (big-endian)
//  */
// private fieldToBytes(value: any): Uint8Array {
//     const field = new Uint8Array(32);
//     const bigIntValue = BigInt(value);
    
//     // Convert to big-endian bytes
//     let val = bigIntValue;
//     for (let i = 0; i < 32; i++) {
//         field[32 - 1 - i] = Number(val & BigInt(0xff));
//         val = val >> BigInt(8);
//     }
    
//     return field;
// }
    
  
//     // /**
//     //  * Loads the verification key for a circuit
//     //  *
//     //  * @param circuitName - Name of the circuit
//     //  * @returns Verification key as raw bytes
//     //  */
//     // async loadVk(circuitName: string): Promise<Uint8Array> {
//     //   const vkResponse = await fetch(`/circuits/${circuitName}_vk.json`);
//     //   if (!vkResponse.ok) {
//     //     throw new Error(`Failed to load VK for circuit: ${circuitName}`);
//     //   }
//     //   const vkArrayBuffer = await vkResponse.arrayBuffer();
//     //   return new Uint8Array(vkArrayBuffer);
//     // }
  
//     /**
//      * Encodes public inputs from circuit inputs based on circuit ABI
//      *
//      * @param circuit - The compiled circuit JSON
//      * @param inputs - Circuit input values as key-value pairs
//      * @returns Encoded public inputs as bytes
//      */
//     encodePublicInputs(circuit: any, inputs: Record<string, any>): Uint8Array {
//       const publicParams = circuit.abi.parameters.filter((p: any) => p.visibility === 'public');
//       const publicInputFields: Uint8Array[] = [];
  
//       if (publicParams.length > 0) {
//         publicParams.forEach((p: any) => {
//           const inputValue = inputs[p.name];
          
//           // Helper function to encode a single value as a 32-byte field element
//           const encodeField = (value: any, elementType: string, width?: number): Uint8Array => {
//             const field = new Uint8Array(32);
//             const bigIntValue = BigInt(value);
            
//             if (elementType === 'integer' && width) {
//               const numBytes = width / 8;
//               let val = bigIntValue;
//               for (let i = 0; i < numBytes; i++) {
//                 field[32 - 1 - i] = Number(val & BigInt(0xff));
//                 val = val >> BigInt(8);
//               }
//             } else {
//               let val = bigIntValue;
//               for (let i = 0; i < 32; i++) {
//                 field[32 - 1 - i] = Number(val & BigInt(0xff));
//                 val = val >> BigInt(8);
//               }
//             }
//             return field;
//           };
  
//           // Handle array types (e.g., puzzle: pub [Field; 81])
//           if (p.type.kind === 'array') {
//             const arrayLength = p.type.length;
//             const elementType = p.type.type.kind;
//             const elementWidth = p.type.type.width;
            
//             if (!Array.isArray(inputValue)) {
//               throw new Error(`Expected array for public parameter ${p.name}, got ${typeof inputValue}`);
//             }
//             if (inputValue.length !== arrayLength) {
//               throw new Error(`Array length mismatch for ${p.name}: expected ${arrayLength}, got ${inputValue.length}`);
//             }
            
//             inputValue.forEach((element: any) => {
//               const field = encodeField(element, elementType, elementWidth);
//               publicInputFields.push(field);
//             });
//           } 
//           // Handle scalar integer types
//           else if (p.type.kind === 'integer') {
//             const field = encodeField(inputValue, 'integer', p.type.width);
//             publicInputFields.push(field);
//           } 
//           // Handle scalar field types
//           else if (p.type.kind === 'field') {
//             const field = encodeField(inputValue, 'field');
//             publicInputFields.push(field);
//           }
//           else {
//             throw new Error(`Unsupported public parameter type: ${p.type.kind} for parameter ${p.name}`);
//           }
//         });
//       }
  
//       // Concatenate all public input fields
//       const totalPublicInputBytes = publicInputFields.length * 32;
//       const publicInputsBytes = new Uint8Array(totalPublicInputBytes);
//       publicInputFields.forEach((field, i) => {
//         publicInputsBytes.set(field, i * 32);
//       });
  
//       return publicInputsBytes;
//     }
  
//     /**
//      * Builds a proof blob from public inputs and proof bytes
//      *
//      * @param publicInputsBytes - Encoded public inputs
//      * @param proofBytes - Proof bytes (can be dummy/invalid for testing)
//      * @returns Proof blob and proof ID
//      */
//     // buildProofBlob(publicInputsBytes: Uint8Array, proofBytes: Uint8Array): { proofBlob: Uint8Array; proofId: string } {
//     //   const proofFieldCount = proofBytes.length / 32;
//     //   const publicInputFieldCount = publicInputsBytes.length / 32;
//     //   const totalFields = proofFieldCount + publicInputFieldCount;
  
//     //   // Create header (4 bytes, big-endian u32)
//     //   const header = new Uint8Array(4);
//     //   const view = new DataView(header.buffer);
//     //   view.setUint32(0, totalFields, false); // false = big-endian
  
//     //   // Concatenate: header || publicInputs || proof
//     //   const proofBlob = new Uint8Array(
//     //     header.length + publicInputsBytes.length + proofBytes.length
//     //   );
//     //   proofBlob.set(header, 0);
//     //   proofBlob.set(publicInputsBytes, header.length);
//     //   proofBlob.set(proofBytes, header.length + publicInputsBytes.length);
  
//     //   // Compute proof ID (Keccak-256 hash of proof blob)
//     //   const proofIdBytes = keccak_256(proofBlob);
//     //   const proofId = Array.from(proofIdBytes)
//     //     .map(b => b.toString(16).padStart(2, '0'))
//     //     .join('');
  
//     //   return { proofBlob, proofId };
//     // }
//     // buildProofBlob(publicInputsBytes: Uint8Array, proofBytes: Uint8Array): { proofBlob: Uint8Array; proofId: string } {
//     //     const publicInputFieldCount = publicInputsBytes.length / 32;
//     //     const proofFieldCount = proofBytes.length / 32;
//     //     const totalFields = publicInputFieldCount + proofFieldCount;
    
//     //     // Header: 4 bytes Big-Endian
//     //     const header = new Uint8Array(4);
//     //     const view = new DataView(header.buffer);
//     //     view.setUint32(0, totalFields, false); 
    
//     //     // Blob: [Header] [Public Inputs] [Proof]
//     //     const proofBlob = new Uint8Array(header.length + publicInputsBytes.length + proofBytes.length);
//     //     proofBlob.set(header, 0);
//     //     proofBlob.set(publicInputsBytes, header.length);
//     //     proofBlob.set(proofBytes, header.length + publicInputsBytes.length);
    
//     //     const proofIdBytes = keccak_256(proofBlob);
//     //     const proofId = Array.from(proofIdBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    
//     //     return { proofBlob, proofId };
//     // }

//     buildProofBlob(publicInputsBytes: Uint8Array, proofBytes: Uint8Array): { proofBlob: Uint8Array; proofId: string } {
//         const proofFieldCount = proofBytes.length / 32;
//         const publicInputFieldCount = publicInputsBytes.length / 32;
//         const totalFields = proofFieldCount + publicInputFieldCount;
    
//         // Create header (4 bytes, big-endian u32)
//         const header = new Uint8Array(4);
//         const view = new DataView(header.buffer);
//         view.setUint32(0, totalFields, false); // false = big-endian
    
//         // Concatenate: header || publicInputs || proof
//         const proofBlob = new Uint8Array(
//           header.length + publicInputsBytes.length + proofBytes.length
//         );
//         proofBlob.set(header, 0);
//         proofBlob.set(publicInputsBytes, header.length);
//         proofBlob.set(proofBytes, header.length + publicInputsBytes.length);
    
//         // Compute proof ID (Keccak-256 hash of proof blob)
//         const proofIdBytes = keccak_256(proofBlob);
//         const proofId = Array.from(proofIdBytes)
//           .map(b => b.toString(16).padStart(2, '0'))
//           .join('');
    
//         return { proofBlob, proofId };
//       }
  
//   }

// /**
//  * Compute Pedersen hash for Clash game commitment
//  * 
//  * @param attacks - Array of 3 attack values (0-2)
//  * @param defenses - Array of 3 defense values (0-2)
//  * @param playerAddress - Player's Stellar address as hex string
//  * @param sessionId - Game session ID (u32)
//  * @returns Pedersen hash as hex string
//  */
// export async function computeCommitmentHash(
//     attacks: number[],
//     defenses: number[],
//     playerAddress: string,
//     sessionId: number,
//     circuitName: string,
//   ): Promise<string> {
//     if (attacks.length !== 3 || defenses.length !== 3) {
//       throw new Error('Must provide exactly 3 attacks and 3 defenses');
//     }
//     console.log("Fetching circuit from:", `/circuits/${circuitName}.json`);

//     const response = await fetch(`/circuits/${circuitName}.json`);
//       if (!response.ok) {
//         throw new Error(`Failed to load circuit: ${circuitName}`);
//       }
//       const circuit = await response.json();
  
//     // Convert Stellar address to Field (hex string to Field)
//     // Stellar addresses are base32 encoded, we need to convert to a number
//     const playerAddressField = addressToField(playerAddress);
//     const sessionIdField = sessionId.toString();
  
//     // Prepare inputs for the circuit
//     const inputs = {
//       attacks: attacks.map(a => a.toString()),
//       defenses: defenses.map(d => d.toString()),
//       player_address: playerAddressField,
//       session_id: sessionIdField,
//     };
  
//     // Initialize backend and Noir
//     const noir = new Noir(circuit);
//     // const backend = new UltraHonkBackend(circuit.bytecode);
  
//     // Execute the circuit to get the hash
//     const { returnValue } = await noir.execute(inputs);
  
//     // The return value is the Pedersen hash
//     return returnValue as string;
//   }

//   /**
//  * Convert Stellar address to Field value
//  * Stellar addresses are 56 characters (G + 55 base32 chars)
//  * We need to convert to a numeric representation
//  */
// export function addressToField(stellarAddress: string): string {
//     //  convert address string to bytes and take first 31 bytes
//     const encoder = new TextEncoder();
//     const addressBytes = encoder.encode(stellarAddress);
    
//     // Convert bytes to hex string (Field)
//     let hexString = '0x';
//     for (let i = 0; i < Math.min(addressBytes.length, 31); i++) {
//       hexString += addressBytes[i].toString(16).padStart(2, '0');
//     }
    
//     return hexString;
//   }




  
  