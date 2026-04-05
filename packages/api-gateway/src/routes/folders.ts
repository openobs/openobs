import { Router } from 'express'
import type { Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { defaultFolderStore } from '@agentic-obs/data-layer'

export function createFolderRouter(): Router {
  const router = Router()
  router.use(authMiddleware)

  // GET /api/folders — list all folders
  router.get('/', (_req: Request, res: Response) => {
    res.json(defaultFolderStore.findAll())
  })

  // POST /api/folders — create a folder
  router.post('/', (req: Request, res: Response) => {
    const { name, parentId } = req.body as { name?: string; parentId?: string }
    if (!name || !name.trim()) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'name is required' })
      return
    }
    const folder = defaultFolderStore.create({ name: name.trim(), parentId })
    res.status(201).json(folder)
  })

  // PUT /api/folders/:id — rename a folder
  router.put('/:id', (req: Request, res: Response) => {
    const { name } = req.body as { name?: string }
    if (!name || !name.trim()) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'name is required' })
      return
    }
    const folder = defaultFolderStore.rename(req.params['id'] ?? '', name.trim())
    if (!folder) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Folder not found' })
      return
    }
    res.json(folder)
  })

  // DELETE /api/folders/:id — delete a folder and all children
  router.delete('/:id', (req: Request, res: Response) => {
    const deleted = defaultFolderStore.delete(req.params['id'] ?? '')
    if (!deleted) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Folder not found' })
      return
    }
    res.status(204).send()
  })

  return router
}
