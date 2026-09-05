import { useState } from 'react'

export default function VerificationReview({ user, accessKey, onReviewed }) {
  const [submission, setSubmission] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [checked, setChecked] = useState(false)

  async function request(options = {}) {
    const response = await fetch(`/api/admin/verifications/${user.id}`, {
      method: options.method || 'GET',
      headers: { 'X-Admin-Key': accessKey, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'Unable to update verification.')
    return payload
  }

  async function openReview() {
    setBusy(true)
    setError('')
    try { setSubmission(await request()) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function decide(status) {
    if (busy || !checked) return
    setBusy(true)
    setError('')
    try {
      await request({ method: 'POST', body: { status, submissionId: submission.id } })
      setSubmission(null)
      setChecked(false)
      await onReviewed()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return <div className="verification-review">
    {!submission && <button type="button" className="primary-button secondary" disabled={busy} onClick={openReview}>{busy ? 'Loading documents...' : 'Review verification'}</button>}
    {submission && <section className="review-panel" aria-label={`Verification for ${user.name}`}>
      <div className="section-heading"><h2>Review identity documents</h2><button type="button" disabled={busy} onClick={() => { setSubmission(null); setChecked(false) }}>Close</button></div>
      <div className="review-documents">{[{ label: 'Identity document', name: submission.documentName, mime: submission.documentMime, data: submission.documentData }, { label: 'Face photo', name: submission.faceName, mime: submission.faceMime, data: submission.faceData }].map((file) => <figure key={file.label}><figcaption>{file.label}</figcaption>{file.mime.startsWith('image/') ? <img src={file.data} alt={file.label} /> : <a href={file.data} download={file.name}>Download PDF for review</a>}<span>{file.name}</span></figure>)}</div>
      <label className="review-confirm"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} disabled={busy} />I have reviewed both documents and checked they match this customer.</label>
      <div className="review-actions"><button type="button" className="primary-button" onClick={() => decide('Verified')} disabled={busy || !checked}>Approve verification</button><button type="button" className="primary-button secondary" onClick={() => decide('Rejected')} disabled={busy || !checked}>Request new documents</button></div>
    </section>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>
}
