import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceSvg = join(rootDir, 'build', 'icon-preview.svg')
const outputIcns = join(rootDir, 'build', 'icon.icns')
const tempDir = mkdtempSync(join(tmpdir(), 'codex-icon-'))
const iconsetDir = join(tempDir, 'icon.iconset')
const basePng = join(tempDir, 'icon-base.png')
const largePng = join(tempDir, 'icon-1024.png')

const iconVariants = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
]

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' })
}

try {
  if (process.platform !== 'darwin') {
    console.log('[icon] Skip: macOS icon generation only runs on darwin.')
    process.exit(0)
  }

  if (!existsSync(sourceSvg)) {
    throw new Error(`Icon source not found: ${sourceSvg}`)
  }

  mkdirSync(dirname(outputIcns), { recursive: true })
  mkdirSync(iconsetDir, { recursive: true })

  run('sips', ['-s', 'format', 'png', sourceSvg, '--out', basePng])
  run('sips', ['-z', '1024', '1024', basePng, '--out', largePng])

  for (const [fileName, size] of iconVariants) {
    run('sips', ['-z', String(size), String(size), largePng, '--out', join(iconsetDir, fileName)])
  }

  run('iconutil', ['-c', 'icns', iconsetDir, '-o', outputIcns])
  console.log(`[icon] Generated ${outputIcns}`)
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
