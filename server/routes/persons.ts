// server/routes/persons.ts — Persons (Friends) CRUD, auto-stats, and timeline
import { FastifyPluginAsync } from 'fastify';
import db, { ftsUpsert, ftsDelete } from '../db.js';
import { genId, FRIEND_PALETTE, autoEventName } from '../utils.js';

interface PersonBody {
  name: string;
  nick?: string;
  note?: string;
  color?: string;
}

export const personsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/persons
  app.get('/api/persons', async () => {
    const items = db
      .prepare(`
        SELECT
          pr.id, pr.name, pr.nick, pr.note, pr.color, pr.created_at,
          COUNT(DISTINCT pp.photo_id) as photo_count,
          COUNT(DISTINCT p.event_id) as event_count
        FROM persons pr
        LEFT JOIN photo_persons pp ON pr.id = pp.person_id AND pp.source != 'face-suggestion'
        LEFT JOIN photos p ON pp.photo_id = p.id AND p.event_id IS NOT NULL
        GROUP BY pr.id
        ORDER BY photo_count DESC, pr.name ASC
      `)
      .all();

    return { items };
  });

  // POST /api/persons
  app.post<{ Body: PersonBody }>('/api/persons', async (req, reply) => {
    const { name, nick = '', note = '', color } = req.body || {};
    if (!name || !name.trim()) {
      return reply.status(400).send({ error: 'Name is required' });
    }

    const count = (
      db.prepare('SELECT COUNT(*) as c FROM persons').get() as { c: number }
    ).c;
    const assignedColor = color || FRIEND_PALETTE[count % FRIEND_PALETTE.length];

    const id = genId();
    const createdAt = Date.now();

    db.prepare(`
      INSERT INTO persons (id, name, nick, note, color, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name.trim(), nick.trim(), note.trim(), assignedColor, createdAt);

    // Update FTS
    const ftsText = [name.trim(), nick.trim(), note.trim()].filter(Boolean).join(' ');
    ftsUpsert('person', id, ftsText);

    const created = db.prepare('SELECT * FROM persons WHERE id = ?').get(id);
    return reply.status(201).send(created);
  });

  // GET /api/persons/:id (stats, timeline, photo grid) — FR-502 / FR-503 / AC-7
  app.get<{ Params: { id: string } }>('/api/persons/:id', async (req, reply) => {
    const person = db.prepare('SELECT * FROM persons WHERE id = ?').get(req.params.id) as any;
    if (!person) {
      return reply.status(404).send({ error: 'Person not found' });
    }

    // Auto-stats: photos together, events together, first met, last met
    const stats = db
      .prepare(`
        SELECT
          COUNT(DISTINCT pp.photo_id) as photo_count,
          COUNT(DISTINCT p.event_id) as event_count,
          MIN(p.taken_at) as first_met,
          MAX(p.taken_at) as last_met
        FROM photo_persons pp
        JOIN photos p ON pp.photo_id = p.id
        WHERE pp.person_id = ? AND pp.source != 'face-suggestion' AND p.taken_at IS NOT NULL
      `)
      .get(person.id) as any;

    // Timeline of events where they appear
    const timelineEvents = db
      .prepare(`
        SELECT DISTINCT
          e.id, e.name, e.place, e.note, e.ts_start, e.ts_end, e.lat, e.lon, e.named,
          (
            SELECT COUNT(*)
            FROM photos p2
            JOIN photo_persons pp2 ON p2.id = pp2.photo_id
            WHERE p2.event_id = e.id AND pp2.person_id = ? AND pp2.source != 'face-suggestion'
          ) as photo_count
        FROM events e
        JOIN photos p ON e.id = p.event_id
        JOIN photo_persons pp ON p.id = pp.photo_id
        WHERE pp.person_id = ? AND pp.source != 'face-suggestion'
        ORDER BY e.ts_start ASC
      `)
      .all(person.id, person.id) as any[];

    const timeline = timelineEvents.map((ev, index) => ({
      ...ev,
      displayName:
        ev.name && ev.name.trim() !== ''
          ? ev.name
          : ev.ts_start
          ? autoEventName(index + 1, ev.ts_start)
          : 'เหตุการณ์',
    }));

    // Photos tagged with this person
    const photos = db
      .prepare(`
        SELECT p.id, p.filename, p.taken_at, p.lat, p.lon, p.burst, p.event_id, p.note
        FROM photos p
        JOIN photo_persons pp ON p.id = pp.photo_id
        WHERE pp.person_id = ? AND pp.source != 'face-suggestion'
        ORDER BY p.taken_at ASC
      `)
      .all(person.id);

    return {
      ...person,
      stats: {
        photo_count: stats.photo_count || 0,
        event_count: stats.event_count || 0,
        first_met: stats.first_met ?? null,
        last_met: stats.last_met ?? null,
      },
      timeline,
      photos,
    };
  });

  // PATCH /api/persons/:id
  app.patch<{
    Params: { id: string };
    Body: Partial<PersonBody>;
  }>('/api/persons/:id', async (req, reply) => {
    const person = db.prepare('SELECT * FROM persons WHERE id = ?').get(req.params.id) as any;
    if (!person) {
      return reply.status(404).send({ error: 'Person not found' });
    }

    const { name, nick, note, color } = req.body || {};

    const newName = name !== undefined ? name.trim() : person.name;
    const newNick = nick !== undefined ? nick.trim() : person.nick;
    const newNote = note !== undefined ? note.trim() : person.note;
    const newColor = color !== undefined ? color : person.color;

    db.prepare(`
      UPDATE persons
      SET name = ?, nick = ?, note = ?, color = ?
      WHERE id = ?
    `).run(newName, newNick, newNote, newColor, person.id);

    // Update FTS
    const ftsText = [newName, newNick, newNote].filter(Boolean).join(' ');
    ftsUpsert('person', person.id, ftsText);

    const updated = db.prepare('SELECT * FROM persons WHERE id = ?').get(person.id);
    return updated;
  });

  // DELETE /api/persons/:id (FR-505: removes tag associations, never touches photos)
  app.delete<{ Params: { id: string } }>('/api/persons/:id', async (req, reply) => {
    const person = db.prepare('SELECT id FROM persons WHERE id = ?').get(req.params.id);
    if (!person) {
      return reply.status(404).send({ error: 'Person not found' });
    }

    db.prepare('DELETE FROM persons WHERE id = ?').run(req.params.id);
    ftsDelete('person', req.params.id);

    return { ok: true };
  });
};
