import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, Textarea } from '../ui/Input'

/**
 * Confirm rejecting an organization, capturing an optional reason that is
 * recorded on the audit trail and shown to the organization.
 */
export function RejectDialog({ open, org, onClose, onConfirm, submitting }) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reject organization"
      description={org ? `Reject ${org.name}? They can re-apply with corrected details.` : undefined}
      size="md"
      footer={
        <>
          <Button variant="secondary" disabled={submitting} onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={submitting} onClick={() => onConfirm?.(reason.trim())}>
            Reject
          </Button>
        </>
      }
    >
      <Field label="Reason (optional)" htmlFor="reject-reason" hint="Shared with the organization and logged for audit.">
        <Textarea
          id="reject-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. License number could not be verified with the state registry."
          rows={4}
        />
      </Field>
    </Modal>
  )
}
