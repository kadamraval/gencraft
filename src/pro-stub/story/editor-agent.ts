import type { LanguageModel } from "ai"
import type { EditProject } from "@/components/story/edit-model"
import type { StoryItem } from "@/components/story/types"
import type { EditorHost, EditorMaking, EditorRun } from "@/components/story/editor-types"

/** Stands in for the editing agent in the community build: it changes nothing and says why. */
export async function runEditor(_model: LanguageModel, _story: StoryItem, project: EditProject, _request: string, _making?: EditorMaking, _host?: EditorHost): Promise<EditorRun> {
  return { text: "The editing agent is part of the paid Gencraft plan and is not in the community build.", project, changes: [] }
}
