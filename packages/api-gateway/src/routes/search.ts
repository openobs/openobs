import { Router } from 'express'
import type { Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { defaultDashboardStore, defaultAlertRuleStore, defaultFolderStore } from '@agentic-obs/data-layer'

export interface SearchResult {
  type: 'dashboard' | 'investigation' | 'alert' | 'folder' | 'panel'
  id: string
  title: string
  subtitle?: string
  matchField?: string
  navigateTo: string
}

function matchesQuery(text: string | undefined, q: string): boolean {
  return !!text && text.toLowerCase().includes(q)
}

export function createSearchRouter(): Router {
  const router = Router()
  router.use(authMiddleware)

  // GET /api/search?q=redis&limit=20
  router.get('/', (req: Request, res: Response) => {
    const q = (req.query['q'] as string ?? '').toLowerCase().trim()
    const limit = Math.min(parseInt(req.query['limit'] as string ?? '20', 10), 50)

    if (!q) {
      res.json({ results: [] })
      return
    }

    const results: SearchResult[] = []

    // Search folders — navigateTo includes folder id + ancestor path for auto-expand
    for (const f of defaultFolderStore.findAll()) {
      if (results.length >= limit) break
      if (matchesQuery(f.name, q)) {
        // Build ancestor chain so frontend can expand the full path
        const ancestors: string[] = []
        let cur = f.parentId ? defaultFolderStore.findById(f.parentId) : undefined
        while (cur) {
          ancestors.unshift(cur.id)
          cur = cur.parentId ? defaultFolderStore.findById(cur.parentId) : undefined
        }
        const expandIds = [...ancestors, f.id].join(',')
        results.push({ type: 'folder', id: f.id, title: f.name, subtitle: defaultFolderStore.getPath(f.id), navigateTo: `/dashboards?expand=${expandIds}` })
      }
    }

    // Search dashboards
    for (const d of defaultDashboardStore.findAll()) {
      if (results.length >= limit) break
      const type = 'dashboard'
      const nav = `/dashboards/${d.id}`

      // Title match
      if (matchesQuery(d.title, q)) {
        results.push({ type, id: d.id, title: d.title, subtitle: d.description, navigateTo: nav })
        continue
      }
      // Description match
      if (matchesQuery(d.description, q)) {
        results.push({ type, id: d.id, title: d.title, subtitle: d.description, matchField: 'description', navigateTo: nav })
        continue
      }
      // Panel title or PromQL match
      let panelMatch = false
      for (const p of d.panels) {
        if (matchesQuery(p.title, q)) {
          results.push({ type: 'panel', id: `${d.id}:${p.id}`, title: p.title, subtitle: d.title, matchField: 'panel', navigateTo: nav })
          panelMatch = true
          break
        }
        for (const pq of p.queries ?? []) {
          if (matchesQuery(pq.expr, q)) {
            results.push({ type: 'panel', id: `${d.id}:${p.id}`, title: p.title, subtitle: `${d.title} · ${pq.expr.slice(0, 60)}`, matchField: 'promql', navigateTo: nav })
            panelMatch = true
            break
          }
        }
        if (panelMatch) break
      }
    }

    // Search alerts
    for (const a of defaultAlertRuleStore.findAll().list) {
      if (results.length >= limit) break
      const name = a.name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/_/g, ' ').trim()
      if (matchesQuery(name, q) || matchesQuery(a.description, q) || matchesQuery(a.condition.query, q)) {
        results.push({
          type: 'alert',
          id: a.id,
          title: name,
          subtitle: a.description || a.condition.query.slice(0, 60),
          matchField: matchesQuery(name, q) ? undefined : 'query',
          navigateTo: '/alerts',
        })
      }
    }

    res.json({ results })
  })

  return router
}
