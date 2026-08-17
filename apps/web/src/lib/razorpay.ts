declare global {
  interface Window { Razorpay: any }
}

let scriptPromise: Promise<void> | null = null

function loadRazorpayScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.Razorpay) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Could not load payment gateway'))
      document.body.appendChild(script)
    })
  }
  return scriptPromise
}

export interface RazorpaySuccess {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

interface OpenCheckoutParams {
  orderId: string
  amountRupees: number
  description: string
  prefillContact?: string
  onSuccess: (resp: RazorpaySuccess) => void
  onDismiss?: () => void
}

export async function openRazorpayCheckout(params: OpenCheckoutParams) {
  await loadRazorpayScript()
  const rzp = new window.Razorpay({
    key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    order_id: params.orderId,
    amount: Math.round(params.amountRupees * 100),
    currency: 'INR',
    name: 'RideApp',
    description: params.description,
    prefill: params.prefillContact ? { contact: params.prefillContact } : undefined,
    theme: { color: '#ea580c' },
    handler: (resp: RazorpaySuccess) => params.onSuccess(resp),
    modal: { ondismiss: () => params.onDismiss?.() },
  })
  rzp.open()
}
