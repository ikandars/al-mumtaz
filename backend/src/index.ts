import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { jwt, sign, verify } from 'hono/jwt'
import { streamSSE } from 'hono/streaming'

type Bindings = {
  DB: D1Database
  OBJECT_STORAGE: R2Bucket
}

type Variables = {
  jwtPayload: {
    staff_id: string
    username: string
    permissions: string[]
  }
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Enable CORS
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}))

// Helper for password hashing (SHA-256)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// SSE Listeners for real-time notification
const sseListeners = new Set<(data: string) => void>()

function broadcastNotification(event: string, title: string, message: string) {
  const payload = JSON.stringify({ event, title, message, time: new Date().toISOString() })
  for (const listener of sseListeners) {
    try {
      listener(payload)
    } catch (e) {
      sseListeners.delete(listener)
    }
  }
}

// JWT Secret Key
const JWT_SECRET = 'almumtaz-crm-super-secret-key-9988'



app.use('/api/*', async (c, next) => {
  const path = c.req.path
  if (path === '/api/auth/login' || path === '/api/notifications/stream' || path.startsWith('/api/payments/attachments/')) {
    return await next()
  }

  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Tidak terautentikasi' }, 401)
  }

  const token = authHeader.split(' ')[1]
  try {
    const payload = await verify(token, JWT_SECRET, 'HS256') as any
    c.set('jwtPayload', payload)
    await next()
  } catch (e: any) {
    console.error('JWT Verification Error:', e.message || e);
    return c.json({ error: 'Sesi kedaluwarsa atau token tidak valid' }, 401)
  }
})

// Helper to check staff permission
const checkPermission = (action: 'create' | 'update' | 'delete') => {
  return async (c: any, next: any) => {
    const payload = c.get('jwtPayload')
    if (!payload || !payload.permissions.includes(action)) {
      return c.json({ error: `Anda tidak memiliki izin untuk melakukan tindakan ini (${action})` }, 403)
    }
    await next()
  }
}

// --- AUTH ENDPOINTS ---

app.post('/api/auth/login', async (c) => {
  const { username, password } = await c.req.json()
  if (!username || !password) {
    return c.json({ error: 'Username dan password wajib diisi' }, 400)
  }

  const hashedPassword = await hashPassword(password)

  try {
    const staff = await c.env.DB.prepare(
      `SELECT s.id as staff_id, s.permissions, u.id as user_id, u.name, u.email, u.phone, s.username 
       FROM staffs s 
       JOIN users u ON s.user_id = u.id 
       WHERE s.username = ? AND s.password_hash = ?`
    ).bind(username, hashedPassword).first()

    if (!staff) {
      return c.json({ error: 'Username atau password salah' }, 401)
    }

    const permissions = JSON.parse(staff.permissions as string)
    const token = await sign({
      staff_id: staff.staff_id,
      username: staff.username,
      permissions: permissions
    }, JWT_SECRET, 'HS256')

    return c.json({
      token,
      staff: {
        id: staff.staff_id,
        user_id: staff.user_id,
        name: staff.name,
        username: staff.username,
        permissions: permissions
      }
    })
  } catch (err: any) {
    return c.json({ error: 'Terjadi kesalahan sistem: ' + err.message }, 500)
  }
})

app.get('/api/auth/me', async (c) => {
  const payload = c.get('jwtPayload')
  try {
    const staff = await c.env.DB.prepare(
      `SELECT s.id as staff_id, s.permissions, u.id as user_id, u.name, u.email, u.phone, s.username 
       FROM staffs s 
       JOIN users u ON s.user_id = u.id 
       WHERE s.id = ?`
    ).bind(payload.staff_id).first()

    if (!staff) {
      return c.json({ error: 'Staff tidak ditemukan' }, 404)
    }

    return c.json({
      staff: {
        id: staff.staff_id,
        user_id: staff.user_id,
        name: staff.name,
        username: staff.username,
        permissions: JSON.parse(staff.permissions as string)
      }
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// --- REALTIME NOTIFICATIONS ---

app.get('/api/notifications/stream', (c) => {
  c.header('Content-Type', 'text/event-stream')
  c.header('Cache-Control', 'no-cache')
  c.header('Connection', 'keep-alive')

  return streamSSE(c, async (stream) => {
    const listener = (data: string) => {
      stream.writeSSE({
        data,
        event: 'message'
      })
    }
    sseListeners.add(listener)
    
    // Send initial ping
    stream.writeSSE({ data: JSON.stringify({ event: 'connected' }) })

    // Keep stream alive
    while (true) {
      await stream.sleep(30000)
      try {
        await stream.writeSSE({ data: 'ping' })
      } catch (e) {
        sseListeners.delete(listener)
        break
      }
    }
  })
})

// --- SETTINGS ENDPOINTS ---

app.get('/api/settings', async (c) => {
  try {
    const rows = await c.env.DB.prepare('SELECT key, value FROM settings').all()
    const config: Record<string, any> = {}
    rows.results.forEach((row: any) => {
      try {
        config[row.key] = JSON.parse(row.value)
      } catch (e) {
        config[row.key] = row.value
      }
    })
    return c.json(config)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.put('/api/settings', checkPermission('update'), async (c) => {
  const { key, value } = await c.req.json()
  if (!key || value === undefined) {
    return c.json({ error: 'Key dan Value wajib diisi' }, 400)
  }

  const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value)

  try {
    await c.env.DB.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
    ).bind(key, stringValue, stringValue).run()

    broadcastNotification('settings_updated', 'Pengaturan Diperbarui', `Pengaturan '${key}' telah diperbarui oleh staff.`)
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// --- DASHBOARD ENDPOINTS ---

app.get('/api/dashboard/stats', async (c) => {
  try {
    const db = c.env.DB

    const revenue = await db.prepare(
      `SELECT SUM(amount) as total, SUM(admin_fee) as admin, SUM(net_amount) as net 
       FROM payments WHERE status = 'approved'`
    ).first() as any

    const totalExpenses = await db.prepare(
      `SELECT SUM(amount) as total FROM expenses`
    ).first() as any

    const totalPaidTutorShares = await db.prepare(
      `SELECT SUM(amount) as total FROM tutor_shares WHERE status = 'paid'`
    ).first() as any

    const totalOtherIncomes = await db.prepare(
      `SELECT SUM(amount) as total FROM other_incomes`
    ).first() as any

    const cashBalance = (revenue?.total || 0) + (totalOtherIncomes?.total || 0) - (totalExpenses?.total || 0) - (totalPaidTutorShares?.total || 0)

    const counts = await db.prepare(
      `SELECT 
        (SELECT COUNT(*) FROM classes WHERE status = 'active') as classes,
        (SELECT COUNT(*) FROM participants) as students,
        (SELECT COUNT(*) FROM tutors) as tutors,
        (SELECT COUNT(*) FROM payments WHERE status = 'pending') as pending`
    ).first() as any

    const recentPayments = await db.prepare(
      `SELECT p.id, u.name as participant_name, p.amount, p.type, p.status, p.payment_date,
              c.name as class_name, e.name as exam_name
       FROM payments p
       JOIN participants pt ON p.participant_id = pt.id
       JOIN users u ON pt.user_id = u.id
       LEFT JOIN classes c ON p.class_id = c.id
       LEFT JOIN exam_events e ON p.exam_event_id = e.id
       ORDER BY p.created_at DESC LIMIT 5`
    ).all()

    return c.json({
      revenue: {
        total: revenue?.total || 0,
        admin: cashBalance,
        net: revenue?.net || 0
      },
      counts: {
        classes: counts?.classes || 0,
        students: counts?.students || 0,
        tutors: counts?.tutors || 0,
        pending: counts?.pending || 0
      },
      recent_payments: recentPayments.results
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// --- USERS MANAGEMENT (STAFF, TUTOR, PARTICIPANT) ---

app.get('/api/users', async (c) => {
  try {
    const users = await c.env.DB.prepare(
      `SELECT u.id, u.name, u.email, u.phone, 
              (SELECT COUNT(*) FROM participants p WHERE p.user_id = u.id) as is_participant,
              (SELECT COUNT(*) FROM tutors t WHERE t.user_id = u.id) as is_tutor,
              (SELECT COUNT(*) FROM staffs s WHERE s.user_id = u.id) as is_staff,
              s.id as staff_id, s.username, s.permissions
       FROM users u
       LEFT JOIN staffs s ON s.user_id = u.id
       ORDER BY u.name ASC`
    ).all()

    return c.json(users.results.map((u: any) => ({
      ...u,
      is_participant: u.is_participant > 0,
      is_tutor: u.is_tutor > 0,
      is_staff: u.is_staff > 0,
      permissions: u.permissions ? JSON.parse(u.permissions) : []
    })))
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.post('/api/users', checkPermission('create'), async (c) => {
  const body = await c.req.json()
  const { name, email, phone, is_participant, is_tutor, is_staff, username, password, permissions } = body

  if (!name) {
    return c.json({ error: 'Nama lengkap wajib diisi' }, 400)
  }

  if (is_staff && (!username || !password)) {
    return c.json({ error: 'Username dan password wajib diisi untuk akun staff' }, 400)
  }

  const db = c.env.DB
  const userId = crypto.randomUUID()

  try {
    const batch = [
      db.prepare('INSERT INTO users (id, name, email, phone) VALUES (?, ?, ?, ?)').bind(userId, name, email || null, phone || null)
    ]

    if (is_participant) {
      batch.push(
        db.prepare('INSERT INTO participants (id, user_id) VALUES (?, ?)').bind(crypto.randomUUID(), userId)
      )
    }

    if (is_tutor) {
      batch.push(
        db.prepare('INSERT INTO tutors (id, user_id) VALUES (?, ?)').bind(crypto.randomUUID(), userId)
      )
    }

    if (is_staff) {
      const staffId = crypto.randomUUID()
      const passwordHash = await hashPassword(password)
      const permsString = JSON.stringify(permissions || ['create'])
      batch.push(
        db.prepare('INSERT INTO staffs (id, user_id, username, password_hash, permissions) VALUES (?, ?, ?, ?, ?)').bind(staffId, userId, username, passwordHash, permsString)
      )
    }

    await db.batch(batch)

    broadcastNotification('user_created', 'Pengguna Baru', `Pengguna ${name} berhasil ditambahkan ke sistem.`)
    return c.json({ success: true, userId })
  } catch (err: any) {
    return c.json({ error: 'Gagal membuat pengguna: ' + err.message }, 500)
  }
})

app.put('/api/users/:id', checkPermission('update'), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { name, email, phone, is_participant, is_tutor, is_staff, username, password, permissions } = body

  if (!name) {
    return c.json({ error: 'Nama lengkap wajib diisi' }, 400)
  }

  const db = c.env.DB

  try {
    // 1. Check current roles and existing staff info
    const hasParticipant = await db.prepare('SELECT id FROM participants WHERE user_id = ?').bind(id).first()
    const hasTutor = await db.prepare('SELECT id FROM tutors WHERE user_id = ?').bind(id).first()
    const existingStaff = await db.prepare('SELECT id FROM staffs WHERE user_id = ?').bind(id).first() as any

    if (is_staff && !existingStaff && (!username || !password)) {
      return c.json({ error: 'Username dan password wajib diisi untuk staff baru' }, 400)
    }

    const batch = [
      db.prepare('UPDATE users SET name = ?, email = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(name, email || null, phone || null, id)
    ]

    // 2. Handle Participant role
    if (is_participant && !hasParticipant) {
      batch.push(
        db.prepare('INSERT INTO participants (id, user_id) VALUES (?, ?)').bind(crypto.randomUUID(), id)
      )
    } else if (!is_participant && hasParticipant) {
      batch.push(
        db.prepare('DELETE FROM participants WHERE user_id = ?').bind(id)
      )
    }

    // 3. Handle Tutor role
    if (is_tutor && !hasTutor) {
      batch.push(
        db.prepare('INSERT INTO tutors (id, user_id) VALUES (?, ?)').bind(crypto.randomUUID(), id)
      )
    } else if (!is_tutor && hasTutor) {
      batch.push(
        db.prepare('DELETE FROM tutors WHERE user_id = ?').bind(id)
      )
    }

    // 4. Handle Staff role
    if (is_staff) {
      const permsString = JSON.stringify(permissions || ['create'])
      if (!existingStaff) {
        const passwordHash = await hashPassword(password)
        batch.push(
          db.prepare('INSERT INTO staffs (id, user_id, username, password_hash, permissions) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), id, username, passwordHash, permsString)
        )
      } else {
        if (password) {
          const passwordHash = await hashPassword(password)
          batch.push(
            db.prepare('UPDATE staffs SET username = ?, password_hash = ?, permissions = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').bind(username, passwordHash, permsString, id)
          )
        } else {
          batch.push(
            db.prepare('UPDATE staffs SET username = ?, permissions = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').bind(username, permsString, id)
          )
        }
      }
    } else if (!is_staff && existingStaff) {
      batch.push(
        db.prepare('DELETE FROM staffs WHERE user_id = ?').bind(id)
      )
    }

    await db.batch(batch)
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.delete('/api/users/:id', checkPermission('delete'), async (c) => {
  const id = c.req.param('id')
  try {
    await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// --- PARTICIPANTS LIST (FOR AUTOCOMPLETE/SELECTS) ---

app.get('/api/participants', async (c) => {
  try {
    const list = await c.env.DB.prepare(
      `SELECT p.id, u.name, u.email, u.phone 
       FROM participants p 
       JOIN users u ON p.user_id = u.id 
       ORDER BY u.name ASC`
    ).all()
    return c.json(list.results)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// --- TUTORS LIST ---

app.get('/api/tutors', async (c) => {
  try {
    const list = await c.env.DB.prepare(
      `SELECT t.id, u.name, u.email, u.phone 
       FROM tutors t 
       JOIN users u ON t.user_id = u.id 
       ORDER BY u.name ASC`
    ).all()
    return c.json(list.results)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// --- CLASSES MANAGEMENT ---

app.get('/api/classes', async (c) => {
  try {
    const list = await c.env.DB.prepare(
      `SELECT c.id, c.name, c.description, c.monthly_fee, c.status, c.has_admin_fee,
              (SELECT COUNT(*) FROM class_members cm WHERE cm.class_id = c.id AND cm.status = 'active') as member_count
       FROM classes c
       ORDER BY c.name ASC`
    ).all()

    const results = []
    for (const cls of list.results as any[]) {
      const tutorsList = await c.env.DB.prepare(
        `SELECT t.id, u.name 
         FROM class_tutors ct 
         JOIN tutors t ON ct.tutor_id = t.id 
         JOIN users u ON t.user_id = u.id 
         WHERE ct.class_id = ?`
      ).bind(cls.id).all()
      
      results.push({
        ...cls,
        tutors: tutorsList.results
      })
    }

    return c.json(results)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.post('/api/classes', checkPermission('create'), async (c) => {
  const { name, description, monthly_fee, status, tutor_ids, has_admin_fee } = await c.req.json()
  if (!name || monthly_fee === undefined) {
    return c.json({ error: 'Nama kelas dan biaya bulanan wajib diisi' }, 400)
  }

  const id = crypto.randomUUID()
  const db = c.env.DB

  try {
    const batch = [
      db.prepare('INSERT INTO classes (id, name, description, monthly_fee, status, has_admin_fee) VALUES (?, ?, ?, ?, ?, ?)').bind(
        id, 
        name, 
        description || null, 
        monthly_fee, 
        status || 'active',
        has_admin_fee !== undefined ? (has_admin_fee ? 1 : 0) : 1
      )
    ]

    if (tutor_ids && Array.isArray(tutor_ids)) {
      for (const tutorId of tutor_ids) {
        batch.push(
          db.prepare('INSERT INTO class_tutors (id, class_id, tutor_id) VALUES (?, ?, ?)').bind(crypto.randomUUID(), id, tutorId)
        )
      }
    }

    await db.batch(batch)
    return c.json({ success: true, id })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.put('/api/classes/:id', checkPermission('update'), async (c) => {
  const id = c.req.param('id')
  const { name, description, monthly_fee, status, tutor_ids, has_admin_fee } = await c.req.json()
  
  if (!name || monthly_fee === undefined) {
    return c.json({ error: 'Nama kelas dan biaya bulanan wajib diisi' }, 400)
  }

  const db = c.env.DB

  try {
    const batch = [
      db.prepare('UPDATE classes SET name = ?, description = ?, monthly_fee = ?, status = ?, has_admin_fee = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(
        name, 
        description || null, 
        monthly_fee, 
        status || 'active', 
        has_admin_fee !== undefined ? (has_admin_fee ? 1 : 0) : 1,
        id
      ),
      db.prepare('DELETE FROM class_tutors WHERE class_id = ?').bind(id)
    ]

    if (tutor_ids && Array.isArray(tutor_ids)) {
      for (const tutorId of tutor_ids) {
        batch.push(
          db.prepare('INSERT INTO class_tutors (id, class_id, tutor_id) VALUES (?, ?, ?)').bind(crypto.randomUUID(), id, tutorId)
        )
      }
    }

    await db.batch(batch)
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.delete('/api/classes/:id', checkPermission('delete'), async (c) => {
  const id = c.req.param('id')
  try {
    await c.env.DB.prepare('DELETE FROM classes WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// --- CLASS MEMBERS ENDPOINTS ---

app.get('/api/classes/:id/members', async (c) => {
  const classId = c.req.param('id')
  try {
    const list = await c.env.DB.prepare(
      `SELECT cm.id as member_id, cm.status, p.id as participant_id, u.name, u.email, u.phone
       FROM class_members cm
       JOIN participants p ON cm.participant_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE cm.class_id = ?`
    ).bind(classId).all()
    return c.json(list.results)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.post('/api/classes/:id/members', checkPermission('create'), async (c) => {
  const classId = c.req.param('id')
  const { participant_id } = await c.req.json()

  if (!participant_id) {
    return c.json({ error: 'Siswa wajib dipilih' }, 400)
  }

  try {
    const existing = await c.env.DB.prepare(
      'SELECT id FROM class_members WHERE class_id = ? AND participant_id = ?'
    ).bind(classId, participant_id).first()

    if (existing) {
      // Reactivate if inactive
      await c.env.DB.prepare(
        'UPDATE class_members SET status = "active" WHERE class_id = ? AND participant_id = ?'
      ).bind(classId, participant_id).run()
      return c.json({ success: true })
    }

    const id = crypto.randomUUID()
    await c.env.DB.prepare(
      'INSERT INTO class_members (id, class_id, participant_id, status) VALUES (?, ?, ?, "active")'
    ).bind(id, classId, participant_id).run()

    return c.json({ success: true, id })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.put('/api/classes/:id/members/:participantId', checkPermission('update'), async (c) => {
  const classId = c.req.param('id')
  const participantId = c.req.param('participantId')
  const { status } = await c.req.json()

  if (!status) {
    return c.json({ error: 'Status wajib diisi' }, 400)
  }

  try {
    await c.env.DB.prepare(
      'UPDATE class_members SET status = ? WHERE class_id = ? AND participant_id = ?'
    ).bind(status, classId, participantId).run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.delete('/api/classes/:id/members/:participantId', checkPermission('delete'), async (c) => {
  const classId = c.req.param('id')
  const participantId = c.req.param('participantId')
  try {
    await c.env.DB.prepare(
      'DELETE FROM class_members WHERE class_id = ? AND participant_id = ?'
    ).bind(classId, participantId).run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// --- EXAM EVENTS MANAGEMENT ---

app.get('/api/exam-events', async (c) => {
  try {
    const list = await c.env.DB.prepare(
      `SELECT e.id, e.name, e.fee, e.start_date, e.end_date, e.class_id, c.name as class_name
       FROM exam_events e
       LEFT JOIN classes c ON e.class_id = c.id
       ORDER BY e.start_date DESC`
    ).all()
    return c.json(list.results)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.post('/api/exam-events', checkPermission('create'), async (c) => {
  const { name, fee, start_date, end_date, class_id } = await c.req.json()
  if (!name || fee === undefined || !start_date || !end_date) {
    return c.json({ error: 'Nama ujian, biaya, tanggal mulai & selesai wajib diisi' }, 400)
  }

  const id = crypto.randomUUID()
  try {
    await c.env.DB.prepare(
      'INSERT INTO exam_events (id, name, fee, start_date, end_date, class_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, name, fee, start_date, end_date, class_id || null).run()

    broadcastNotification('exam_created', 'Event Ujian Baru', `Ujian '${name}' telah dijadwalkan pada ${start_date} hingga ${end_date}.`)
    return c.json({ success: true, id })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.put('/api/exam-events/:id', checkPermission('update'), async (c) => {
  const id = c.req.param('id')
  const { name, fee, start_date, end_date, class_id } = await c.req.json()

  if (!name || fee === undefined || !start_date || !end_date) {
    return c.json({ error: 'Nama ujian, biaya, tanggal mulai & selesai wajib diisi' }, 400)
  }

  try {
    await c.env.DB.prepare(
      'UPDATE exam_events SET name = ?, fee = ?, start_date = ?, end_date = ?, class_id = ? WHERE id = ?'
    ).bind(name, fee, start_date, end_date, class_id || null, id).run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.delete('/api/exam-events/:id', checkPermission('delete'), async (c) => {
  const id = c.req.param('id')
  try {
    await c.env.DB.prepare('DELETE FROM exam_events WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// --- PAYMENTS MANAGEMENT ---

// Helper to calculate admin fee based on tiers in DB
async function calculateAdminFee(db: D1Database, amount: number): Promise<number> {
  const settingRow = await db.prepare('SELECT value FROM settings WHERE key = ?').bind('admin_fee_config').first() as any
  if (!settingRow) return 0
  
  const config = JSON.parse(settingRow.value)
  if (!config.enabled || !config.tiers || config.tiers.length === 0) {
    return 0
  }

  // Sort tiers descending by min_amount
  const sortedTiers = [...config.tiers].sort((a: any, b: any) => b.min_amount - a.min_amount)
  
  for (const tier of sortedTiers) {
    if (amount >= tier.min_amount) {
      return tier.fee
    }
  }

  return 0
}

// Retrieve payment attachments from R2 (Wildcard path parameter matching)
app.get('/api/payments/attachments/*', async (c) => {
  const key = c.req.path.substring(26)
  try {
    const object = await c.env.OBJECT_STORAGE.get(key)
    if (!object) {
      return c.text('Berkas bukti transfer tidak ditemukan', 404)
    }

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)

    return new Response(object.body, { headers })
  } catch (err: any) {
    return c.text('Gagal memuat berkas: ' + err.message, 500)
  }
})

app.get('/api/payments', async (c) => {
  try {
    const list = await c.env.DB.prepare(
      `SELECT p.id, p.participant_id, p.class_id, p.exam_event_id, p.type, p.amount,
              p.admin_fee, p.net_amount, p.attachment_r2_key, p.payment_date, p.status,
              p.approved_by_staff_id, p.receiver_staff_id, p.notes, p.created_at,
              u.name as participant_name, c.name as class_name, e.name as exam_name,
              su.name as approved_by_name, ru.name as receiver_name
       FROM payments p
       JOIN participants pt ON p.participant_id = pt.id
       JOIN users u ON pt.user_id = u.id
       LEFT JOIN classes c ON p.class_id = c.id
       LEFT JOIN exam_events e ON p.exam_event_id = e.id
       LEFT JOIN staffs s ON p.approved_by_staff_id = s.id
       LEFT JOIN users su ON s.user_id = su.id
       LEFT JOIN staffs rs ON p.receiver_staff_id = rs.id
       LEFT JOIN users ru ON rs.user_id = ru.id
       ORDER BY p.created_at DESC`
    ).all()

    const results = []
    for (const payment of list.results as any[]) {
      // If approved, fetch tutor shares breakdown
      let shares = []
      if (payment.status === 'approved') {
        const sharesQuery = await c.env.DB.prepare(
          `SELECT ts.id, ts.tutor_id, ts.amount, u.name as tutor_name
           FROM tutor_shares ts
           JOIN tutors t ON ts.tutor_id = t.id
           JOIN users u ON t.user_id = u.id
           WHERE ts.payment_id = ?`
        ).bind(payment.id).all()
        shares = sharesQuery.results
      }

      results.push({
        ...payment,
        tutor_shares: shares
      })
    }

    return c.json(results)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.post('/api/payments', checkPermission('create'), async (c) => {
  const formData = await c.req.formData()
  const participantId = formData.get('participant_id') as string
  const type = formData.get('type') as 'course' | 'exam'
  const classId = formData.get('class_id') as string | null
  const examEventId = formData.get('exam_event_id') as string | null
  const amountStr = formData.get('amount') as string
  const paymentDate = formData.get('payment_date') as string
  const receiverStaffId = formData.get('receiver_staff_id') as string | null
  const notes = formData.get('notes') as string | null
  const attachment = formData.get('attachment') as File | null

  if (!participantId || !type || !amountStr || !paymentDate) {
    return c.json({ error: 'Siswa, Tipe, Nominal, dan Tanggal Pembayaran wajib diisi' }, 400)
  }

  const amount = parseInt(amountStr, 10)
  if (isNaN(amount) || amount <= 0) {
    return c.json({ error: 'Nominal pembayaran tidak valid' }, 400)
  }

  const db = c.env.DB
  
  // Calculate fees
  let adminFee = 0
  const hasAdminFeeParam = formData.get('has_admin_fee')

  let shouldApplyAdminFee = true
  if (hasAdminFeeParam !== null) {
    shouldApplyAdminFee = hasAdminFeeParam === '1'
  } else {
    // Fallback: check class settings
    if (type === 'course' && classId) {
      const cls = await db.prepare('SELECT has_admin_fee FROM classes WHERE id = ?').bind(classId).first() as any
      shouldApplyAdminFee = !cls || cls.has_admin_fee !== 0
    }
  }

  if (shouldApplyAdminFee) {
    adminFee = await calculateAdminFee(db, amount)
  }
  const netAmount = Math.max(0, amount - adminFee)

  // Upload file if present
  let attachmentR2Key: string | null = null
  if (attachment && attachment.size > 0) {
    attachmentR2Key = `payments/${crypto.randomUUID()}-${attachment.name}`
    try {
      await c.env.OBJECT_STORAGE.put(attachmentR2Key, attachment.stream(), {
        httpMetadata: {
          contentType: attachment.type,
        }
      })
    } catch (e: any) {
      return c.json({ error: 'Gagal mengunggah bukti transfer: ' + e.message }, 500)
    }
  }

  const paymentId = crypto.randomUUID()

  try {
    await db.prepare(
      `INSERT INTO payments (id, participant_id, class_id, exam_event_id, type, amount, admin_fee, net_amount, attachment_r2_key, payment_date, receiver_staff_id, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    ).bind(
      paymentId,
      participantId,
      classId || null,
      examEventId || null,
      type,
      amount,
      adminFee,
      netAmount,
      attachmentR2Key,
      paymentDate,
      receiverStaffId || null,
      notes || null
    ).run()

    // Fetch participant name for notification
    const student = await db.prepare(
      'SELECT u.name FROM participants p JOIN users u ON p.user_id = u.id WHERE p.id = ?'
    ).bind(participantId).first() as any
    
    const label = type === 'course' ? 'Kelas' : 'Ujian'
    broadcastNotification(
      'payment_created', 
      'Input Pembayaran Baru', 
      `Pembayaran Rp ${amount.toLocaleString('id-ID')} dari ${student?.name || 'Siswa'} untuk ${label} berhasil diinput.`
    )

    return c.json({ success: true, paymentId })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.put('/api/payments/:id/status', checkPermission('update'), async (c) => {
  const id = c.req.param('id')
  const { status, notes } = await c.req.json()
  const payload = c.get('jwtPayload')

  if (!status || !['approved', 'rejected', 'pending'].includes(status)) {
    return c.json({ error: 'Status tidak valid' }, 400)
  }

  const db = c.env.DB

  try {
    // Retrieve payment info
    const payment = await db.prepare(
      'SELECT type, amount, admin_fee, net_amount, class_id, status FROM payments WHERE id = ?'
    ).bind(id).first() as any

    if (!payment) {
      return c.json({ error: 'Data pembayaran tidak ditemukan' }, 404)
    }

    if (payment.status === status) {
      return c.json({ success: true, message: 'Status tidak berubah' })
    }

    const batch = [
      db.prepare(
        `UPDATE payments 
         SET status = ?, notes = ?, approved_by_staff_id = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`
      ).bind(status, notes || null, payload.staff_id, id),
      db.prepare('DELETE FROM tutor_shares WHERE payment_id = ?').bind(id)
    ]

    // If approved and course type, distribute shares to tutors
    if (status === 'approved' && payment.type === 'course' && payment.class_id) {
      // Find active tutors of this class
      const tutors = await db.prepare(
        `SELECT tutor_id FROM class_tutors WHERE class_id = ?`
      ).bind(payment.class_id).all()

      const activeTutors = tutors.results

      if (activeTutors.length > 0) {
        // Divide net amount equally
        const tutorShare = Math.floor(payment.net_amount / activeTutors.length)
        
        for (const t of activeTutors as any[]) {
          batch.push(
            db.prepare(
              `INSERT INTO tutor_shares (id, payment_id, tutor_id, amount)
               VALUES (?, ?, ?, ?)`
            ).bind(crypto.randomUUID(), id, t.tutor_id, tutorShare)
          )
        }
      }
    }

    await db.batch(batch)

    const labelStatus = status === 'approved' ? 'DISETUJUI' : status === 'rejected' ? 'DITOLAK' : 'PENDING'
    broadcastNotification(
      'payment_status_changed',
      `Pembayaran ${labelStatus}`,
      `Transaksi pembayaran senilai Rp ${payment.amount.toLocaleString('id-ID')} telah ${status === 'approved' ? 'disetujui' : 'ditolak'} oleh staff.`
    )

    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.delete('/api/payments/:id', checkPermission('delete'), async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  try {
    const payment = await db.prepare('SELECT attachment_r2_key FROM payments WHERE id = ?').bind(id).first() as any
    
    await db.batch([
      db.prepare('DELETE FROM payments WHERE id = ?').bind(id),
      db.prepare('DELETE FROM tutor_shares WHERE payment_id = ?').bind(id)
    ])

    // Delete attachment from R2 if exists
    if (payment?.attachment_r2_key) {
      await c.env.OBJECT_STORAGE.delete(payment.attachment_r2_key)
    }

    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// --- TUTOR REPORTS / PAYOUTS ---

app.get('/api/reports/tutor-payouts', async (c) => {
  try {
    const list = await c.env.DB.prepare(
      `SELECT t.id as tutor_id, u.name as tutor_name, 
              COALESCE(SUM(ts.amount), 0) as total_payout,
              COUNT(ts.id) as payment_count
       FROM tutors t
       JOIN users u ON t.user_id = u.id
       LEFT JOIN tutor_shares ts ON ts.tutor_id = t.id
       GROUP BY t.id
       ORDER BY total_payout DESC`
    ).all()
    return c.json(list.results)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// --- NEW ENDPOINTS TAHAP 2 ---

// 1. Participant Details: GET /api/participants/:id/details
app.get('/api/participants/:id/details', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  try {
    const profile = await db.prepare(
      `SELECT p.id as participant_id, u.name, u.email, u.phone, p.created_at
       FROM participants p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = ?`
    ).bind(id).first()

    if (!profile) {
      return c.json({ error: 'Peserta tidak ditemukan' }, 404)
    }

    // Get classes
    const classes = await db.prepare(
      `SELECT c.id as class_id, c.name as class_name, cm.status as enrollment_status, cm.created_at as joined_at
       FROM class_members cm
       JOIN classes c ON cm.class_id = c.id
       WHERE cm.participant_id = ?`
    ).bind(id).all()

    // Get payments
    const payments = await db.prepare(
      `SELECT p.id, p.amount, p.type, p.payment_date, p.status, p.created_at,
              c.name as class_name, ee.name as exam_name,
              ru.name as receiver_name
       FROM payments p
       LEFT JOIN classes c ON p.class_id = c.id
       LEFT JOIN exam_events ee ON p.exam_event_id = ee.id
       LEFT JOIN staffs rs ON p.receiver_staff_id = rs.id
       LEFT JOIN users ru ON rs.user_id = ru.id
       WHERE p.participant_id = ?
       ORDER BY p.payment_date DESC, p.created_at DESC`
    ).bind(id).all()

    return c.json({
      profile,
      classes: classes.results,
      payments: payments.results
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// 2. Class Payments Report: GET /api/reports/class-payments
app.get('/api/reports/class-payments', async (c) => {
  const classId = c.req.query('class_id')
  const month = c.req.query('month') // e.g. "2026-06"
  const db = c.env.DB

  if (!classId || !month) {
    return c.json({ error: 'Parameter class_id dan month (YYYY-MM) wajib diisi' }, 400)
  }

  try {
    // Get all active members of the class
    const members = await db.prepare(
      `SELECT p.id as participant_id, u.name, u.email, u.phone 
       FROM class_members cm
       JOIN participants p ON cm.participant_id = p.id
       JOIN users u ON p.user_id = u.id
       WHERE cm.class_id = ? AND cm.status = 'active'
       ORDER BY u.name ASC`
    ).bind(classId).all()

    // Get all approved payments for this class in this month
    const payments = await db.prepare(
      `SELECT id as payment_id, participant_id, amount, payment_date, status
       FROM payments
       WHERE class_id = ? AND type = 'course' AND status = 'approved' AND strftime('%Y-%m', payment_date) = ?`
    ).bind(classId, month).all()

    // Map payments to student ID for quick lookup
    const paymentMap = new Map()
    for (const p of payments.results as any[]) {
      paymentMap.set(p.participant_id, p)
    }

    const report = (members.results as any[]).map(m => {
      const pm = paymentMap.get(m.participant_id)
      return {
        ...m,
        has_paid: !!pm,
        payment_id: pm ? pm.payment_id : null,
        amount: pm ? pm.amount : null,
        payment_date: pm ? pm.payment_date : null
      }
    })

    return c.json(report)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// 3. Tutor Shares List: GET /api/reports/tutor-shares
app.get('/api/reports/tutor-shares', async (c) => {
  const tutorId = c.req.query('tutor_id')
  const status = c.req.query('status') // 'paid' or 'unpaid'
  const month = c.req.query('month') // 'YYYY-MM'
  const db = c.env.DB

  try {
    let query = `
      SELECT ts.id, ts.amount, ts.status as share_status, ts.created_at,
             u_tutor.name as tutor_name, ts.tutor_id,
             p.amount as payment_amount, p.payment_date, p.id as payment_id,
             c.name as class_name,
             u_student.name as student_name
      FROM tutor_shares ts
      JOIN tutors t ON ts.tutor_id = t.id
      JOIN users u_tutor ON t.user_id = u_tutor.id
      JOIN payments p ON ts.payment_id = p.id
      JOIN classes c ON p.class_id = c.id
      JOIN participants part ON p.participant_id = part.id
      JOIN users u_student ON part.user_id = u_student.id
      WHERE 1=1
    `
    const params: any[] = []

    if (tutorId) {
      query += ` AND ts.tutor_id = ?`
      params.push(tutorId)
    }
    if (status) {
      query += ` AND ts.status = ?`
      params.push(status)
    }
    if (month) {
      query += ` AND strftime('%Y-%m', p.payment_date) = ?`
      params.push(month)
    }

    query += ` ORDER BY p.payment_date DESC, ts.created_at DESC`

    const list = await db.prepare(query).bind(...params).all()
    return c.json(list.results)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// 4. Update Tutor Share Status: PUT /api/tutor-shares/:id/status
app.put('/api/tutor-shares/:id/status', checkPermission('update'), async (c) => {
  const id = c.req.param('id')
  const { status } = await c.req.json()
  const db = c.env.DB

  if (!status || !['paid', 'unpaid'].includes(status)) {
    return c.json({ error: 'Status tidak valid' }, 400)
  }

  try {
    await db.prepare('UPDATE tutor_shares SET status = ? WHERE id = ?').bind(status, id).run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// 5. Tutor Monthly Shares Summary: GET /api/reports/tutor-shares-summary
app.get('/api/reports/tutor-shares-summary', async (c) => {
  const db = c.env.DB
  try {
    const list = await db.prepare(
      `SELECT t.id as tutor_id, u.name as tutor_name,
              strftime('%Y-%m', p.payment_date) as month,
              SUM(CASE WHEN ts.status = 'paid' THEN ts.amount ELSE 0 END) as total_paid,
              SUM(CASE WHEN ts.status = 'unpaid' THEN ts.amount ELSE 0 END) as total_unpaid,
              SUM(ts.amount) as total_amount
       FROM tutor_shares ts
       JOIN tutors t ON ts.tutor_id = t.id
       JOIN users u ON t.user_id = u.id
       JOIN payments p ON ts.payment_id = p.id
       GROUP BY t.id, strftime('%Y-%m', p.payment_date)
       ORDER BY month DESC, tutor_name ASC`
    ).all()
    return c.json(list.results)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// --- EXPENSES (PENGELUARAN) & CASHFLOW ENDPOINTS ---

app.get('/api/expenses', async (c) => {
  try {
    const db = c.env.DB
    const { results } = await db.prepare(
      `SELECT e.*, su.name as created_by_name
       FROM expenses e
       LEFT JOIN staffs s ON e.created_by_staff_id = s.id
       LEFT JOIN users su ON s.user_id = su.id
       ORDER BY e.expense_date DESC, e.created_at DESC`
    ).all()
    return c.json(results)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.post('/api/expenses', checkPermission('create'), async (c) => {
  try {
    const db = c.env.DB
    const payload = c.get('jwtPayload') as any
    const formData = await c.req.formData()
    const amountStr = formData.get('amount') as string
    const description = formData.get('description') as string
    const expenseDate = formData.get('expense_date') as string
    const attachment = formData.get('attachment') as File | null

    if (!amountStr || !description || !expenseDate) {
      return c.json({ error: 'Data tidak lengkap' }, 400)
    }

    const amount = parseInt(amountStr, 10)
    if (isNaN(amount) || amount <= 0) {
      return c.json({ error: 'Nominal tidak valid' }, 400)
    }

    // Upload attachment to R2 if present
    let attachmentR2Key: string | null = null
    if (attachment && attachment.size > 0) {
      attachmentR2Key = `expenses/${crypto.randomUUID()}-${attachment.name}`
      try {
        await c.env.OBJECT_STORAGE.put(attachmentR2Key, attachment.stream(), {
          httpMetadata: {
            contentType: attachment.type,
          }
        })
      } catch (e: any) {
        return c.json({ error: 'Gagal mengunggah bukti pengeluaran: ' + e.message }, 500)
      }
    }

    const id = 'expense-' + crypto.randomUUID()
    await db.prepare(
      `INSERT INTO expenses (id, amount, description, expense_date, created_by_staff_id, attachment_r2_key)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, amount, description, expenseDate, payload.staff_id, attachmentR2Key).run()

    broadcastNotification('expense_added', 'Pengeluaran Baru', `Pengeluaran dicatat: ${description} sebesar Rp ${amount.toLocaleString('id-ID')}`)

    return c.json({ success: true, id })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.delete('/api/expenses/:id', checkPermission('delete'), async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')
    
    // Clean up attachment from R2 if exists
    const expense = await db.prepare('SELECT attachment_r2_key FROM expenses WHERE id = ?').bind(id).first() as any
    if (expense && expense.attachment_r2_key) {
      try {
        await c.env.OBJECT_STORAGE.delete(expense.attachment_r2_key)
      } catch (e) {
        console.error('Gagal menghapus lampiran R2 pengeluaran:', e)
      }
    }

    await db.prepare('DELETE FROM expenses WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.get('/api/other-incomes', async (c) => {
  try {
    const db = c.env.DB
    const { results } = await db.prepare(
      `SELECT oi.*, su.name as created_by_name
       FROM other_incomes oi
       LEFT JOIN staffs s ON oi.created_by_staff_id = s.id
       LEFT JOIN users su ON s.user_id = su.id
       ORDER BY oi.income_date DESC, oi.created_at DESC`
    ).all()
    return c.json(results)
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.post('/api/other-incomes', checkPermission('create'), async (c) => {
  try {
    const db = c.env.DB
    const payload = c.get('jwtPayload') as any
    const formData = await c.req.formData()
    const amountStr = formData.get('amount') as string
    const description = formData.get('description') as string
    const incomeDate = formData.get('income_date') as string
    const category = formData.get('category') as string
    const attachment = formData.get('attachment') as File | null

    if (!amountStr || !description || !incomeDate || !category) {
      return c.json({ error: 'Data tidak lengkap' }, 400)
    }

    const amount = parseInt(amountStr, 10)
    if (isNaN(amount) || amount <= 0) {
      return c.json({ error: 'Nominal tidak valid' }, 400)
    }

    // Upload attachment to R2 if present
    let attachmentR2Key: string | null = null
    if (attachment && attachment.size > 0) {
      attachmentR2Key = `other-incomes/${crypto.randomUUID()}-${attachment.name}`
      try {
        await c.env.OBJECT_STORAGE.put(attachmentR2Key, attachment.stream(), {
          httpMetadata: {
            contentType: attachment.type,
          }
        })
      } catch (e: any) {
        return c.json({ error: 'Gagal mengunggah bukti pemasukan: ' + e.message }, 500)
      }
    }

    const id = 'other-income-' + crypto.randomUUID()
    await db.prepare(
      `INSERT INTO other_incomes (id, amount, description, income_date, category, created_by_staff_id, attachment_r2_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, amount, description, incomeDate, category, payload.staff_id, attachmentR2Key).run()

    broadcastNotification('other_income_added', 'Pemasukan Lain Baru', `Pemasukan lain dicatat: [${category}] ${description} sebesar Rp ${amount.toLocaleString('id-ID')}`)

    return c.json({ success: true, id })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.delete('/api/other-incomes/:id', checkPermission('delete'), async (c) => {
  try {
    const db = c.env.DB
    const id = c.req.param('id')
    
    // Clean up attachment from R2 if exists
    const income = await db.prepare('SELECT attachment_r2_key FROM other_incomes WHERE id = ?').bind(id).first() as any
    if (income && income.attachment_r2_key) {
      try {
        await c.env.OBJECT_STORAGE.delete(income.attachment_r2_key)
      } catch (e) {
        console.error('Gagal menghapus lampiran R2 pemasukan:', e)
      }
    }

    await db.prepare('DELETE FROM other_incomes WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

app.get('/api/reports/cashflow', async (c) => {
  try {
    const db = c.env.DB
    const month = c.req.query('month')
    if (!month) {
      return c.json({ error: 'Bulan tidak boleh kosong' }, 400)
    }

    const startOfSelectedMonth = `${month}-01`
    
    const startingPaymentsInflowRow = await db.prepare(
      `SELECT SUM(amount) as total FROM payments 
       WHERE status = 'approved' AND payment_date < ?`
    ).bind(startOfSelectedMonth).first() as any

    const startingOtherInflowRow = await db.prepare(
      `SELECT SUM(amount) as total FROM other_incomes 
       WHERE income_date < ?`
    ).bind(startOfSelectedMonth).first() as any

    const startingExpensesRow = await db.prepare(
      `SELECT SUM(amount) as total FROM expenses 
       WHERE expense_date < ?`
    ).bind(startOfSelectedMonth).first() as any

    const startingMukafaahRow = await db.prepare(
      `SELECT SUM(ts.amount) as total FROM tutor_shares ts
       JOIN payments p ON ts.payment_id = p.id
       WHERE ts.status = 'paid' AND p.payment_date < ?`
    ).bind(startOfSelectedMonth).first() as any

    const startingInflow = (startingPaymentsInflowRow?.total || 0) + (startingOtherInflowRow?.total || 0)
    const startingOutflow = (startingExpensesRow?.total || 0) + (startingMukafaahRow?.total || 0)
    const startingBalance = startingInflow - startingOutflow

    const { results: inflows } = await db.prepare(
      `SELECT p.id, p.payment_date, p.amount, u.name as participant_name, c.name as class_name, e.name as exam_name, p.type
       FROM payments p
       JOIN participants pt ON p.participant_id = pt.id
       JOIN users u ON pt.user_id = u.id
       LEFT JOIN classes c ON p.class_id = c.id
       LEFT JOIN exam_events e ON p.exam_event_id = e.id
       WHERE p.status = 'approved' AND p.payment_date LIKE ?
       ORDER BY p.payment_date ASC, p.created_at ASC`
    ).bind(`${month}%`).all()

    const { results: otherInflows } = await db.prepare(
      `SELECT oi.id, oi.income_date as payment_date, oi.amount, oi.category as participant_name, oi.description as class_name, 'other' as type, oi.attachment_r2_key
       FROM other_incomes oi
       WHERE oi.income_date LIKE ?
       ORDER BY oi.income_date ASC, oi.created_at ASC`
    ).bind(`${month}%`).all()

    const { results: outflows } = await db.prepare(
      `SELECT e.id, e.expense_date, e.amount, e.description, su.name as created_by_name, e.attachment_r2_key
       FROM expenses e
       LEFT JOIN staffs s ON e.created_by_staff_id = s.id
       LEFT JOIN users su ON s.user_id = su.id
       WHERE e.expense_date LIKE ?
       ORDER BY e.expense_date ASC, e.created_at ASC`
    ).bind(`${month}%`).all()

    const { results: mukafaahOutflows } = await db.prepare(
      `SELECT ts.id, p.payment_date as expense_date, ts.amount, 
              ('Mukafaah: ' || c.name || ' - ' || tu_user.name) as description,
              'Sistem' as created_by_name,
              tu_user.name as tutor_name,
              c.name as class_name
       FROM tutor_shares ts
       JOIN payments p ON ts.payment_id = p.id
       JOIN classes c ON p.class_id = c.id
       JOIN tutors t ON ts.tutor_id = t.id
       JOIN users tu_user ON t.user_id = tu_user.id
       WHERE ts.status = 'paid' AND p.payment_date LIKE ?
       ORDER BY p.payment_date ASC`
    ).bind(`${month}%`).all()

    const totalPaymentsInflow = inflows.reduce((sum: number, item: any) => sum + (item.amount || 0), 0)
    const totalOtherInflow = otherInflows.reduce((sum: number, item: any) => sum + (item.amount || 0), 0)
    const totalInflow = totalPaymentsInflow + totalOtherInflow
    const totalExpenses = outflows.reduce((sum: number, item: any) => sum + (item.amount || 0), 0)
    const totalMukafaah = mukafaahOutflows.reduce((sum: number, item: any) => sum + (item.amount || 0), 0)
    const totalOutflow = totalExpenses + totalMukafaah
    const endingBalance = startingBalance + totalInflow - totalOutflow

    return c.json({
      starting_balance: startingBalance,
      inflows,
      other_inflows: otherInflows,
      outflows,
      mukafaah_outflows: mukafaahOutflows,
      total_payments_inflow: totalPaymentsInflow,
      total_other_inflow: totalOtherInflow,
      total_inflow: totalInflow,
      total_outflow: totalOutflow,
      ending_balance: endingBalance
    })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

export default app
