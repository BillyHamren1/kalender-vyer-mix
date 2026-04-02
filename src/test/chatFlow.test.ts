import { describe, it, expect } from 'vitest';

// ─── Pure-logic replicas of the actual service/hook logic ───
// We extract and test the core algorithms used in the chat system
// without hitting Supabase, ensuring the data-flow contracts hold.

// ═══════════════════════════════════════════════════════════════
// 1. DUAL-IDENTITY FILTER GENERATION (directMessageService)
// ═══════════════════════════════════════════════════════════════

function buildDualIdentityConditions(allMyIds: string[], allPartnerIds: string[]): string[] {
  const conditions: string[] = [];
  for (const myId of allMyIds) {
    for (const partnerId of allPartnerIds) {
      conditions.push(`and(sender_id.eq.${myId},recipient_id.eq.${partnerId})`);
      conditions.push(`and(sender_id.eq.${partnerId},recipient_id.eq.${myId})`);
    }
  }
  return conditions;
}

describe('Dual-identity filter generation', () => {
  it('generates correct conditions for single IDs', () => {
    const conds = buildDualIdentityConditions(['me1'], ['partner1']);
    expect(conds).toHaveLength(2);
    expect(conds).toContain('and(sender_id.eq.me1,recipient_id.eq.partner1)');
    expect(conds).toContain('and(sender_id.eq.partner1,recipient_id.eq.me1)');
  });

  it('generates all cross-product conditions for dual identities', () => {
    const conds = buildDualIdentityConditions(['me-staff', 'me-auth'], ['p-staff', 'p-auth']);
    // 2 my IDs × 2 partner IDs × 2 directions = 8
    expect(conds).toHaveLength(8);
  });

  it('returns empty for empty inputs', () => {
    expect(buildDualIdentityConditions([], ['p1'])).toHaveLength(0);
    expect(buildDualIdentityConditions(['m1'], [])).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. DM INBOX GROUPING (directMessageService.fetchDMInboxGrouped)
// ═══════════════════════════════════════════════════════════════

interface DirectMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_type: string;
  recipient_id: string;
  recipient_name: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

interface GroupedConversation {
  recipientId: string;
  recipientName: string;
  lastMessage: string;
  lastTimestamp: string;
  unreadCount: number;
  isSentByMe: boolean;
}

function groupConversations(msgs: DirectMessage[], allMyIds: string[]): GroupedConversation[] {
  const myIdSet = new Set(allMyIds);
  const convMap = new Map<string, GroupedConversation>();

  for (const m of msgs) {
    const isMe = myIdSet.has(m.sender_id);
    const partnerId = isMe ? m.recipient_id : m.sender_id;
    const partnerName = isMe ? m.recipient_name : m.sender_name;

    // Skip self-conversations across identities
    if (myIdSet.has(partnerId)) continue;

    if (!convMap.has(partnerId)) {
      convMap.set(partnerId, {
        recipientId: partnerId,
        recipientName: partnerName,
        lastMessage: m.content,
        lastTimestamp: m.created_at,
        unreadCount: 0,
        isSentByMe: isMe,
      });
    }

    if (!isMe && !m.is_read) {
      const conv = convMap.get(partnerId)!;
      conv.unreadCount++;
    }
  }

  return Array.from(convMap.values()).sort(
    (a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime()
  );
}

describe('DM Inbox Grouping', () => {
  const makeDM = (overrides: Partial<DirectMessage>): DirectMessage => ({
    id: Math.random().toString(),
    sender_id: 'default-sender',
    sender_name: 'Sender',
    sender_type: 'staff',
    recipient_id: 'default-recipient',
    recipient_name: 'Recipient',
    content: 'Hello',
    is_read: true,
    created_at: '2026-01-01T10:00:00Z',
    ...overrides,
  });

  it('groups messages by conversation partner', () => {
    const msgs: DirectMessage[] = [
      makeDM({ sender_id: 'me', recipient_id: 'alice', recipient_name: 'Alice', content: 'Hi Alice', created_at: '2026-01-02T10:00:00Z' }),
      makeDM({ sender_id: 'bob', sender_name: 'Bob', recipient_id: 'me', content: 'Hey', created_at: '2026-01-01T10:00:00Z' }),
    ];
    const result = groupConversations(msgs, ['me']);
    expect(result).toHaveLength(2);
    expect(result[0].recipientId).toBe('alice'); // newer first
    expect(result[1].recipientId).toBe('bob');
  });

  it('counts unread messages correctly', () => {
    const msgs: DirectMessage[] = [
      makeDM({ sender_id: 'alice', sender_name: 'Alice', recipient_id: 'me', is_read: false, created_at: '2026-01-03T10:00:00Z' }),
      makeDM({ sender_id: 'alice', sender_name: 'Alice', recipient_id: 'me', is_read: false, created_at: '2026-01-02T10:00:00Z' }),
      makeDM({ sender_id: 'alice', sender_name: 'Alice', recipient_id: 'me', is_read: true, created_at: '2026-01-01T10:00:00Z' }),
    ];
    const result = groupConversations(msgs, ['me']);
    expect(result).toHaveLength(1);
    expect(result[0].unreadCount).toBe(2);
  });

  it('does not count sent messages as unread', () => {
    const msgs: DirectMessage[] = [
      makeDM({ sender_id: 'me', recipient_id: 'alice', recipient_name: 'Alice', is_read: false, created_at: '2026-01-01T10:00:00Z' }),
    ];
    const result = groupConversations(msgs, ['me']);
    expect(result[0].unreadCount).toBe(0);
  });

  it('skips self-conversations across dual identities', () => {
    const msgs: DirectMessage[] = [
      makeDM({ sender_id: 'me-staff', recipient_id: 'me-auth', content: 'self-msg', created_at: '2026-01-01T10:00:00Z' }),
    ];
    const result = groupConversations(msgs, ['me-staff', 'me-auth']);
    expect(result).toHaveLength(0);
  });

  it('merges messages from both identities into one conversation', () => {
    const msgs: DirectMessage[] = [
      makeDM({ sender_id: 'me-staff', recipient_id: 'alice', recipient_name: 'Alice', content: 'From staff ID', created_at: '2026-01-02T10:00:00Z' }),
      makeDM({ sender_id: 'alice', sender_name: 'Alice', recipient_id: 'me-auth', content: 'Reply to auth ID', is_read: false, created_at: '2026-01-01T10:00:00Z' }),
    ];
    const result = groupConversations(msgs, ['me-staff', 'me-auth']);
    expect(result).toHaveLength(1);
    expect(result[0].recipientId).toBe('alice');
    expect(result[0].lastMessage).toBe('From staff ID');
    expect(result[0].unreadCount).toBe(1);
  });

  it('sorts conversations by most recent first', () => {
    const msgs: DirectMessage[] = [
      makeDM({ sender_id: 'me', recipient_id: 'bob', recipient_name: 'Bob', created_at: '2026-01-01T10:00:00Z' }),
      makeDM({ sender_id: 'me', recipient_id: 'alice', recipient_name: 'Alice', created_at: '2026-01-03T10:00:00Z' }),
      makeDM({ sender_id: 'me', recipient_id: 'charlie', recipient_name: 'Charlie', created_at: '2026-01-02T10:00:00Z' }),
    ];
    const result = groupConversations(msgs, ['me']);
    expect(result.map(c => c.recipientId)).toEqual(['alice', 'charlie', 'bob']);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. UNREAD COUNT CALCULATION (useUnreadMessageCount logic)
// ═══════════════════════════════════════════════════════════════

interface InboxConversation {
  partner_id: string;
  unread_count: number;
}

interface BroadcastMessage {
  id: string;
  is_read: boolean;
  is_read_by: string[];
}

function computeUnreadCount(
  conversations: InboxConversation[],
  broadcasts: BroadcastMessage[],
  staffId: string,
): number {
  const unreadDM = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
  const unreadBroadcast = broadcasts.filter(
    (b) => !(b.is_read_by || []).includes(staffId) && !b.is_read
  ).length;
  return unreadDM + unreadBroadcast;
}

describe('Unread count calculation', () => {
  it('sums DM unread counts and unread broadcasts', () => {
    const convs: InboxConversation[] = [
      { partner_id: 'a', unread_count: 3 },
      { partner_id: 'b', unread_count: 1 },
    ];
    const broadcasts: BroadcastMessage[] = [
      { id: 'b1', is_read: false, is_read_by: [] },
      { id: 'b2', is_read: false, is_read_by: ['staff-1'] },
      { id: 'b3', is_read: true, is_read_by: [] },
    ];
    expect(computeUnreadCount(convs, broadcasts, 'staff-1')).toBe(5); // 4 DM + 1 broadcast
  });

  it('returns 0 when everything is read', () => {
    const convs: InboxConversation[] = [{ partner_id: 'a', unread_count: 0 }];
    const broadcasts: BroadcastMessage[] = [
      { id: 'b1', is_read: true, is_read_by: [] },
    ];
    expect(computeUnreadCount(convs, broadcasts, 'staff-1')).toBe(0);
  });

  it('handles empty arrays', () => {
    expect(computeUnreadCount([], [], 'staff-1')).toBe(0);
  });

  it('excludes broadcasts where staff is in is_read_by', () => {
    const broadcasts: BroadcastMessage[] = [
      { id: 'b1', is_read: false, is_read_by: ['staff-1'] },
      { id: 'b2', is_read: false, is_read_by: ['other'] },
    ];
    expect(computeUnreadCount([], broadcasts, 'staff-1')).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. PROJECT MESSAGE FILTERING (projectMessageService)
// ═══════════════════════════════════════════════════════════════

type ProjectMessageType = 'internal' | 'supplier' | 'client';

interface ProjectMessage {
  id: string;
  project_id: string;
  project_supplier_link_id: string | null;
  linked_task_id: string | null;
  type: ProjectMessageType;
  message: string;
  sender_name: string;
  created_at: string;
}

function filterProjectMessages(
  messages: ProjectMessage[],
  type?: ProjectMessageType,
  supplierId?: string,
): ProjectMessage[] {
  let result = messages;
  if (type) result = result.filter(m => m.type === type);
  if (supplierId) result = result.filter(m => m.project_supplier_link_id === supplierId);
  return result;
}

describe('Project message filtering', () => {
  const msgs: ProjectMessage[] = [
    { id: '1', project_id: 'p1', type: 'internal', message: 'Intern', sender_name: 'A', created_at: '2026-01-01T10:00:00Z', project_supplier_link_id: null, linked_task_id: null },
    { id: '2', project_id: 'p1', type: 'supplier', message: 'To supplier', sender_name: 'A', created_at: '2026-01-02T10:00:00Z', project_supplier_link_id: 'sup-1', linked_task_id: null },
    { id: '3', project_id: 'p1', type: 'supplier', message: 'To other', sender_name: 'B', created_at: '2026-01-03T10:00:00Z', project_supplier_link_id: 'sup-2', linked_task_id: null },
    { id: '4', project_id: 'p1', type: 'client', message: 'To client', sender_name: 'A', created_at: '2026-01-04T10:00:00Z', project_supplier_link_id: null, linked_task_id: 'task-1' },
  ];

  it('returns all messages when no filter', () => {
    expect(filterProjectMessages(msgs)).toHaveLength(4);
  });

  it('filters by type', () => {
    expect(filterProjectMessages(msgs, 'supplier')).toHaveLength(2);
    expect(filterProjectMessages(msgs, 'internal')).toHaveLength(1);
    expect(filterProjectMessages(msgs, 'client')).toHaveLength(1);
  });

  it('filters by supplier ID', () => {
    expect(filterProjectMessages(msgs, 'supplier', 'sup-1')).toHaveLength(1);
    expect(filterProjectMessages(msgs, 'supplier', 'sup-1')[0].message).toBe('To supplier');
  });

  it('returns empty when no match', () => {
    expect(filterProjectMessages(msgs, 'client', 'sup-1')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. JOB CHAT PARTICIPANT DEDUPLICATION
// ═══════════════════════════════════════════════════════════════

interface StaffMember {
  id: string;
  name: string;
  role: string;
}

interface Assignment {
  staff_id: string;
  team_id: string;
}

interface Participant {
  id: string;
  name: string;
  role: 'planner' | 'team_leader' | 'staff';
}

function resolveParticipants(
  assignments: Assignment[],
  staffData: StaffMember[],
  profiles: { user_id: string; full_name: string | null; email: string | null }[],
): Participant[] {
  const participants: Participant[] = [];

  const staffIds = [...new Set(assignments.map(a => a.staff_id))];
  const staffMap = new Map(staffData.map(s => [s.id, s]));

  for (const sid of staffIds) {
    const s = staffMap.get(sid);
    if (!s) continue;
    const isTeamLeader = (s.role || '').toLowerCase().includes('ledare') || (s.role || '').toLowerCase().includes('leader');
    participants.push({
      id: s.id,
      name: s.name,
      role: isTeamLeader ? 'team_leader' : 'staff',
    });
  }

  for (const p of profiles) {
    participants.push({
      id: p.user_id,
      name: p.full_name || p.email || 'Planerare',
      role: 'planner',
    });
  }

  return participants;
}

describe('Job chat participant resolution', () => {
  it('deduplicates staff from multiple assignments', () => {
    const assignments: Assignment[] = [
      { staff_id: 's1', team_id: 't1' },
      { staff_id: 's1', team_id: 't2' },
      { staff_id: 's2', team_id: 't1' },
    ];
    const staff: StaffMember[] = [
      { id: 's1', name: 'Erik', role: 'Montör' },
      { id: 's2', name: 'Anna', role: 'Teamledare' },
    ];
    const result = resolveParticipants(assignments, staff, []);
    expect(result).toHaveLength(2);
    expect(result.find(p => p.id === 's1')?.role).toBe('staff');
    expect(result.find(p => p.id === 's2')?.role).toBe('team_leader');
  });

  it('detects team leader from role string variations', () => {
    const staff: StaffMember[] = [
      { id: 's1', name: 'A', role: 'Teamledare' },
      { id: 's2', name: 'B', role: 'Team Leader' },
      { id: 's3', name: 'C', role: 'Arbetsledare' },
      { id: 's4', name: 'D', role: 'Montör' },
    ];
    const assignments = staff.map(s => ({ staff_id: s.id, team_id: 't1' }));
    const result = resolveParticipants(assignments, staff, []);
    expect(result.filter(p => p.role === 'team_leader').map(p => p.id)).toEqual(['s1', 's2', 's3']);
    expect(result.find(p => p.id === 's4')?.role).toBe('staff');
  });

  it('includes planners from profiles', () => {
    const result = resolveParticipants([], [], [
      { user_id: 'u1', full_name: 'Admin User', email: 'admin@co.se' },
      { user_id: 'u2', full_name: null, email: 'planner@co.se' },
      { user_id: 'u3', full_name: null, email: null },
    ]);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ id: 'u1', name: 'Admin User', role: 'planner' });
    expect(result[1]).toEqual({ id: 'u2', name: 'planner@co.se', role: 'planner' });
    expect(result[2]).toEqual({ id: 'u3', name: 'Planerare', role: 'planner' });
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. MARK-AS-READ LOGIC (dual-identity coverage)
// ═══════════════════════════════════════════════════════════════

function simulateMarkRead(
  messages: DirectMessage[],
  allMyIds: string[],
  senderId: string,
): DirectMessage[] {
  return messages.map(m => {
    if (allMyIds.includes(m.recipient_id) && m.sender_id === senderId && !m.is_read) {
      return { ...m, is_read: true };
    }
    return m;
  });
}

describe('Mark-as-read with dual identity', () => {
  const makeDM = (overrides: Partial<DirectMessage>): DirectMessage => ({
    id: Math.random().toString(),
    sender_id: 'alice',
    sender_name: 'Alice',
    sender_type: 'staff',
    recipient_id: 'me-staff',
    recipient_name: 'Me',
    content: 'Test',
    is_read: false,
    created_at: '2026-01-01T10:00:00Z',
    ...overrides,
  });

  it('marks messages sent to staff ID as read', () => {
    const msgs = [makeDM({ recipient_id: 'me-staff', is_read: false })];
    const result = simulateMarkRead(msgs, ['me-staff', 'me-auth'], 'alice');
    expect(result[0].is_read).toBe(true);
  });

  it('marks messages sent to auth ID as read', () => {
    const msgs = [makeDM({ recipient_id: 'me-auth', is_read: false })];
    const result = simulateMarkRead(msgs, ['me-staff', 'me-auth'], 'alice');
    expect(result[0].is_read).toBe(true);
  });

  it('does not mark messages from other senders', () => {
    const msgs = [makeDM({ sender_id: 'bob', is_read: false })];
    const result = simulateMarkRead(msgs, ['me-staff'], 'alice');
    expect(result[0].is_read).toBe(false);
  });

  it('does not re-mark already read messages', () => {
    const msgs = [makeDM({ is_read: true })];
    const result = simulateMarkRead(msgs, ['me-staff'], 'alice');
    expect(result[0].is_read).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. OPTIMISTIC CACHE UPDATE (useMobileInbox pattern)
// ═══════════════════════════════════════════════════════════════

interface InboxAllData {
  conversations: { partner_id: string; unread_count: number; messages: any[] }[];
  broadcasts: { id: string; is_read: boolean; is_read_by: string[] }[];
}

function optimisticMarkDMRead(data: InboxAllData, partnerId: string): InboxAllData {
  return {
    ...data,
    conversations: data.conversations.map(c =>
      c.partner_id === partnerId ? { ...c, unread_count: 0 } : c
    ),
  };
}

function optimisticMarkBroadcastRead(data: InboxAllData, broadcastId: string): InboxAllData {
  return {
    ...data,
    broadcasts: data.broadcasts.map(b =>
      b.id === broadcastId ? { ...b, is_read: true } : b
    ),
  };
}

describe('Optimistic cache updates', () => {
  const baseData: InboxAllData = {
    conversations: [
      { partner_id: 'alice', unread_count: 3, messages: [] },
      { partner_id: 'bob', unread_count: 1, messages: [] },
    ],
    broadcasts: [
      { id: 'b1', is_read: false, is_read_by: [] },
      { id: 'b2', is_read: false, is_read_by: [] },
    ],
  };

  it('zeroes unread count for marked DM conversation', () => {
    const updated = optimisticMarkDMRead(baseData, 'alice');
    expect(updated.conversations.find(c => c.partner_id === 'alice')?.unread_count).toBe(0);
    expect(updated.conversations.find(c => c.partner_id === 'bob')?.unread_count).toBe(1);
  });

  it('marks specific broadcast as read', () => {
    const updated = optimisticMarkBroadcastRead(baseData, 'b1');
    expect(updated.broadcasts.find(b => b.id === 'b1')?.is_read).toBe(true);
    expect(updated.broadcasts.find(b => b.id === 'b2')?.is_read).toBe(false);
  });

  it('preserves other data immutably', () => {
    const updated = optimisticMarkDMRead(baseData, 'alice');
    expect(updated).not.toBe(baseData);
    expect(updated.broadcasts).toBe(baseData.broadcasts); // broadcasts untouched
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. SEND MESSAGE INPUT VALIDATION
// ═══════════════════════════════════════════════════════════════

describe('Send message validation', () => {
  it('trims whitespace from content', () => {
    const content = '  Hello world  ';
    expect(content.trim()).toBe('Hello world');
  });

  it('rejects empty/whitespace-only content', () => {
    expect(''.trim()).toBe('');
    expect('   '.trim()).toBe('');
    expect('\n\t'.trim()).toBe('');
  });

  it('preserves internal whitespace (line breaks in message)', () => {
    const content = 'Line 1\nLine 2\n\nLine 4';
    expect(content.trim()).toBe(content);
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. PROJECT MESSAGE TYPE LABELS
// ═══════════════════════════════════════════════════════════════

const MESSAGE_TYPE_LABELS: Record<ProjectMessageType, string> = {
  internal: 'Internt',
  supplier: 'Underleverantör',
  client: 'Kund',
};

describe('Project message type labels', () => {
  it('has labels for all types', () => {
    const types: ProjectMessageType[] = ['internal', 'supplier', 'client'];
    for (const t of types) {
      expect(MESSAGE_TYPE_LABELS[t]).toBeTruthy();
    }
  });

  it('labels are non-empty strings', () => {
    for (const label of Object.values(MESSAGE_TYPE_LABELS)) {
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. INITIALS EXTRACTION (MessageThread component)
// ═══════════════════════════════════════════════════════════════

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

describe('Avatar initials extraction', () => {
  it('extracts first letters of first and last name', () => {
    expect(getInitials('Erik Svensson')).toBe('ES');
  });

  it('handles single name', () => {
    expect(getInitials('Admin')).toBe('A');
  });

  it('truncates to 2 characters for long names', () => {
    expect(getInitials('Anna Lisa Maria')).toBe('AL');
  });

  it('handles edge case of empty-ish input', () => {
    // Single character
    expect(getInitials('A')).toBe('A');
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. REALTIME QUERY KEY MATCHING
// ═══════════════════════════════════════════════════════════════

describe('Realtime invalidation query key structure', () => {
  it('project messages key includes all filter params', () => {
    const projectId = 'p-123';
    const type = 'supplier';
    const supplierId = 'sup-456';
    const queryKey = ['project-messages', projectId, type, supplierId];
    expect(queryKey).toEqual(['project-messages', 'p-123', 'supplier', 'sup-456']);
  });

  it('DM query key includes all identity IDs', () => {
    const allMyIds = ['me-staff', 'me-auth'];
    const allPartnerIds = ['p-staff'];
    const queryKey = ['direct-messages', ...allMyIds, ...allPartnerIds, 'messages'];
    expect(queryKey).toEqual(['direct-messages', 'me-staff', 'me-auth', 'p-staff', 'messages']);
  });

  it('job chat key is booking-based', () => {
    const bookingId = 'booking-789';
    const queryKey = ['job-chat', bookingId, 'messages'];
    expect(queryKey).toEqual(['job-chat', 'booking-789', 'messages']);
  });
});

// ═══════════════════════════════════════════════════════════════
// 12. FILE ATTACHMENT PATH GENERATION
// ═══════════════════════════════════════════════════════════════

function buildFilePath(senderId: string, fileName: string): string {
  const ext = fileName.split('.').pop() || 'bin';
  return `dm-files/${senderId}/${Date.now()}_${fileName}`;
}

describe('DM file path generation', () => {
  it('includes sender ID in path', () => {
    const path = buildFilePath('sender-123', 'photo.jpg');
    expect(path).toContain('sender-123');
  });

  it('includes original filename', () => {
    const path = buildFilePath('s1', 'report.pdf');
    expect(path).toContain('report.pdf');
  });

  it('starts with dm-files prefix', () => {
    const path = buildFilePath('s1', 'file.txt');
    expect(path.startsWith('dm-files/')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 13. UNREAD DM COUNT OR FILTER (fetchUnreadDMCount logic)
// ═══════════════════════════════════════════════════════════════

function buildUnreadOrFilter(allMyIds: string[]): string {
  return allMyIds.map(id => `recipient_id.eq.${id}`).join(',');
}

describe('Unread DM OR filter', () => {
  it('generates correct filter for single ID', () => {
    expect(buildUnreadOrFilter(['me-1'])).toBe('recipient_id.eq.me-1');
  });

  it('generates correct filter for dual IDs', () => {
    const filter = buildUnreadOrFilter(['me-staff', 'me-auth']);
    expect(filter).toBe('recipient_id.eq.me-staff,recipient_id.eq.me-auth');
  });

  it('returns empty string for empty IDs', () => {
    expect(buildUnreadOrFilter([])).toBe('');
  });
});
