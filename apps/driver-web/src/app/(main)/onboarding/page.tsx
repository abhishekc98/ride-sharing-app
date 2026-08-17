'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useDriverStore } from '@/stores/driverStore'

const VEHICLE_TYPES = [
  { value: 'bike' as const, label: 'Bike', emoji: '🛵' },
  { value: 'auto' as const, label: 'Auto', emoji: '🛺' },
  { value: 'cab' as const, label: 'Cab', emoji: '🚗' },
]

const DOC_TYPES = [
  { key: 'selfie', label: 'Selfie', hint: 'Clear photo of your face' },
  { key: 'license', label: "Driver's licence", hint: 'Front side, all corners visible' },
  { key: 'rc', label: 'Vehicle RC', hint: 'Registration certificate' },
  { key: 'insurance', label: 'Insurance', hint: 'Valid policy document' },
] as const

export default function OnboardingPage() {
  const router = useRouter()
  const { user } = useDriverStore()
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<'vehicle' | 'kyc' | 'review' | 'rejected'>('vehicle')

  const [vehicle, setVehicle] = useState({ type: 'bike' as 'bike' | 'auto' | 'cab', make: '', model: '', year: '', plateNo: '', color: '' })
  const [savingVehicle, setSavingVehicle] = useState(false)
  const [vehicleError, setVehicleError] = useState('')

  const [docs, setDocs] = useState<Record<string, 'idle' | 'uploading' | 'done'>>({
    selfie: 'idle', license: 'idle', rc: 'idle', insurance: 'idle',
  })

  const refreshDriverState = useCallback(async () => {
    let driver: any = null
    try {
      const res = await api.get('/api/v1/drivers/me')
      driver = res.data.data
    } catch (err: any) {
      if (err.response?.status === 404) {
        await api.post('/api/v1/drivers/register')
        setLoading(false)
        return
      }
      throw err
    }

    if (driver.kyc_status === 'approved') { router.replace('/home'); return }
    if (driver.kyc_status === 'rejected') { setStep('rejected'); setLoading(false); return }

    if (!driver.vehicle_type) {
      setStep('vehicle')
    } else if (driver.kyc_status === 'submitted') {
      setStep('review')
    } else {
      setDocs((d) => {
        const next = { ...d }
        for (const key of Object.keys(driver.kyc_docs ?? {})) {
          const docKey = key.replace('Url', '')
          if (docKey in next) next[docKey] = 'done'
        }
        return next
      })
      setStep('kyc')
    }
    setLoading(false)
  }, [router])

  useEffect(() => { refreshDriverState().catch(() => setLoading(false)) }, [refreshDriverState])

  // While waiting on review, poll for a decision — no push notification
  // wired up for KYC status changes yet, so this is the only way the driver
  // finds out without manually reopening the app.
  useEffect(() => {
    if (step !== 'review') return
    const id = setInterval(() => { refreshDriverState().catch(() => {}) }, 6000)
    return () => clearInterval(id)
  }, [step, refreshDriverState])

  const saveVehicle = async () => {
    setVehicleError('')
    if (!vehicle.make || !vehicle.model || !vehicle.year || !vehicle.plateNo || !vehicle.color) {
      setVehicleError('Fill in every field')
      return
    }
    setSavingVehicle(true)
    try {
      await api.post('/api/v1/drivers/me/vehicle', { ...vehicle, year: Number(vehicle.year) })
      setStep('kyc')
    } catch (err: any) {
      setVehicleError(err.response?.data?.error ?? 'Could not save vehicle')
    } finally {
      setSavingVehicle(false)
    }
  }

  const uploadDoc = async (docKey: string, file: File) => {
    setDocs((d) => ({ ...d, [docKey]: 'uploading' }))
    const form = new FormData()
    form.append('file', file)
    try {
      await api.post(`/api/v1/drivers/me/kyc/upload?type=${docKey}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setDocs((d) => ({ ...d, [docKey]: 'done' }))
    } catch {
      setDocs((d) => ({ ...d, [docKey]: 'idle' }))
      alert('Upload failed — try again')
    }
  }

  const allDocsUploaded = Object.values(docs).every((s) => s === 'done')

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-900">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white px-6 py-8">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-2 mb-8">
          <span className="text-2xl">🛵</span>
          <span className="font-bold text-lg">Driver Setup</span>
        </div>

        {/* Progress */}
        {(step === 'vehicle' || step === 'kyc') && (
          <div className="flex gap-2 mb-8">
            <div className={`h-1.5 flex-1 rounded-full ${step === 'vehicle' || step === 'kyc' ? 'bg-orange-500' : 'bg-gray-700'}`} />
            <div className={`h-1.5 flex-1 rounded-full ${step === 'kyc' ? 'bg-orange-500' : 'bg-gray-700'}`} />
          </div>
        )}

        {step === 'vehicle' && (
          <div>
            <h1 className="text-2xl font-bold mb-1">Your vehicle</h1>
            <p className="text-gray-400 text-sm mb-6">Tell us what you'll be driving</p>

            <div className="flex gap-2 mb-4">
              {VEHICLE_TYPES.map((v) => (
                <button key={v.value} onClick={() => setVehicle((s) => ({ ...s, type: v.value }))}
                  className={`flex-1 border-2 rounded-2xl py-3 text-center transition-all ${
                    vehicle.type === v.value ? 'border-orange-500 bg-orange-500/10' : 'border-gray-700'
                  }`}>
                  <div className="text-2xl mb-1">{v.emoji}</div>
                  <div className={`text-xs font-bold ${vehicle.type === v.value ? 'text-orange-400' : 'text-gray-400'}`}>{v.label}</div>
                </button>
              ))}
            </div>

            <div className="space-y-3 mb-2">
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Make (e.g. Honda)" value={vehicle.make}
                  onChange={(e) => setVehicle((s) => ({ ...s, make: e.target.value }))}
                  className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                <input placeholder="Model" value={vehicle.model}
                  onChange={(e) => setVehicle((s) => ({ ...s, model: e.target.value }))}
                  className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Year" inputMode="numeric" value={vehicle.year}
                  onChange={(e) => setVehicle((s) => ({ ...s, year: e.target.value.replace(/\D/g, '') }))}
                  className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                <input placeholder="Colour" value={vehicle.color}
                  onChange={(e) => setVehicle((s) => ({ ...s, color: e.target.value }))}
                  className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <input placeholder="Plate number" value={vehicle.plateNo}
                onChange={(e) => setVehicle((s) => ({ ...s, plateNo: e.target.value.toUpperCase() }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            {vehicleError && <p className="text-red-400 text-sm mb-3">{vehicleError}</p>}

            <button onClick={saveVehicle} disabled={savingVehicle}
              className="w-full bg-orange-500 hover:bg-orange-600 rounded-2xl py-4 font-bold mt-4 disabled:opacity-50">
              {savingVehicle ? 'Saving…' : 'Continue'}
            </button>
          </div>
        )}

        {step === 'kyc' && (
          <div>
            <h1 className="text-2xl font-bold mb-1">Verify your identity</h1>
            <p className="text-gray-400 text-sm mb-6">Upload all four documents to submit for review</p>

            <div className="space-y-3 mb-6">
              {DOC_TYPES.map((d) => (
                <label key={d.key}
                  className={`flex items-center gap-3 border-2 rounded-2xl p-4 cursor-pointer transition-all ${
                    docs[d.key] === 'done' ? 'border-green-600 bg-green-600/10' : 'border-gray-700 bg-gray-800/50'
                  }`}>
                  <span className="text-2xl shrink-0">
                    {docs[d.key] === 'done' ? '✅' : docs[d.key] === 'uploading' ? '⏳' : '📄'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm">{d.label}</p>
                    <p className="text-xs text-gray-400">{d.hint}</p>
                  </div>
                  <input type="file" accept="image/*" className="hidden"
                    disabled={docs[d.key] === 'uploading'}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(d.key, f) }} />
                  <span className="text-xs font-bold text-orange-400 shrink-0">
                    {docs[d.key] === 'done' ? 'Replace' : 'Upload'}
                  </span>
                </label>
              ))}
            </div>

            <button onClick={() => setStep('review')} disabled={!allDocsUploaded}
              className="w-full bg-orange-500 hover:bg-orange-600 rounded-2xl py-4 font-bold disabled:opacity-40">
              Submit for review
            </button>
          </div>
        )}

        {step === 'review' && (
          <div className="text-center pt-12">
            <div className="text-6xl mb-6">🕐</div>
            <h1 className="text-2xl font-bold mb-2">Under review</h1>
            <p className="text-gray-400 text-sm max-w-xs mx-auto mb-8">
              We're checking your documents. This usually takes a little while — you'll be able to go online
              the moment you're approved.
            </p>
            <button onClick={() => refreshDriverState()}
              className="text-orange-400 font-bold text-sm">
              Check status
            </button>
          </div>
        )}

        {step === 'rejected' && (
          <div className="text-center pt-12">
            <div className="text-6xl mb-6">⚠️</div>
            <h1 className="text-2xl font-bold mb-2">Verification failed</h1>
            <p className="text-gray-400 text-sm max-w-xs mx-auto mb-8">
              One or more documents couldn't be verified. Please re-upload clearer copies.
            </p>
            <button onClick={() => { setDocs({ selfie: 'idle', license: 'idle', rc: 'idle', insurance: 'idle' }); setStep('kyc') }}
              className="w-full bg-orange-500 hover:bg-orange-600 rounded-2xl py-4 font-bold">
              Re-upload documents
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
