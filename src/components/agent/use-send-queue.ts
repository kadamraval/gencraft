import * as React from "react"

/**
 * Words written while a turn is still running wait their turn instead of being lost or cutting it off. They are sent one
 * after another as each turn ends, and each can be taken back before then.
 */
export function useSendQueue<T extends object>(busy: boolean, send: (item: T) => void) {
  const [queue, setQueue] = React.useState<Array<T & { queueId: string }>>([])
  const busyRef = React.useRef(busy)
  busyRef.current = busy
  const sendRef = React.useRef(send)
  sendRef.current = send

  /** Sends now when idle; otherwise queues */
  const push = React.useCallback((item: T) => {
    if (busyRef.current) setQueue((q) => [...q, { ...item, queueId: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }])
    else sendRef.current(item)
  }, [])

  const remove = React.useCallback((queueId: string) => setQueue((q) => q.filter((x) => x.queueId !== queueId)), [])

  React.useEffect(() => {
    if (busy || queue.length === 0) return
    const [first, ...rest] = queue
    setQueue(rest)
    sendRef.current(first!)
  }, [busy, queue])

  return { queue, push, remove }
}
