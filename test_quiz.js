#!/usr/bin/env node
/**
 * test_quiz.js — prueba local del generador de imágenes
 * Coloca este archivo junto a generate_quiz_image.py y tu carpeta images/
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ══════════════════════════════════════════════════════
//  DATOS DE PRUEBA (Edita aquí)
// ══════════════════════════════════════════════════════
const SIMULACION = {
    level:     1,               // images/1.png
    username:  'gensou__',      // tu usuario
    role_name: 'ハニー',  // Nombre del rol (puede ser japonés)
    passed:    true,            // true = PASS | false = FAIL
    score:     50,
    maxScore:  50,
    avatarUrl: 'https://images-ext-1.discordapp.net/external/7VQgMJGLG-dXnEC-So5fjl_0Z96v0AVMaVvndKt7K2E/%3Fsize%3D4096/https/cdn.discordapp.com/avatars/854206965277392917/5ccb931c76a645f9ce1e66aa32c6b55e.png?format=webp&quality=lossless&width=648&height=648',          // O pega una URL real de discord
};
// ══════════════════════════════════════════════════════

const SCRIPT  = path.join(__dirname, 'generate_quiz_image.py');
const IMAGES  = path.join(__dirname, 'images');
const OUTFILE = path.join(__dirname, `quiz_preview_v6.png`);

async function main() {
    // 1. Validar Package.json (Warning tip)
    const pkgPath = path.join(__dirname, 'package.json');
    if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.type !== 'module') {
            console.warn('⚠️  Nota: Para evitar warnings de Node, añade "type": "module" a tu package.json');
        }
    }

    // 2. Buscar fondo
    const bgPng = path.join(IMAGES, `${SIMULACION.level}.png`);
    const bgJpg = path.join(IMAGES, `${SIMULACION.level}.jpg`);
    const bg = fs.existsSync(bgPng) ? bgPng : fs.existsSync(bgJpg) ? bgJpg : null;

    if (!bg) {
        console.error(`\n❌ No se encontró el fondo: images/${SIMULACION.level}.png/jpg`);
        process.exit(1);
    }

    console.log(`\n🧪 Generando imagen de prueba con efecto GLOW...`);
    
    // En Windows, el comando es 'python', en Linux/Mac suele ser 'python3'
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    const args = [
        SCRIPT,
        bg,
        SIMULACION.avatarUrl,
        SIMULACION.role_name,
        SIMULACION.passed ? 'true' : 'false',
        String(SIMULACION.score),
        String(SIMULACION.maxScore),
        SIMULACION.username,
        OUTFILE,
    ];

    try {
        const { stdout, stderr } = await execFileAsync(pythonCmd, args, { timeout: 30_000 });

        if (stdout) console.log('✅ Python dice:', stdout.trim());
        if (stderr) console.warn('⚠️ Python stderr:', stderr.trim());
        
        console.log(`\n🎉 Imagen guardada como: ${path.basename(OUTFILE)}\n`);
    } catch (err) {
        console.error('\n💥 Error ejecutando Python:');
        console.error(' Asegúrate de tener instalada la librería Pillow: pip install Pillow');
        console.error(' Error completo:', err.message);
        if (err.stderr) console.error('\nStderr de Python:\n', err.stderr);
        process.exit(1);
    }
}

main();