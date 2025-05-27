import { useCallback, useState } from 'react'
import { toast } from 'sonner'

export const useStaffOperations = (currentDate: Date) => {
  const [processingStaffIds, setProcessingStaffIds] = useState<string[]>([])

  const handleStaffDrop = useCallback(async (
    staffId: string,
    newTeamId: string | null,
    oldTeamId?: string | null
  ) => {
    if (!staffId) return

    setProcessingStaffIds(prev => [...prev, staffId])

    const dateStr = currentDate.toISOString().split('T')[0]

    const changeType = !oldTeamId && newTeamId ? 'assign'
                     : oldTeamId && !newTeamId ? 'remove'
                     : 'move'

    try {
      const toastId = toast.loading(
        changeType === 'remove'
          ? 'Removing staff assignment...'
          : changeType === 'assign'
          ? 'Assigning staff...'
          : 'Moving staff...'
      )

      const response = await fetch('https://gpgbmopqqpvkvbfycyqm.supabase.co/functions/v1/staff-assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'api-12345678'
        },
        body: JSON.stringify({
          staffId,
          oldTeamId,
          newTeamId,
          date: dateStr,
          changeType
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Unknown error')
      }

      toast.success(`Staff ${changeType} successful`, { id: toastId })

      // 🔁 Viktigt: Signalera att kalendern ska uppdateras
      window.dispatchEvent(new Event('staff-assignment-updated'))

    } catch (error) {
      toast.error('Failed to update assignment')
      console.error(error)
    } finally {
      setProcessingStaffIds(prev => prev.filter(id => id !== staffId))
    }
  }, [currentDate])

  return {
    processingStaffIds,
    handleStaffDrop
  }
}
