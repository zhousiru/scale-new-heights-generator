import { readdir, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const dependencies = new Map()
function collectModules() {
  return {
    name: 'audit-module-size',
    generateBundle(_, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue
        for (const [id, module] of Object.entries(chunk.modules)) {
          const match = id.match(/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/)
          if (!match) continue
          const name = match[1]
          const files = dependencies.get(name) ?? new Map()
          files.set(id, module.renderedLength)
          dependencies.set(name, files)
        }
      }
    },
  }
}

// Build in memory: this includes worker chunks but leaves dist untouched.
const result = await build({
  root,
  logLevel: 'silent',
  plugins: [collectModules()],
  worker: { plugins: () => [collectModules()] },
  build: { write: false, reportCompressedSize: false },
})
const outputs = (Array.isArray(result) ? result : [result]).flatMap(value => value.output)
const assets = outputs
  .map(output => {
    const content = output.type === 'chunk' ? output.code : output.source
    return {
      file: output.fileName,
      bytes: Buffer.byteLength(content),
      gzip: gzipSync(content).length,
      ...(output.type === 'chunk' ? { imports: output.imports, dynamicImports: output.dynamicImports } : {}),
    }
  }).sort((a, b) => b.bytes - a.bytes)
const publicFiles = await Promise.all((await readdir(new URL('../public/', import.meta.url))).map(async file => ({
  file,
  bytes: (await stat(new URL(`../public/${file}`, import.meta.url))).size,
})))
console.log(JSON.stringify({
  assets,
  publicFiles,
  // Rendered module lengths are before final chunk minification. Use these
  // only to locate contributors, not as additive download-size estimates.
  dependenciesBeforeMinification: [...dependencies].map(([name, files]) => ({
    name, bytes: [...files.values()].reduce((sum, bytes) => sum + bytes, 0),
  })).sort((a, b) => b.bytes - a.bytes),
}, null, 2))
