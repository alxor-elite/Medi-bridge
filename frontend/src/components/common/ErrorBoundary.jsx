import { Component } from 'react'
import { ErrorState } from '../ui/ErrorState'

/** Catches render-time errors so a single broken view can't blank the app. */
export class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    // Surfaced in dev; wire to a logging service when the backend exists.
    if (import.meta.env?.DEV) console.error('ErrorBoundary caught:', error)
  }

  handleReset = () => {
    this.setState({ hasError: false })
    window.location.assign('/')
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-slate-50">
          <ErrorState
            title="Application error"
            description="An unexpected error occurred. Return home to continue."
            onRetry={this.handleReset}
          />
        </div>
      )
    }
    return this.props.children
  }
}
