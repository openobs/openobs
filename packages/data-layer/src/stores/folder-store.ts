// In-memory store for dashboard folders (supports nesting via path separator)

import type { Persistable } from './persistence.js'
import { markDirty } from './persistence.js'

export interface Folder {
  id: string
  name: string
  parentId?: string
  createdAt: string
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export class FolderStore implements Persistable {
  private readonly folders = new Map<string, Folder>()

  create(params: { name: string; parentId?: string }): Folder {
    const folder: Folder = {
      id: uid(),
      name: params.name.trim(),
      parentId: params.parentId,
      createdAt: new Date().toISOString(),
    }
    this.folders.set(folder.id, folder)
    markDirty()
    return folder
  }

  findAll(): Folder[] {
    return Array.from(this.folders.values())
  }

  findById(id: string): Folder | undefined {
    return this.folders.get(id)
  }

  findByParent(parentId?: string): Folder[] {
    return Array.from(this.folders.values()).filter((f) =>
      parentId ? f.parentId === parentId : !f.parentId,
    )
  }

  rename(id: string, name: string): Folder | undefined {
    const folder = this.folders.get(id)
    if (!folder) return undefined
    folder.name = name.trim()
    markDirty()
    return folder
  }

  delete(id: string): boolean {
    // Also delete all children recursively
    const children = this.findByParent(id)
    for (const child of children) {
      this.delete(child.id)
    }
    const deleted = this.folders.delete(id)
    if (deleted) markDirty()
    return deleted
  }

  /** Build the full path for a folder (e.g. "production/api-gateway") */
  getPath(id: string): string {
    const parts: string[] = []
    let current = this.folders.get(id)
    while (current) {
      parts.unshift(current.name)
      current = current.parentId ? this.folders.get(current.parentId) : undefined
    }
    return parts.join('/')
  }

  toJSON(): unknown {
    return Array.from(this.folders.values())
  }

  loadJSON(data: unknown): void {
    this.folders.clear()
    if (Array.isArray(data)) {
      for (const item of data) {
        const f = item as Folder
        if (f.id) this.folders.set(f.id, f)
      }
    }
  }
}

export const defaultFolderStore = new FolderStore()
