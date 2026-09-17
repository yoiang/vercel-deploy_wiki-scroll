// Regenerates the `sites` of every catalogue family carrying a
// `generatedFrom.sitematrix` marker. Hand-added families are untouched.
//
// Run with: npm run update-catalogue
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { applySitematrix } from '../src/wiki/sitematrix.ts'

const CATALOGUE = fileURLToPath(new URL('../src/wiki/catalogue.json', import.meta.url))
const API =
  'https://en.wikipedia.org/w/api.php?action=sitematrix&format=json&formatversion=2&origin=*'

const catalogue = JSON.parse(await readFile(CATALOGUE, 'utf8'))

const response = await fetch(API, {
  headers: { 'api-user-agent': 'wiki-scroll-catalogue-updater/0.1' },
})
if (!response.ok) {
  throw new Error(`sitematrix request failed: ${response.status} ${response.statusText}`)
}

const updated = applySitematrix(catalogue, await response.json())

for (const family of updated.families) {
  const before = catalogue.families.find((f) => f.id === family.id)?.sites.length ?? 0
  const suffix = family.generatedFrom ? '' : ' (hand-maintained, untouched)'
  console.log(
    `${family.id.padEnd(14)} ${String(family.sites.length).padStart(4)} sites (was ${before})${suffix}`,
  )
}

const total = updated.families.reduce((sum, f) => sum + f.sites.length, 0)
if (total === 0) throw new Error('Refusing to write an empty catalogue')

await writeFile(CATALOGUE, `${JSON.stringify(updated, null, 2)}\n`, 'utf8')
console.log(`\nWrote ${total} sites to src/wiki/catalogue.json`)
