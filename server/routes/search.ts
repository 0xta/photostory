// server/routes/search.ts — Hybrid Thai Full-Text & Semantic Search (Phase 2, FR-603, Algorithm 8.5)
import { FastifyPluginAsync } from 'fastify';
import db from '../db.js';
import { autoEventName } from '../utils.js';
import { embedText, searchSimilarPhotos, isMlEnabled } from '../workers/embed.js';

export const searchRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/search?q=
  app.get<{ Querystring: { q?: string } }>('/api/search', async (req) => {
    const q = req.query.q?.trim() || '';

    if (!q || q.length < 2) {
      return { photos: [], events: [], persons: [] };
    }

    // 1. FTS5 Trigram Search (FR-602)
    const ftsPhotoIds = new Set<string>();
    const ftsEventIds = new Set<string>();
    const ftsPersonIds = new Set<string>();

    try {
      // Trigram matching requires at least 3 chars; if 2 chars, try LIKE fallback or exact
      if (q.length >= 3) {
        const matches = db
          .prepare('SELECT kind, ref_id FROM search_fts WHERE search_fts MATCH ? LIMIT 100')
          .all(q) as Array<{ kind: string; ref_id: string }>;

        for (const m of matches) {
          if (m.kind === 'photo') ftsPhotoIds.add(m.ref_id);
          else if (m.kind === 'event') ftsEventIds.add(m.ref_id);
          else if (m.kind === 'person') ftsPersonIds.add(m.ref_id);
        }
      }
    } catch (err) {
      // In case of special FTS syntax characters, continue gracefully
      console.warn('FTS5 query failed:', err);
    }

    // 2. Semantic Vector Search (Phase 2, FR-603, Algorithm 8.5)
    const semanticScores = new Map<string, number>();

    if (isMlEnabled()) {
      try {
        const queryEmb = await embedText(q);
        const similar = searchSimilarPhotos(queryEmb, 60, 0.20);
        for (const item of similar) {
          semanticScores.set(item.photo_id, item.score);
        }
      } catch (err) {
        console.warn('Semantic search failed, falling back to FTS:', err);
      }
    }

    // 3. Blend and Rank Photos (Hybrid Blending)
    const allPhotoIds = new Set<string>([...ftsPhotoIds, ...semanticScores.keys()]);
    let photos: any[] = [];

    if (allPhotoIds.size > 0) {
      const placeholders = Array.from(allPhotoIds).map(() => '?').join(',');
      const rows = db
        .prepare(`
          SELECT id, filename, taken_at, lat, lon, burst, note
          FROM photos
          WHERE id IN (${placeholders})
        `)
        .all(...Array.from(allPhotoIds)) as any[];

      photos = rows.map((p) => {
        const inFts = ftsPhotoIds.has(p.id);
        const semScore = semanticScores.get(p.id) ?? 0;

        let compositeScore = 0;
        let matchType: 'fts' | 'semantic' | 'hybrid' = 'fts';

        if (inFts && semScore > 0) {
          compositeScore = 0.8 + 0.4 * semScore;
          matchType = 'hybrid';
        } else if (inFts) {
          compositeScore = 0.75;
          matchType = 'fts';
        } else {
          compositeScore = semScore;
          matchType = 'semantic';
        }

        return {
          ...p,
          score: Math.round(compositeScore * 100) / 100,
          match_type: matchType,
        };
      });

      // Sort by score descending
      photos.sort((a, b) => b.score - a.score);
    }

    // 4. Fetch Events
    let events: any[] = [];
    if (ftsEventIds.size > 0) {
      const placeholders = Array.from(ftsEventIds).map(() => '?').join(',');
      events = db
        .prepare(`
          SELECT id, name, place, note, ts_start, ts_end, lat, lon,
            (SELECT COUNT(*) FROM photos WHERE event_id = events.id) as photo_count
          FROM events
          WHERE id IN (${placeholders})
        `)
        .all(...Array.from(ftsEventIds)) as any[];

      events = events.map((ev, index) => ({
        ...ev,
        displayName:
          ev.name && ev.name.trim() !== ''
            ? ev.name
            : ev.ts_start
            ? autoEventName(index + 1, ev.ts_start)
            : 'เหตุการณ์',
      }));
    }

    // 5. Fetch Persons
    let persons: any[] = [];
    if (ftsPersonIds.size > 0) {
      const placeholders = Array.from(ftsPersonIds).map(() => '?').join(',');
      persons = db
        .prepare(`
          SELECT id, name, nick, color,
            (SELECT COUNT(*) FROM photo_persons WHERE person_id = persons.id) as photo_count
          FROM persons
          WHERE id IN (${placeholders})
        `)
        .all(...Array.from(ftsPersonIds));
    }

    return { photos, events, persons, ml_used: isMlEnabled() && semanticScores.size > 0 };
  });
};
