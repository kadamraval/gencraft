import * as React from "react"
import type { ChatMessage } from "@/types"
import { decodeUrls, encodeUrls } from "@/lib/library/results-store"

/**
 * Past chat and agent conversations, kept on this device. Generated files are not copied in: a conversation
 * points at the stored results, which also fill the Library, so deleting a conversation never deletes media.
 */

export type ConversationKind = "chat" | "agent"

export interface Conversation {
  id: string
  kind: ConversationKind
  title: string
  messages: ChatMessage[]
  /** An agent conversation's chat messages (AI SDK parts). Older agent conversations have none and keep their steps list. */
  ui?: unknown[]
  projectId?: string
  createdAt: number
  updatedAt: number
}

export type ConversationSummary = Omit<Conversation, "messages" | "ui"> & { count: number }

const DB_NAME = "gencraft-history"
const STORE = "conversations"

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** A reply that was still running when the app closed cannot finish, so it is saved as interrupted. */
function settle(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => ((m.job?.status === "running" || m.job?.status === "queued") ? { ...m, job: { ...m.job, status: "failed" as const, error: "This was interrupted when the app closed." } } : m))
}

export const titleOf = (messages: ChatMessage[]): string => {
  const first = messages.find((m) => m.role === "user")?.content.trim().replace(/\s+/g, " ") ?? ""
  return first.length > 60 ? `${first.slice(0, 57)}...` : first || "Untitled"
}

export async function saveConversation(c: Conversation): Promise<void> {
  const record: Conversation = { ...c, messages: encodeUrls(settle(c.messages)) }
  try {
    await tx("readwrite", (s) => s.put(record))
    emit()
  } catch {
    // storage refused: the conversation stays in memory for this session
  }
}

export async function loadConversation(id: string): Promise<Conversation | null> {
  try {
    const c = await tx<Conversation | undefined>("readonly", (s) => s.get(id))
    return c ? { ...c, messages: await decodeUrls(c.messages) } : null
  } catch {
    return null
  }
}

export async function listConversations(): Promise<ConversationSummary[]> {
  try {
    const rows = await tx<Conversation[]>("readonly", (s) => s.getAll())
    return rows.map(({ messages, ui, ...rest }) => ({ ...rest, count: ui?.length ?? messages.length })).sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

export async function renameConversation(id: string, title: string): Promise<void> {
  try {
    const c = await tx<Conversation | undefined>("readonly", (s) => s.get(id))
    if (c) await tx("readwrite", (s) => s.put({ ...c, title: title.trim() || c.title }))
    emit()
  } catch {
    // nothing to rename
  }
}

export async function removeConversations(ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await tx("readwrite", (s) => s.delete(id))
    } catch {
      // already gone
    }
  }
  emit()
}

export function useConversations(): ConversationSummary[] {
  const [rows, setRows] = React.useState<ConversationSummary[]>([])
  React.useEffect(() => {
    let alive = true
    const load = () => void listConversations().then((r) => alive && setRows(r))
    load()
    listeners.add(load)
    return () => {
      alive = false
      listeners.delete(load)
    }
  }, [])
  return rows
}

/** Deletes chats and agent runs not touched for `days` days. */
export async function removeOlderThan(days: number): Promise<number> {
  const cutoff = Date.now() - days * 86400000
  const old = (await listConversations()).filter((c) => c.updatedAt < cutoff).map((c) => c.id)
  if (old.length > 0) await removeConversations(old)
  return old.length
}
