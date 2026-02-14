import express, { Request, Response } from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import path from 'path';
import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from "@aztec/bb.js";

const app = express();
app.use(cors());
app.use(express.json());

const CIRCUITS_DIR = path.join(__dirname, '../clash-frontend/circuits');

app.post('/generate-proof', async (req: Request, res: Response) => {
  try {
    const { circuitName, inputs } = req.body;

    console.log(`[Server] Generating proof for circuit: ${circuitName}`);

    // Load circuit JSON
    const circuitPath = path.join(CIRCUITS_DIR, `${circuitName}.json`);
    const circuitJSON = JSON.parse(readFileSync(circuitPath, 'utf-8'));

    // Initialize Noir
    const noir = new Noir(circuitJSON);

    // Generate witness
    const { witness } = await noir.execute(inputs);
    console.log(`[Server] Witness generated, length: ${witness.length}`);

    // Initialize UltraHonk backend
    const backend = new UltraHonkBackend(circuitJSON.bytecode);

    // Generate proof
    const proof = await backend.generateProof(witness, { keccak: true });

    console.log(`[Server] Proof generated successfully`);
    res.json({ proof: proof.proof });
  } catch (err: any) {
    console.error('[Server] Proof generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = 4000;
app.listen(PORT, () => console.log(`[Server] ZK backend running on http://localhost:${PORT}`));
