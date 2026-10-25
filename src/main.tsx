import React from "react"
import ReactDOM from "react-dom/client"
import { migrateLegacyNames } from "./lib/legacy-names"
import "./index.css"
import "streamdown/styles.css"
import "katex/dist/katex.min.css"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Unhandled Studio Error:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-10 text-destructive bg-background min-h-screen font-sans flex flex-col justify-center items-center">
          <div className="max-w-2xl w-full space-y-4">
            <h2 className="text-xl font-bold text-destructive">Application Encountered an Error</h2>
            <pre className="bg-card p-4 rounded-lg overflow-x-auto text-xs text-destructive border border-border">
              {this.state.error?.stack || this.state.error?.message}
            </pre>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Reload Studio
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const rootElement = document.getElementById("root")
if (!rootElement) {
  throw new Error("Failed to find the root element")
}

// What an earlier version saved under the old names is moved first; the app is loaded only afterwards so nothing reads the old places
async function start(root: HTMLElement) {
  await migrateLegacyNames()
  const { default: App } = await import("./App")
  // One root for the page's life, so a hot reload in development renders into it instead of making a second
  const holder = root as HTMLElement & { __root?: ReactDOM.Root }
  holder.__root ??= ReactDOM.createRoot(root)
  holder.__root.render(
    <React.StrictMode>
      <RootErrorBoundary>
        <TooltipProvider delayDuration={150}>
          <App />
        </TooltipProvider>
      </RootErrorBoundary>
    </React.StrictMode>
  )
}
void start(rootElement)
