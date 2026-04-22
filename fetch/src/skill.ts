import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const skillFile = join(__dirname, '..', 'skills', 'fetch.md')

export function printSkill(): void {
  try {
    const content = readFileSync(skillFile, 'utf-8')
    // Strip front matter
    if (content.startsWith('---\n')) {
      const end = content.indexOf('\n---\n', 4)
      if (end !== -1) {
        console.log(content.slice(end + 5).trim())
        return
      }
    }
    console.log(content)
  } catch {
    console.error(JSON.stringify({ error: 'Skill file not found' }))
    process.exitCode = 1
  }
}
