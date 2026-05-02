import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Subimos un nivel (..) porque images y fonts están en BtV-Bot, no en events
const ROOT_DIR = path.join(__dirname, '..'); 

export async function generateQuizImage(data) {
    const { level, avatarUrl, roleName, passed, score, maxScore, username } = data;
    
    const scriptPath = path.join(__dirname, 'generate_quiz_image.py'); // Sigue en events
    const bgPath = path.join(ROOT_DIR, 'images', `${level}.png`);      // Ahora busca en BtV-Bot/images
    const outPath = path.join(__dirname, `temp_${Date.now()}.png`);

    // Validación rápida antes de llamar a Python
    if (!fs.existsSync(bgPath)) {
        console.error(`❌ Error: No se encontró el fondo en ${bgPath}`);
        return null;
    }

    const args = [
        scriptPath,
        bgPath,
        avatarUrl,
        roleName,
        passed.toString(),
        score.toString(),
        maxScore.toString(),
        username,
        outPath
    ];

    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    
    try {
        await execFileAsync(pythonCmd, args);
        return outPath;
    } catch (err) {
        console.error('💥 Error en el script de Python:', err.stderr || err.message);
        return null;
    }
}

export function cleanupTempImage(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}