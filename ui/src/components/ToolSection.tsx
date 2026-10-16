import { Component, ReactNode, Suspense, useState } from 'react'
class ToolBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <p role="alert">
        This tool could not load. <button onClick={() => this.setState({ failed: false })}>Retry tool</button>
      </p>
    ) : (
      this.props.children
    )
  }
}
export default function ToolSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="tool-section">
      <button className="tool-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {title}
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="tool-content">
          <ToolBoundary>
            <Suspense fallback={<p role="status">Loading {title.toLowerCase()}…</p>}>{children}</Suspense>
          </ToolBoundary>
        </div>
      )}
    </section>
  )
}
