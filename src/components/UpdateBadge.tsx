import { RefreshCw, Download, CheckCircle2, XCircle, Loader2, ArrowDownToLine } from 'lucide-react'
import { useUpdater } from '@/hooks/useUpdater'
import { Button } from '@/components/ui/button'

export default function UpdateBadge() {
  const { status, version, check, install } = useUpdater()

  if (status.state === 'idle') {
    return (
      <button
        onClick={check}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        title="Check for updates"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {version ? `v${version}` : 'Check update'}
      </button>
    )
  }

  if (status.state === 'checking') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking...
      </span>
    )
  }

  if (status.state === 'not-available') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-terminal-success">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Up to date
      </span>
    )
  }

  if (status.state === 'available') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-warning">
        <Download className="h-3.5 w-3.5" />
        v{status.version} available — downloading...
      </span>
    )
  }

  if (status.state === 'downloading') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-warning">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Downloading {status.percent ?? 0}%
      </span>
    )
  }

  if (status.state === 'downloaded') {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 border-terminal-success/50 text-terminal-success text-xs hover:bg-terminal-success/10"
        onClick={install}
      >
        <ArrowDownToLine className="h-3.5 w-3.5" />
        Restart to update v{status.version}
      </Button>
    )
  }

  // error state
  return (
    <button
      onClick={check}
      className="flex items-center gap-1.5 text-xs text-terminal-error hover:text-terminal-error/80 transition-colors"
      title={status.error ?? 'Update check failed'}
    >
      <XCircle className="h-3.5 w-3.5" />
      Update failed — retry
    </button>
  )
}
