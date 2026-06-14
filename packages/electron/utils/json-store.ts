import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

export class JsonStore<T extends Record<string, any> = Record<string, any>> {
  private filePath: string
  private data: T

  constructor(filePath: string, defaultData: T = {} as T) {
    const dir = join(filePath, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.filePath = filePath
    try {
      this.data = existsSync(filePath) ? JSON.parse(readFileSync(filePath, 'utf-8')) : { ...defaultData }
    } catch {
      this.data = { ...defaultData }
    }
  }

  getAll(): T {
    return this.data
  }

  get<K extends keyof T>(key: K): T[K] | undefined {
    return this.data[key]
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.data[key] = value
    this.save()
  }

  delete(key: keyof T): void {
    delete this.data[key]
    this.save()
  }

  clear(): void {
    this.data = {} as T
    this.save()
  }

  private save(): void {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
  }
}
