import * as React from "react"
import type { MatchContext } from "@/lib/ai-tools/match"
import { editActionsFor } from "@/lib/registry/edit-actions"
import { enabledSet } from "@/lib/registry/enabled"
import { isRunnable } from "@/lib/registry/providers"
import { getKeyedProviders, getToolRecords, useKeyedProviders, useListedModels, useRegistry } from "@/lib/registry/store"
import type { ModelRecord } from "@/lib/registry/types"
import type { SettingsState } from "@/types"

/** What the app knows, in the shape the tool matcher wants. Not a hook: agents call it when they run. */
export function toolContextOf(listed: ModelRecord[], enabledIds: SettingsState["aiEngine"]["enabledChatModelIds"]): MatchContext {
  const on = enabledSet(listed, enabledIds)
  return {
    records: getToolRecords(),
    listed: listed.filter((r) => on.has(r.id)),
    keyed: new Set(getKeyedProviders()),
    runnable: isRunnable,
    editActions: editActionsFor(listed, on),
  }
}

/** The same, redrawn when keys or switched-on models change */
export function useToolContext(settings: SettingsState): MatchContext {
  const listed = useListedModels()
  // The tool models are not in the listed ones, so the panel also redraws when the registry or the keys change (a panel that stays open,
  // like the one in Story/Edit, would otherwise keep the picture it had when it opened)
  const all = useRegistry()
  const keyed = useKeyedProviders()
  const enabledIds = settings.aiEngine.enabledChatModelIds
  return React.useMemo(() => toolContextOf(listed, enabledIds), [listed, enabledIds, all, keyed]) // eslint-disable-line react-hooks/exhaustive-deps
}
