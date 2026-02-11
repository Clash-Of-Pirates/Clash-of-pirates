import * as fs from 'fs';
import { promises as fsPromises } from 'fs';

/**
 * Load a verification key from file
 * 
 * @param vkPath - Path to the verification key file
 * @returns Promise<Buffer> containing the VK bytes
 */
export async function loadVkFromFile(vkPath: string): Promise<Buffer> {
  try {
    const vkData = await fsPromises.readFile(vkPath);
    console.log(`✓ Loaded VK from ${vkPath} (${vkData.length} bytes)`);
    return vkData;
  } catch (error) {
    throw new Error(`Failed to load verification key from ${vkPath}: ${error.message}`);
  }
}

/**
 * Load both verification keys for Clash contract
 * 
 * @param commitVkPath - Path to the commit circuit verification key
 * @param revealVkPath - Path to the reveal circuit verification key
 * @returns Promise<{commitVk: Buffer, revealVk: Buffer}>
 */
export async function loadClashVks(
  commitVkPath: string,
  revealVkPath: string
): Promise<{ commitVk: Buffer; revealVk: Buffer }> {
  console.log('📄 Loading Verification Keys...');
  
  const [commitVk, revealVk] = await Promise.all([
    loadVkFromFile(commitVkPath),
    loadVkFromFile(revealVkPath)
  ]);
  
  console.log(`✓ Commit VK: ${commitVk.length} bytes`);
  console.log(`✓ Reveal VK: ${revealVk.length} bytes`);
  
  return { commitVk, revealVk };
}

/**
 * Synchronous version - Load both verification keys
 * 
 * @param commitVkPath - Path to the commit circuit verification key
 * @param revealVkPath - Path to the reveal circuit verification key
 * @returns {commitVk: Buffer, revealVk: Buffer}
 */
export function loadClashVksSync(
  commitVkPath: string,
  revealVkPath: string
): { commitVk: Buffer; revealVk: Buffer } {
  console.log('📄 Loading Verification Keys...');
  
  if (!fs.existsSync(commitVkPath)) {
    throw new Error(`Commit VK not found at: ${commitVkPath}`);
  }
  
  if (!fs.existsSync(revealVkPath)) {
    throw new Error(`Reveal VK not found at: ${revealVkPath}`);
  }
  
  const commitVk = fs.readFileSync(commitVkPath);
  const revealVk = fs.readFileSync(revealVkPath);
  
  console.log(`✓ Commit VK: ${commitVk.length} bytes`);
  console.log(`✓ Reveal VK: ${revealVk.length} bytes`);
  
  return { commitVk, revealVk };
}