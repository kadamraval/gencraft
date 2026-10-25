import { CircleHelp, Info, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { dismissNotice, useNotice, useQuestion } from "@/lib/notice"

/** The message from lib/notice, shown once at the bottom of the window. */
export function NoticeToast() {
  const message = useNotice()
  const question = useQuestion()
  return (
    <>
      <ConfirmDialog open={question !== null} title={question?.title ?? ""} description={question?.description ?? ""} confirmLabel="Run it" neutral={{ icon: CircleHelp }} onCancel={() => question?.resolve(false)} onConfirm={() => question?.resolve(true)} />
      {message && (
    <div className="fixed left-1/2 top-14 z-[80] flex max-w-md -translate-x-1/2 items-start gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs text-foreground shadow-xl">
      <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
      <span className="leading-relaxed">{message}</span>
      <Button type="button" variant="ghost" size="iconSm" aria-label="Dismiss" onClick={dismissNotice} className="-mr-1 h-5 w-5 flex-shrink-0">
        <X className="h-3 w-3" />
      </Button>
    </div>
      )}
    </>
  )
}
