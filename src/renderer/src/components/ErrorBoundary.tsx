import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw, TriangleAlert } from 'lucide-react'

/** Without this, an error in any one view unmounts the whole window and leaves it blank. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[app] view crashed', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div className="crash empty-state" role="alert">
        <TriangleAlert size={32} strokeWidth={1.5} aria-hidden />
        <strong>Something went wrong</strong>
        <p>Your notes are saved on this computer. Reload to carry on.</p>
        <button className="empty-action" onClick={() => location.reload()}>
          <RotateCcw size={14} aria-hidden /> Reload
        </button>
      </div>
    )
  }
}
